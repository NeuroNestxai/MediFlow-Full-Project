package om.qabnah.core.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import om.qabnah.core.QabnahJson

/** `{ "error": { "code", "message", "details" } }` */
@Serializable
internal data class ErrorEnvelope(val error: ErrorBody? = null)

@Serializable
internal data class ErrorBody(val code: String = "", val message: String = "", val details: JsonElement? = null)

/**
 * Every failure of an API call. HTTP errors carry the contract's error envelope (`code`, `message`, `details`).
 * UI code should `when` over the subclasses; [message] is the server's (English) message, suitable as a fallback.
 */
sealed class ApiException(
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause) {

    /** HTTP status, or null for transport-level failures. */
    open val status: Int? get() = null
    open val code: String get() = "unknown"
    open val details: JsonElement? get() = null

    sealed class Http(
        override val status: Int,
        override val code: String,
        message: String,
        override val details: JsonElement?,
    ) : ApiException(message)

    /** 401 – not signed in, or the session could not be refreshed (the user must sign in again). */
    class Unauthorized(code: String, message: String, details: JsonElement? = null) : Http(401, code, message, details)

    /** 403 */
    class Forbidden(code: String, message: String, details: JsonElement? = null) : Http(403, code, message, details)

    /** 404 */
    class NotFound(code: String, message: String, details: JsonElement? = null) : Http(404, code, message, details)

    /** 409 – e.g. `conflict`, `invalid_transition` (offer already taken, order can no longer be cancelled). */
    class Conflict(code: String, message: String, details: JsonElement? = null) : Http(409, code, message, details)

    /**
     * 400 / 422 – `validation_error`, `out_of_service_area`, `merchant_closed`, …
     * [fieldErrors] holds per-field messages when the server provided them in `details`.
     */
    class Validation(status: Int, code: String, message: String, details: JsonElement? = null) :
        Http(status, code, message, details) {
        val fieldErrors: Map<String, String> by lazy { parseFieldErrors(details) }
    }

    /** 429 – `rate_limited`. [retryAfterSeconds] from the Retry-After header when present. */
    class RateLimited(code: String, message: String, details: JsonElement? = null, val retryAfterSeconds: Long? = null) :
        Http(429, code, message, details)

    /** 5xx */
    class Server(status: Int, code: String, message: String, details: JsonElement? = null) :
        Http(status, code, message, details)

    /** Any other non-2xx status. */
    class Other(status: Int, code: String, message: String, details: JsonElement? = null) :
        Http(status, code, message, details)

    /** No connectivity, DNS failure, timeout, TLS error… */
    class Network(cause: java.io.IOException) : ApiException(cause.message ?: "Network error", cause) {
        override val code: String get() = "network_error"
    }

    /** The server answered 2xx but the body did not match the contract. */
    class Decoding(cause: Throwable) : ApiException(cause.message ?: "Unexpected response", cause) {
        override val code: String get() = "decoding_error"
    }

    companion object {
        /** Maps an HTTP status + raw body to the right subclass. Tolerates non-JSON bodies (proxies, HTML 502 pages). */
        fun fromResponse(status: Int, body: String?, retryAfter: String? = null): ApiException {
            val parsed = body?.takeIf { it.isNotBlank() }?.let {
                runCatching { QabnahJson.decodeFromString(ErrorEnvelope.serializer(), it).error }.getOrNull()
            }
            val code = parsed?.code?.takeIf { it.isNotBlank() } ?: defaultCode(status)
            val message = parsed?.message?.takeIf { it.isNotBlank() } ?: "HTTP $status"
            val details = parsed?.details
            return when {
                status == 401 -> Unauthorized(code, message, details)
                status == 403 -> Forbidden(code, message, details)
                status == 404 -> NotFound(code, message, details)
                status == 409 -> Conflict(code, message, details)
                status == 400 || status == 422 -> Validation(status, code, message, details)
                status == 429 -> RateLimited(code, message, details, retryAfter?.trim()?.toLongOrNull())
                status >= 500 -> Server(status, code, message, details)
                else -> Other(status, code, message, details)
            }
        }

        private fun defaultCode(status: Int) = when (status) {
            400, 422 -> "validation_error"
            401 -> "unauthorized"
            403 -> "forbidden"
            404 -> "not_found"
            409 -> "conflict"
            429 -> "rate_limited"
            else -> "http_$status"
        }

        /**
         * The contract leaves `details` free-form. Accept the common shapes:
         * - `{"fields": {"pin": "Wrong PIN"}}` or `{"fieldErrors": {...}}`
         * - `{"pin": "Wrong PIN"}` / `{"pin": ["Wrong PIN"]}`
         * - `{"issues": [{"path": ["pin"], "message": "…"}]}` or a bare array of such issues (zod style)
         * - `{"field": "pin"}` together with the top-level message (single-field errors)
         */
        internal fun parseFieldErrors(details: JsonElement?): Map<String, String> {
            val out = linkedMapOf<String, String>()
            fun msg(e: JsonElement?): String? = when (e) {
                is JsonPrimitive -> e.contentOrNull
                is JsonArray -> e.firstOrNull()?.let { msg(it) }
                is JsonObject -> (e["message"] as? JsonPrimitive)?.contentOrNull
                else -> null
            }
            fun issues(arr: JsonArray) {
                for (item in arr) {
                    val obj = item as? JsonObject ?: continue
                    val path = when (val p = obj["path"] ?: obj["field"]) {
                        is JsonArray -> p.joinToString(".") { (it as? JsonPrimitive)?.contentOrNull ?: "" }
                        is JsonPrimitive -> p.contentOrNull
                        else -> null
                    } ?: continue
                    msg(obj["message"])?.let { out.putIfAbsent(path, it) }
                }
            }
            when (details) {
                is JsonArray -> issues(details)
                is JsonObject -> {
                    val nested = details["fields"] ?: details["fieldErrors"] ?: details["errors"]
                    when (nested) {
                        is JsonObject -> nested.forEach { (k, v) -> msg(v)?.let { out[k] = it } }
                        is JsonArray -> issues(nested)
                        else -> {}
                    }
                    (details["issues"] as? JsonArray)?.let { issues(it) }
                    if (out.isEmpty()) {
                        val single = (details["field"] as? JsonPrimitive)?.contentOrNull
                        if (single != null) {
                            out[single] = msg(details["message"]) ?: ""
                        } else {
                            details.forEach { (k, v) ->
                                if (k != "message" && k != "code" && (v is JsonPrimitive && v.isString || v is JsonArray)) {
                                    msg(v)?.let { out[k] = it }
                                }
                            }
                        }
                    }
                }
                else -> {}
            }
            return out
        }
    }
}

/** Convenience for 422 handling in forms. */
fun ApiException.fieldError(field: String): String? = (this as? ApiException.Validation)?.fieldErrors?.get(field)

internal fun JsonElement.stringOrNull(): String? = (this as? JsonPrimitive)?.jsonPrimitive?.contentOrNull
