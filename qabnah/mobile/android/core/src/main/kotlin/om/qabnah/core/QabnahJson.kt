package om.qabnah.core

import kotlinx.serialization.json.Json

/** Shared JSON configuration: lenient on input (unknown keys, nulls for defaulted fields), compact on output. */
val QabnahJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    encodeDefaults = true
    isLenient = false
}
