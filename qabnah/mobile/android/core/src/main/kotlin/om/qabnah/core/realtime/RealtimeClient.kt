package om.qabnah.core.realtime

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import om.qabnah.core.QabnahJson
import om.qabnah.core.api.ApiException
import om.qabnah.core.model.LocationPing
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.min
import kotlin.math.pow
import kotlin.random.Random

sealed interface ConnectionState {
    data object Idle : ConnectionState
    data object Connecting : ConnectionState
    data object Connected : ConnectionState
    data class Reconnecting(val attempt: Int, val delayMs: Long) : ConnectionState
    /** No access token available (signed out). [RealtimeClient.connect] must be called again after sign-in. */
    data object SignedOut : ConnectionState
}

/** Exponential backoff with jitter: initial · factor^attempt, capped at [maxMs], ± [jitter] fraction. */
class Backoff(
    private val initialMs: Long = 1_000,
    private val maxMs: Long = 30_000,
    private val factor: Double = 2.0,
    private val jitter: Double = 0.2,
    private val random: Random = Random.Default,
) {
    fun delayFor(attempt: Int): Long {
        val base = min(maxMs.toDouble(), initialMs * factor.pow(attempt.coerceAtMost(30)))
        if (jitter <= 0.0) return base.toLong()
        val spread = base * jitter
        return (base - spread + random.nextDouble() * 2 * spread).toLong().coerceAtLeast(0)
    }
}

/**
 * WebSocket client for `GET /v1/realtime?token=…`.
 *
 * - [connect] starts a supervised loop that reconnects with [Backoff] and re-subscribes every wanted channel.
 * - Channels are reference-counted: [channel] subscribes when collection starts and unsubscribes when it stops.
 * - Sends `{"type":"ping"}` every [pingIntervalMs]; if nothing arrives for [pingIntervalMs] + [pongTimeoutMs]
 *   the socket is considered dead and replaced.
 * - A failed handshake with HTTP 401 forces a token refresh before the next attempt.
 */
