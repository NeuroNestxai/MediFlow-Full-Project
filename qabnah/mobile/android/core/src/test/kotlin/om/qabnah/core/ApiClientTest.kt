package om.qabnah.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import om.qabnah.core.api.ApiClient
import om.qabnah.core.api.ApiException
import om.qabnah.core.api.InMemoryTokenStore
import om.qabnah.core.api.QabnahApi
import om.qabnah.core.api.SessionEvent
import om.qabnah.core.api.StoredTokens
import om.qabnah.core.model.FilePurpose
import om.qabnah.core.model.MarketplaceOrderInput
import om.qabnah.core.model.OrderItemInput
import om.qabnah.core.model.PaymentMethod
import org.junit.After
import org.junit.Before
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ApiClientTest {
    private lateinit var server: MockWebServer
    private var now = 1_000_000L
    private val store = InMemoryTokenStore()
    private lateinit var client: ApiClient
    private lateinit var api: QabnahApi

    private val meJson get() = Fixtures.read("me_consumer.json")
    private val tokensJson = """{"accessToken":"new-access","refreshToken":"new-refresh","expiresIn":900}"""

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        client = ApiClient(
            baseUrl = server.url("/v1").toString(),
            tokenStore = store,
            okHttp = OkHttpClient.Builder().readTimeout(5, TimeUnit.SECONDS).build(),
            clock = { now },
            acceptLanguage = { "ar" },
        )
        api = QabnahApi(client)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun signIn(access: String = "old-access", expiresInMs: Long = 600_000) {
        store.write(StoredTokens(access, "old-refresh", now + expiresInMs))
    }

    @Test
    fun `sends bearer token, accept-language and decodes`() = runBlocking<Unit> {
        signIn()
        server.enqueue(MockResponse().setBody(meJson))
        val me = api.me()
        assertEquals("Salim", me.user.fullName)
        val req = server.takeRequest()
        assertEquals("/v1/me", req.path)
        assertEquals("Bearer old-access", req.getHeader("Authorization"))
        assertEquals("ar", req.getHeader("Accept-Language"))
    }

    @Test
    fun `public endpoints send no auth and encode query`() = runBlocking<Unit> {
        server.enqueue(MockResponse().setBody("""{"items":[],"total":0}"""))
        api.stores(location = om.qabnah.core.model.LatLng(23.5, 58.4), category = om.qabnah.core.model.MerchantCategory.CAFE, query = "karak tea")
        val req = server.takeRequest()
        assertNull(req.getHeader("Authorization"))
        val url = req.requestUrl!!
        assertEquals("23.5", url.queryParameter("lat"))
        assertEquals("cafe", url.queryParameter("category"))
        assertEquals("karak tea", url.queryParameter("q"))
    }

    @Test
    fun `refreshes on 401 and retries once`() = runBlocking<Unit> {
        signIn()
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":{"code":"unauthorized","message":"expired"}}"""))
        server.enqueue(MockResponse().setBody(tokensJson))
        server.enqueue(MockResponse().setBody(meJson))
        val me = api.me()
        assertEquals("u-1", me.user.id)
        assertEquals("Bearer old-access", server.takeRequest().getHeader("Authorization"))
        val refresh = server.takeRequest()
        assertEquals("/v1/auth/refresh", refresh.path)
        assertTrue(refresh.body.readUtf8().contains("\"refreshToken\":\"old-refresh\""))
        assertNull(refresh.getHeader("Authorization"))
        assertEquals("Bearer new-access", server.takeRequest().getHeader("Authorization"))
        assertEquals("new-refresh", store.read()!!.refreshToken)
        assertEquals(now + 900_000, store.read()!!.accessExpiresAtEpochMs)
    }

    @Test
    fun `concurrent 401s share a single refresh`() = runBlocking<Unit> {
        signIn()
        val refreshCalls = AtomicInteger()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when (request.path) {
                "/v1/auth/refresh" -> {
                    refreshCalls.incrementAndGet()
                    Thread.sleep(150) // keep the refresh in flight while the other calls fail
                    MockResponse().setBody(tokensJson)
                }
                "/v1/me" -> if (request.getHeader("Authorization") == "Bearer new-access") MockResponse().setBody(meJson)
                else MockResponse().setResponseCode(401).setBody("""{"error":{"code":"unauthorized","message":"expired"}}""")
                else -> MockResponse().setResponseCode(404)
            }
        }
        val results = (1..8).map { async(Dispatchers.IO) { api.me() } }.awaitAll()
        assertEquals(8, results.size)
        assertEquals(1, refreshCalls.get())
    }

    @Test
    fun `proactively refreshes an access token that is about to expire`() = runBlocking<Unit> {
        signIn(expiresInMs = 10_000) // inside the 30 s leeway
        server.enqueue(MockResponse().setBody(tokensJson))
        server.enqueue(MockResponse().setBody(meJson))
        api.me()
        assertEquals("/v1/auth/refresh", server.takeRequest().path)
        assertEquals("Bearer new-access", server.takeRequest().getHeader("Authorization"))
    }

    @Test
    fun `failed refresh clears the session and reports expiry`() = runBlocking<Unit> {
        signIn()
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":{"code":"unauthorized","message":"expired"}}"""))
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":{"code":"unauthorized","message":"refresh revoked"}}"""))
        val event = async { withTimeout(5_000) { client.sessionEvents.first() } }
        kotlinx.coroutines.yield()
        val e = assertFailsWith<ApiException.Unauthorized> { api.me() }
        assertEquals("refresh revoked", e.message)
        assertNull(store.read())
        assertFalse(client.signedIn.value)
        assertEquals(SessionEvent.Expired, event.await())
    }

    @Test
    fun `calls without a session fail fast`() = runBlocking<Unit> {
        assertFailsWith<ApiException.Unauthorized> { api.me() }
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `maps error statuses`() = runBlocking<Unit> {
        signIn()
        server.enqueue(MockResponse().setResponseCode(409).setBody("""{"error":{"code":"conflict","message":"Offer already taken"}}"""))
        val conflict = assertFailsWith<ApiException.Conflict> { api.acceptOffer("off-1") }
        assertEquals("conflict", conflict.code)
        assertEquals("Offer already taken", conflict.message)

        server.enqueue(MockResponse().setResponseCode(422).setBody("""{"error":{"code":"out_of_service_area","message":"Outside","details":{"field":"dropoff"}}}"""))
        val v = assertFailsWith<ApiException.Validation> {
            api.quoteOrder(MarketplaceOrderInput("m", listOf(OrderItemInput("p", 1)), paymentMethod = PaymentMethod.COD))
        }
        assertEquals("out_of_service_area", v.code)
        assertTrue("dropoff" in v.fieldErrors)

        server.enqueue(MockResponse().setResponseCode(429).setHeader("Retry-After", "30").setBody("""{"error":{"code":"rate_limited","message":"Slow down"}}"""))
        val rl = assertFailsWith<ApiException.RateLimited> { api.requestOtp("+96891234567") }
        assertEquals(30L, rl.retryAfterSeconds)

        server.enqueue(MockResponse().setResponseCode(502).setBody("<html>Bad gateway</html>"))
        val s = assertFailsWith<ApiException.Server> { api.me() }
        assertEquals(502, s.status)
        assertEquals("http_502", s.code)

        server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":{"code":"not_found","message":"No such store"}}"""))
        assertFailsWith<ApiException.NotFound> { api.storefront("nope") }

        server.enqueue(MockResponse().setBody("not json"))
        assertFailsWith<ApiException.Decoding> { api.me() }
    }

    @Test
    fun `network failures become Network exceptions`() = runBlocking<Unit> {
        signIn()
        server.shutdown()
        assertFailsWith<ApiException.Network> { api.me() }
    }

    @Test
    fun `place order sends idempotency key`() = runBlocking<Unit> {
        signIn()
        server.enqueue(MockResponse().setResponseCode(201).setBody(Fixtures.read("order.json")))
        val order = api.placeOrder(
            MarketplaceOrderInput("m-1", listOf(OrderItemInput("p-1", 1)), addressId = "a-1", paymentMethod = PaymentMethod.COD),
            idempotencyKey = "key-123",
        )
        assertEquals("QB100001", order.number)
        val req = server.takeRequest()
        assertEquals("key-123", req.getHeader("Idempotency-Key"))
        assertEquals("POST", req.method)
        assertTrue(req.getHeader("Content-Type")!!.startsWith("application/json"))
    }

    @Test
    fun `204 responses and empty-body posts`() = runBlocking<Unit> {
        signIn()
        server.enqueue(MockResponse().setResponseCode(204))
        api.rejectOffer("off-1", "too_far")
        val req = server.takeRequest()
        assertEquals("/v1/captain/offers/off-1/reject", req.path)
        assertEquals("""{"reason":"too_far"}""", req.body.readUtf8())

        server.enqueue(MockResponse().setResponseCode(204))
        api.deleteAddress("a-1")
        assertEquals("DELETE", server.takeRequest().method)
    }

    @Test
    fun `verify otp stores the session`() = runBlocking<Unit> {
        server.enqueue(
            MockResponse().setBody(
                """{"accessToken":"a1","refreshToken":"r1","expiresIn":900,"user":{"id":"u-1","fullName":"","locale":"ar"},"isNewUser":true}""",
            ),
        )
        val result = api.verifyOtp("+96891234567", "123456", fullName = "Salim")
        assertTrue(result.isNewUser)
        assertEquals("a1", store.read()!!.accessToken)
        assertTrue(client.signedIn.value)
        val body = server.takeRequest().body.readUtf8()
        assertTrue(body.contains("\"fullName\":\"Salim\""))
    }

    @Test
    fun `logout clears locally even if the server fails`() = runBlocking<Unit> {
        signIn()
        server.enqueue(MockResponse().setResponseCode(500))
        api.logout()
        assertNull(store.read())
        assertEquals("/v1/auth/logout", server.takeRequest().path)
    }

    @Test
    fun `multipart upload sends purpose and file`() = runBlocking<Unit> {
        signIn()
        server.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"f-1","url":"https://x","mimeType":"image/jpeg","sizeBytes":3}"""))
        val ref = api.uploadFile(byteArrayOf(1, 2, 3), "id.jpg", "image/jpeg", FilePurpose.CAPTAIN_DOCUMENT)
        assertEquals("f-1", ref.id)
        val req = server.takeRequest()
        assertTrue(req.getHeader("Content-Type")!!.startsWith("multipart/form-data"))
        val body = req.body.readUtf8()
        assertTrue(body.contains("name=\"purpose\""))
        assertTrue(body.contains("captain_document"))
        assertTrue(body.contains("filename=\"id.jpg\""))
    }
}
