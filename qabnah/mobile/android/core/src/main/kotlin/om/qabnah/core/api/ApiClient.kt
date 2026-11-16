package om.qabnah.core.api

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import om.qabnah.core.QabnahJson
import om.qabnah.core.model.AuthResult
import om.qabnah.core.model.Tokens
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Session lifecycle notifications for the UI (navigate to sign-in on [Expired]). */
sealed interface SessionEvent {
    /** The refresh token was rejected; local tokens were cleared. */
    data object Expired : SessionEvent
    data object SignedIn : SessionEvent
    data object SignedOut : SessionEvent
}

/**
 * Thin coroutine HTTP client for the Qabnah API.
 *
 * - Adds `Authorization: Bearer` for authenticated calls.
 * - Refreshes the access token shortly before it expires, and once after a 401, via `POST /auth/refresh`.
 *   Refreshes are single-flight: concurrent callers that hit 401 with the same stale token share one refresh.
 * - Maps the error envelope to [ApiException] subclasses; transport failures become [ApiException.Network].
 */
class ApiClient(
    baseUrl: String,
    private val tokenStore: TokenStore,
    private val okHttp: OkHttpClient = OkHttpClient(),
    val json: Json = QabnahJson,
    private val clock: () -> Long = System::currentTimeMillis,
    /** Value for `Accept-Language` (e.g. "ar" / "en"), read on every request. */
    private val acceptLanguage: () -> String? = { null },
    private val userAgent: String? = null,
    /** Refresh this long before the access token expires. */
    private val refreshLeewayMs: Long = 30_000,
) {
    val baseUrl: HttpUrl = baseUrl.trimEnd('/').toHttpUrl()

    private val refreshMutex = Mutex()
    private val _signedIn = MutableStateFlow(tokenStore.read() != null)
    private val _sessionEvents = MutableSharedFlow<SessionEvent>(extraBufferCapacity = 8)

    /** True while tokens are stored. */
    val signedIn: StateFlow<Boolean> = _signedIn.asStateFlow()
    val sessionEvents: SharedFlow<SessionEvent> = _sessionEvents.asSharedFlow()

    /** The underlying OkHttp client (shared with [om.qabnah.core.realtime.RealtimeClient]). */
    val httpClient: OkHttpClient get() = okHttp

    fun saveSession(tokens: Tokens) {
        tokenStore.write(tokens.toStored())
        _signedIn.value = true
        _sessionEvents.tryEmit(SessionEvent.SignedIn)
    }

    fun saveSession(auth: AuthResult) = saveSession(auth.tokens())

    fun clearSession(expired: Boolean = false) {
        tokenStore.write(null)
        _signedIn.value = false
        _sessionEvents.tryEmit(if (expired) SessionEvent.Expired else SessionEvent.SignedOut)
    }

    fun currentRefreshToken(): String? = tokenStore.read()?.refreshToken

    /**
     * A usable access token: refreshes first if it expires within the leeway (single-flight).
     * Returns null when signed out. [forceRefresh] refreshes unconditionally (e.g. after a WebSocket 401).
     */
    suspend fun freshAccessToken(forceRefresh: Boolean = false): String? {
        val current = tokenStore.read() ?: return null
        if (!forceRefresh && !current.isExpiring()) return current.accessToken
        return refreshMutex.withLock {
            val latest = tokenStore.read() ?: return@withLock null
            // Another caller refreshed while we waited for the lock.
            if (latest.accessToken != current.accessToken && !latest.isExpiring()) return@withLock latest.accessToken
            if (!forceRefresh && !latest.isExpiring()) return@withLock latest.accessToken
            refreshLocked(latest).accessToken
        }
    }

    // ───────────── request helpers (used by QabnahApi) ─────────────

    suspend inline fun <reified T> get(path: String, query: Map<String, Any?> = emptyMap(), auth: Boolean = true): T =
        execute("GET", path, query, null, auth, emptyMap(), strategy<T>())

    suspend inline fun <reified B, reified T> post(
        path: String,
        body: B,
        auth: Boolean = true,
        idempotencyKey: String? = null,
    ): T = execute("POST", path, emptyMap(), jsonBody(body), auth, idempotencyHeaders(idempotencyKey), strategy<T>())

    /** POST without a body (e.g. accept an offer). */
    suspend inline fun <reified T> postEmpty(path: String, auth: Boolean = true): T =
        execute("POST", path, emptyMap(), EMPTY_JSON_BODY, auth, emptyMap(), strategy<T>())

    suspend inline fun <reified B, reified T> patch(path: String, body: B, auth: Boolean = true): T =
        execute("PATCH", path, emptyMap(), jsonBody(body), auth, emptyMap(), strategy<T>())

    suspend inline fun <reified B, reified T> put(path: String, body: B, auth: Boolean = true): T =
        execute("PUT", path, emptyMap(), jsonBody(body), auth, emptyMap(), strategy<T>())

    suspend fun delete(path: String, auth: Boolean = true) {
        execute<Unit>("DELETE", path, emptyMap(), null, auth, emptyMap(), null)
    }

    @PublishedApi
    internal inline fun <reified B> jsonBody(body: B): RequestBody =
        json.encodeToString(json.serializersModule.serializer<B>(), body).toRequestBody(JSON)

    @PublishedApi
    internal inline fun <reified T> strategy(): DeserializationStrategy<T>? =
        if (T::class == Unit::class) null else json.serializersModule.serializer<T>()

    @PublishedApi
    internal fun idempotencyHeaders(key: String?): Map<String, String> =
        if (key.isNullOrBlank()) emptyMap() else mapOf("Idempotency-Key" to key)

    /**
     * Core request. [deserializer] null means "no body expected" and returns Unit.
     * The [body] must be replayable (it is re-sent once after a token refresh).
     */
    @PublishedApi
    internal suspend fun <T> execute(
        method: String,
        path: String,
        query: Map<String, Any?>,
        body: RequestBody?,
        auth: Boolean,
        headers: Map<String, String>,
        deserializer: DeserializationStrategy<T>?,
    ): T {
        val url = buildUrl(path, query)
        var accessToken: String? = null
        if (auth) {
            accessToken = freshAccessToken()
                ?: throw ApiException.Unauthorized("unauthorized", "Not signed in")
        }
        var response = send(buildRequest(method, url, body, accessToken, headers))
        if (response.code == 401 && auth && accessToken != null) {
            response.close()
            val refreshed = refreshAfterUnauthorized(accessToken)
            response = send(buildRequest(method, url, body, refreshed, headers))
        }
        return handle(response, deserializer)
    }

    /** Multipart upload (`POST /files`). */
    suspend fun <T> executeMultipart(
        path: String,
        body: RequestBody,
        deserializer: DeserializationStrategy<T>,
    ): T = execute("POST", path, emptyMap(), body, true, emptyMap(), deserializer)

    private fun buildUrl(path: String, query: Map<String, Any?>): HttpUrl {
        val b = baseUrl.newBuilder()
        val clean = path.trim('/')
        if (clean.isNotEmpty()) b.addPathSegments(clean)
        query.forEach { (k, v) -> if (v != null) b.addQueryParameter(k, v.toString()) }
        return b.build()
    }

    private fun buildRequest(
        method: String,
        url: HttpUrl,
        body: RequestBody?,
        accessToken: String?,
        headers: Map<String, String>,
    ): Request {
        val rb = Request.Builder().url(url).header("Accept", "application/json")
        accessToken?.let { rb.header("Authorization", "Bearer $it") }
        acceptLanguage()?.let { rb.header("Accept-Language", it) }
        userAgent?.let { rb.header("User-Agent", it) }
        headers.forEach { (k, v) -> rb.header(k, v) }
        val effectiveBody = body ?: if (method == "POST" || method == "PUT" || method == "PATCH") EMPTY_JSON_BODY else null
        rb.method(method, effectiveBody)
        return rb.build()
    }

    private suspend fun refreshAfterUnauthorized(failedAccessToken: String): String = refreshMutex.withLock {
        val latest = tokenStore.read()
            ?: throw ApiException.Unauthorized("unauthorized", "Session ended")
        // Someone else already refreshed after our request was sent: just retry with the new token.
        if (latest.accessToken != failedAccessToken) return@withLock latest.accessToken
        refreshLocked(latest).accessToken
    }

    /** Must be called with [refreshMutex] held. */
    private suspend fun refreshLocked(current: StoredTokens): StoredTokens {
        val body = json.encodeToString(RefreshBody.serializer(), RefreshBody(current.refreshToken)).toRequestBody(JSON)
        val request = buildRequest("POST", buildUrl("auth/refresh", emptyMap()), body, null, emptyMap())
        val response = send(request)
        if (!response.isSuccessful) {
            val error = response.use { ApiException.fromResponse(it.code, it.body?.string(), it.header("Retry-After")) }
            if (response.code == 400 || response.code == 401 || response.code == 403) {
                clearSession(expired = true)
                throw ApiException.Unauthorized(error.code, error.message ?: "Session expired", error.details)
            }
            throw error
        }
        val tokens = handle(response, Tokens.serializer())
        val stored = tokens.toStored()
        tokenStore.write(stored)
        _signedIn.value = true
        return stored
    }

    private fun <T> handle(response: Response, deserializer: DeserializationStrategy<T>?): T = response.use { r ->
        val text = try {
            r.body?.string()
        } catch (e: IOException) {
            throw ApiException.Network(e)
        }
        if (!r.isSuccessful) throw ApiException.fromResponse(r.code, text, r.header("Retry-After"))
        if (deserializer == null) {
            @Suppress("UNCHECKED_CAST")
            return Unit as T
        }
        if (text.isNullOrBlank()) throw ApiException.Decoding(IllegalStateException("Empty response body for ${r.request.url.encodedPath}"))
        try {
            json.decodeFromString(deserializer, text)
        } catch (e: SerializationException) {
            throw ApiException.Decoding(e)
        } catch (e: IllegalArgumentException) {
            throw ApiException.Decoding(e)
        }
    }

    private suspend fun send(request: Request): Response = try {
        okHttp.newCall(request).await()
    } catch (e: IOException) {
        throw ApiException.Network(e)
    }

    private fun StoredTokens.isExpiring() = accessExpiresAtEpochMs - clock() <= refreshLeewayMs

    private fun Tokens.toStored() = StoredTokens(accessToken, refreshToken, clock() + expiresIn * 1000)

    @kotlinx.serialization.Serializable
    private data class RefreshBody(val refreshToken: String)

    companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()

        @PublishedApi
        internal val EMPTY_JSON_BODY: RequestBody = "{}".toRequestBody(JSON)
    }
}

internal suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
    cont.invokeOnCancellation { runCatching { cancel() } }
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            if (cont.isActive) cont.resumeWithException(e)
        }

        override fun onResponse(call: Call, response: Response) {
            if (cont.isActive) cont.resume(response) else response.close()
        }
    })
}
