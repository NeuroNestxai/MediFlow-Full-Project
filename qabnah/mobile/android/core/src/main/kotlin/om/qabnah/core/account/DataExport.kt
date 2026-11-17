package om.qabnah.core.account

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import java.time.LocalDate

/** Helpers for saving the `GET /me/export` download (PDPL access right). */
object DataExport {
    const val MIME_TYPE = "application/json"

    private val pretty = Json { prettyPrint = true }

    /** Human-readable JSON for the saved file. */
    fun toPrettyJson(export: JsonElement): String = pretty.encodeToString(JsonElement.serializer(), export)

    /** Suggested file name for the create-document picker, e.g. `qabnah-my-data-2026-11-17.json`. */
    fun fileName(date: LocalDate = LocalDate.now()): String = "qabnah-my-data-$date.json"
}
