package om.qabnah.core

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import om.qabnah.core.model.LocationPing
import om.qabnah.core.realtime.Backoff
import om.qabnah.core.realtime.Channels
import om.qabnah.core.realtime.ConnectionState
import om.qabnah.core.realtime.RealtimeClient
import om.qabnah.core.realtime.RealtimeEvents
import om.qabnah.core.realtime.RealtimeMessage
import om.qabnah.core.realtime.deliveryLocation
import om.qabnah.core.realtime.offerOrNull
import org.junit.After
import org.junit.Before
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class RealtimeClientTest {
    private lateinit var server: MockWebServer
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val received = LinkedBlockingQueue<String>()
    private val serverSockets = CopyOnWriteArrayList<WebSocket>()

    /** Server side: acks subscriptions and then pushes a `delivery.location` event on that channel. */
    private fun serverListener(closeImmediately: Boolean = false) = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            serverSockets += webSocket
            if (closeImmediately) webSocket.close(1001, "going away")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            received += text
            val msg = QabnahJson.parseToJsonElement(text).jsonObject
            when (msg["type"]!!.jsonPrimitive.content) {
                "subscribe" -> {
                    val ch = msg["channel"]!!.jsonPrimitive.content
                    webSocket.send("""{"type":"subscribed","channel":"$ch"}""")
                    webSocket.send(
                        """{"type":"event","channel":"$ch","event":"delivery.location","data":{"lat":23.6,"lng":58.4,"heading":45,"etaDropoffAt":"2026-11-16T10:35:00Z"},"id":7}""",
                    )
                }
                "ping" -> webSocket.send("""{"type":"pong"}""")
            }
        }
    }

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        scope.cancel()
        serverSockets.forEach { runCatching { it.close(1000, null) } }
        server.shutdown()
    }

    private fun client() = RealtimeClient(
        baseUrl = server.url("/v1").toString(),
        okHttp = OkHttpClient.Builder().readTimeout(0, TimeUnit.MILLISECONDS).build(),
        scope = scope,
        tokenProvider = { "tok-1" },
        backoff = Backoff(initialMs = 20, jitter = 0.0),
    )

    @Test
    fun `parses server frames`() {
        assertEquals(RealtimeMessage.Pong, RealtimeMessage.parse("""{"type":"pong"}"""))
        assertEquals(RealtimeMessage.Subscribed("order:1"), RealtimeMessage.parse("""{"type":"subscribed","channel":"order:1"}"""))
        val err = RealtimeMessage.parse("""{"type":"error","code":"forbidden","channel":"order:2"}""")
        assertEquals(RealtimeMessage.Error("forbidden", "order:2", null), err)
        val ev = RealtimeMessage.parse(
            """{"type":"event","channel":"captain:me","event":"offer.created","data":${Fixtures.read("offer.json")},"id":12}""",
        )
        assertIs<RealtimeMessage.Event>(ev)
        assertEquals(12L, ev.id)
        assertEquals("off-1", ev.offerOrNull()!!.id)
        assertEquals(null, RealtimeMessage.parse("not json"))
    }

    @Test
    fun `connects with token, subscribes and delivers channel events`() = runBlocking<Unit> {
        server.enqueue(MockResponse().withWebSocketUpgrade(serverListener()))
        val rt = client()
        val event = withTimeout(5_000) { rt.channel(Channels.order("o-1")).first() }
        assertEquals(RealtimeEvents.DELIVERY_LOCATION, event.event)
        val loc = assertNotNull(event.deliveryLocation())
        assertEquals(23.6, loc.lat)
        assertEquals("2026-11-16T10:35:00Z", loc.etaDropoffAt)
        val req = server.takeRequest()
        assertEquals("/v1/realtime?token=tok-1", req.path)
        assertEquals("""{"type":"subscribe","channel":"order:o-1"}""", received.poll(2, TimeUnit.SECONDS))
        // collection ended -> unsubscribe is sent
        assertEquals("""{"type":"unsubscribe","channel":"order:o-1"}""", received.poll(2, TimeUnit.SECONDS))
        rt.disconnect()
    }

    @Test
    fun `reconnects with backoff and re-subscribes`() = runBlocking<Unit> {
        server.enqueue(MockResponse().withWebSocketUpgrade(serverListener(closeImmediately = true)))
        server.enqueue(MockResponse().withWebSocketUpgrade(serverListener()))
        val rt = client()
        rt.subscribe(Channels.CAPTAIN_ME)
        rt.connect()
        val event = withTimeout(5_000) { rt.events.first { it.channel == Channels.CAPTAIN_ME } }
        assertEquals(7L, event.id)
        assertEquals(2, server.requestCount)
        withTimeout(2_000) { rt.state.first { it == ConnectionState.Connected } }
        assertTrue(rt.sendLocation(LocationPing(23.6, 58.4, heading = 90.0, speed = 8.2, accuracy = 5.0)))
        var location: String? = null
        withTimeout(3_000) {
            while (location == null) {
                val m = received.poll(100, TimeUnit.MILLISECONDS) ?: continue
                if (m.contains("\"location\"")) location = m
            }
        }
        val obj = QabnahJson.parseToJsonElement(location!!).jsonObject
        assertEquals("location", obj["type"]!!.jsonPrimitive.content)
        assertEquals("8.2", obj["speed"]!!.jsonPrimitive.content)
        rt.disconnect()
        assertEquals(ConnectionState.Idle, rt.state.value)
    }

    @Test
    fun `backoff grows exponentially and caps`() {
        val b = Backoff(initialMs = 1_000, maxMs = 30_000, jitter = 0.0)
        assertEquals(listOf(1_000L, 2_000L, 4_000L, 8_000L, 16_000L, 30_000L, 30_000L), (0..6).map { b.delayFor(it) })
        val j = Backoff(initialMs = 1_000, jitter = 0.2)
        repeat(50) { assertTrue(j.delayFor(0) in 800..1_200) }
    }
}