class RealtimeClient(
    baseUrl: String,
    private val okHttp: OkHttpClient,
    private val scope: CoroutineScope,
    /** Returns a valid access token (refreshing it if [forceRefresh]); null when signed out. */
    private val tokenProvider: suspend (forceRefresh: Boolean) -> String?,
    private val json: Json = QabnahJson,
    private val backoff: Backoff = Backoff(),
    private val pingIntervalMs: Long = 25_000,
    private val pongTimeoutMs: Long = 10_000,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val realtimeUrl = baseUrl.trimEnd('/').toHttpUrl().newBuilder().addPathSegment("realtime").build()

    private val lock = Any()
    private val wanted = LinkedHashMap<String, Int>()
    private var socket: WebSocket? = null
    private var loopJob: Job? = null

    private val _state = MutableStateFlow<ConnectionState>(ConnectionState.Idle)
    val state: StateFlow<ConnectionState> = _state.asStateFlow()

    private val _messages = MutableSharedFlow<RealtimeMessage>(extraBufferCapacity = 128)
    /** Every inbound frame (events, acks, errors, pongs). */
    val messages: SharedFlow<RealtimeMessage> = _messages.asSharedFlow()
    val events: Flow<RealtimeMessage.Event> get() = messages.filterIsInstance()

    val isConnected: Boolean get() = _state.value == ConnectionState.Connected

    /** Starts (or keeps) the connection loop. Idempotent. */
    fun connect() {
        synchronized(lock) {
            if (loopJob?.isActive == true) return
            loopJob = scope.launch { runLoop() }
        }
    }

    /** Closes the socket and stops reconnecting. Wanted channels are kept for the next [connect]. */
    fun disconnect() {
        val job: Job?
        val ws: WebSocket?
        synchronized(lock) {
            job = loopJob
            loopJob = null
            ws = socket
            socket = null
        }
        ws?.close(1000, "client disconnect")
        job?.cancel()
        _state.value = ConnectionState.Idle
    }

    fun subscribe(channel: String) {
        val first: Boolean
        synchronized(lock) {
            val n = wanted[channel] ?: 0
            wanted[channel] = n + 1
            first = n == 0
        }
        if (first) sendJson(mapOf("type" to "subscribe", "channel" to channel))
    }

    fun unsubscribe(channel: String) {
        val last: Boolean
        synchronized(lock) {
            val n = wanted[channel] ?: return
            last = n <= 1
            if (last) wanted.remove(channel) else wanted[channel] = n - 1
        }
        if (last) sendJson(mapOf("type" to "unsubscribe", "channel" to channel))
    }

    fun subscribedChannels(): Set<String> = synchronized(lock) { wanted.keys.toSet() }

    /** Events of one channel; subscribes while collected. Also calls [connect]. */
    fun channel(channel: String): Flow<RealtimeMessage.Event> = flow {
        connect()
        subscribe(channel)
        try {
            events.filter { it.channel == channel }.collect { emit(it) }
        } finally {
            unsubscribe(channel)
        }
    }

    /** Captain location over the socket. Returns false when not connected (use the REST fallback). */
    fun sendLocation(ping: LocationPing): Boolean {
        val obj = buildJsonObject {
            put("type", "location")
            put("lat", ping.lat)
            put("lng", ping.lng)
            ping.heading?.let { put("heading", it) }
            ping.speed?.let { put("speed", it) }
            ping.accuracy?.let { put("accuracy", it) }
        }
        val ws = synchronized(lock) { socket } ?: return false
        if (!isConnected) return false
        return ws.send(obj.toString())
    }

    private fun sendJson(fields: Map<String, String>) {
        val ws = synchronized(lock) { socket } ?: return
        if (!isConnected) return
        val obj = buildJsonObject { fields.forEach { (k, v) -> put(k, v) } }
        ws.send(obj.toString())
    }

    private suspend fun runLoop() {
        var attempt = 0
        var forceRefresh = false
        while (currentCoroutineContext().isActive) {
            _state.value = ConnectionState.Connecting
            var transientFailure = false
            val token = try {
                tokenProvider(forceRefresh)
            } catch (e: CancellationException) {
                throw e
            } catch (e: ApiException.Unauthorized) {
                _state.value = ConnectionState.SignedOut
                return
            } catch (e: Exception) {
                transientFailure = true // e.g. offline while refreshing: retry with backoff
                null
            }
            if (token == null && !transientFailure) {
                _state.value = ConnectionState.SignedOut
                return
            }
            val end = if (token != null) runSession(token) else SessionEnd(wasOpen = false, authFailure = forceRefresh)
            forceRefresh = end.authFailure
            if (end.wasOpen) attempt = 0
            val wait = backoff.delayFor(attempt)
            attempt++
            _state.value = ConnectionState.Reconnecting(attempt, wait)
            delay(wait)
        }
    }

    private data class SessionEnd(val wasOpen: Boolean, val authFailure: Boolean)

    private suspend fun runSession(token: String): SessionEnd {
        val done = CompletableDeferred<SessionEnd>()
        val opened = AtomicBoolean(false)
        val lastInbound = AtomicLong(clock())
        val request = Request.Builder()
            .url(realtimeUrl.newBuilder().addQueryParameter("token", token).build())
            .build()
        var pingJob: Job? = null
        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                opened.set(true)
                lastInbound.set(clock())
                synchronized(lock) { socket = webSocket }
                _state.value = ConnectionState.Connected
                subscribedChannels().forEach { ch ->
                    webSocket.send(buildJsonObject { put("type", "subscribe"); put("channel", ch) }.toString())
                }
                pingJob = scope.launch {
                    while (isActive) {
                        delay(pingIntervalMs)
                        if (clock() - lastInbound.get() > pingIntervalMs + pongTimeoutMs) {
                            webSocket.cancel()
                            break
                        }
                        webSocket.send("""{"type":"ping"}""")
                    }
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                lastInbound.set(clock())
                RealtimeMessage.parse(text, json)?.let { _messages.tryEmit(it) }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
                done.complete(SessionEnd(opened.get(), authFailure = code == 4401 || code == 4001 || code == 1008))
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                done.complete(SessionEnd(opened.get(), authFailure = code == 4401 || code == 4001 || code == 1008))
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                done.complete(SessionEnd(opened.get(), authFailure = response?.code == 401))
            }
        }
        val ws = okHttp.newWebSocket(request, listener)
        try {
            return done.await()
        } finally {
            pingJob?.cancel()
            ws.cancel()
            synchronized(lock) { if (socket === ws) socket = null }
        }
    }
}
