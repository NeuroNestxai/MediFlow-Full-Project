package om.qabnah.core.util

import om.qabnah.core.model.AvailabilitySlot
import om.qabnah.core.model.LatLng
import om.qabnah.core.money.Digits
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeParseException
import java.time.temporal.TemporalAdjusters
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Picks the localized variant, falling back to the other language when blank. */
fun localized(en: String?, ar: String?, arabic: Boolean): String {
    val primary = if (arabic) ar else en
    val secondary = if (arabic) en else ar
    return primary?.takeIf { it.isNotBlank() } ?: secondary.orEmpty()
}

object Phones {
    /**
     * Normalizes an Omani mobile number to E.164 (`+9689XXXXXXX`). Accepts spaces/dashes, `00968`, `968`,
     * a bare 8-digit number and Arabic-Indic digits. Returns null when it is not a valid Omani mobile (7x / 9x).
     */
    fun normalizeOmanMobile(input: String): String? {
        val digits = Digits.toAscii(input).filter { it.isDigit() }
        val local = when {
            digits.length == 8 -> digits
            digits.length == 11 && digits.startsWith("968") -> digits.substring(3)
            digits.length == 13 && digits.startsWith("00968") -> digits.substring(5)
            else -> return null
        }
        if (local[0] != '7' && local[0] != '9') return null
        return "+968$local"
    }

    /** `https://wa.me/<digits>` (digits only, international format, no plus). */
    fun whatsappUrl(phone: String): String? {
        val digits = Digits.toAscii(phone).filter { it.isDigit() }.removePrefix("00")
        if (digits.length < 8) return null
        val intl = if (digits.length == 8) "968$digits" else digits
        return "https://wa.me/$intl"
    }

    /** `tel:` URI for the dialer. */
    fun dialUri(phone: String): String = "tel:" + Digits.toAscii(phone).filter { it.isDigit() || it == '+' }
}

object Geo {
    private const val EARTH_RADIUS_M = 6_371_000.0

    fun distanceMeters(a: LatLng, b: LatLng): Double {
        val dLat = Math.toRadians(b.lat - a.lat)
        val dLng = Math.toRadians(b.lng - a.lng)
        val h = sin(dLat / 2).pow(2) + cos(Math.toRadians(a.lat)) * cos(Math.toRadians(b.lat)) * sin(dLng / 2).pow(2)
        return 2 * EARTH_RADIUS_M * asin(sqrt(h.coerceIn(0.0, 1.0)))
    }

    /** Central Muscat, used as the map's initial camera before a location fix. */
    val MUSCAT = LatLng(23.5880, 58.3829)
}

object Eta {
    /** Average urban courier speed used when the server gives no ETA (≈ 25 km/h). */
    const val FALLBACK_SPEED_MPS = 7.0

    /** Whole minutes from [nowMs] until the ISO-8601 instant (≥ 0), or null if missing/unparseable. */
    fun minutesUntil(iso: String?, nowMs: Long = System.currentTimeMillis()): Int? {
        if (iso.isNullOrBlank()) return null
        val at = try { Instant.parse(iso).toEpochMilli() } catch (e: DateTimeParseException) { return null }
        val diff = at - nowMs
        return if (diff <= 0) 0 else ((diff + 59_999) / 60_000).toInt()
    }

    /** Approximate minutes from straight-line distance when no server ETA is known. */
    fun minutesByDistance(from: LatLng, to: LatLng): Int {
        val m = Geo.distanceMeters(from, to) * 1.3 // road factor
        return ((m / FALLBACK_SPEED_MPS) / 60).toInt().coerceAtLeast(1)
    }
}

object BrandColors {
    /** Parses `#RRGGBB` or `#AARRGGBB` into an ARGB int; null when invalid. */
    fun parse(hex: String?): Int? {
        val h = hex?.trim()?.removePrefix("#") ?: return null
        return when (h.length) {
            6 -> h.toLongOrNull(16)?.let { (0xFF000000 or it).toInt() }
            8 -> h.toLongOrNull(16)?.toInt()
            else -> null
        }
    }

    /** True if white text is more legible than black on [argb] (WCAG relative luminance). */
    fun prefersLightContent(argb: Int): Boolean {
        fun ch(v: Int): Double {
            val c = v / 255.0
            return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
        }
        val l = 0.2126 * ch((argb shr 16) and 0xFF) + 0.7152 * ch((argb shr 8) and 0xFF) + 0.0722 * ch(argb and 0xFF)
        return (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.05)
    }
}

/** Weekly availability rules: `HH:mm` times, start < end, no overlap within a weekday, weekday 0..6 (0 = Sunday). */
object Availability {
    sealed interface Issue {
        data class BadTime(val index: Int) : Issue
        data class EndBeforeStart(val index: Int) : Issue
        data class Overlap(val first: Int, val second: Int) : Issue
        data class BadWeekday(val index: Int) : Issue
    }

    fun minutesOf(hhmm: String): Int? {
        val m = Regex("""^([01]\d|2[0-3]):([0-5]\d)$""").matchEntire(hhmm) ?: return if (hhmm == "24:00") 1440 else null
        return m.groupValues[1].toInt() * 60 + m.groupValues[2].toInt()
    }

    fun validate(slots: List<AvailabilitySlot>): List<Issue> {
        val issues = mutableListOf<Issue>()
        slots.forEachIndexed { i, s ->
            if (s.weekday !in 0..6) issues += Issue.BadWeekday(i)
            val a = minutesOf(s.start)
            val b = minutesOf(s.end)
            if (a == null || b == null) issues += Issue.BadTime(i)
            else if (b <= a) issues += Issue.EndBeforeStart(i)
        }
        if (issues.isNotEmpty()) return issues
        slots.withIndex().groupBy { it.value.weekday }.values.forEach { day ->
            val sorted = day.sortedBy { minutesOf(it.value.start) }
            for (k in 1 until sorted.size) {
                val prevEnd = minutesOf(sorted[k - 1].value.end)!!
                val start = minutesOf(sorted[k].value.start)!!
                if (start < prevEnd) issues += Issue.Overlap(sorted[k - 1].index, sorted[k].index)
            }
        }
        return issues
    }
}

/** Date ranges for the captain earnings presets, in Muscat local time. Week starts on Sunday. */
object DateRanges {
    val MUSCAT: ZoneId = ZoneId.of("Asia/Muscat")

    enum class Preset { TODAY, WEEK, MONTH }

    data class Range(val from: LocalDate, val to: LocalDate) {
        val fromIso: String get() = from.toString()
        val toIso: String get() = to.toString()
    }

    fun of(preset: Preset, today: LocalDate = LocalDate.now(MUSCAT)): Range = when (preset) {
        Preset.TODAY -> Range(today, today)
        Preset.WEEK -> Range(today.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY)), today)
        Preset.MONTH -> Range(today.withDayOfMonth(1), today)
    }
}

/** Map overlays for the tracking (consumer) and active-delivery (captain) screens. */
object MapRoute {
    /**
     * The stop the captain is heading to: the pickup until the parcel is picked up (and while returning it),
     * then the dropoff. Null when there is no delivery yet or it has ended.
     */
    fun nextStop(status: om.qabnah.core.model.DeliveryStatus?, pickup: LatLng?, dropoff: LatLng?): LatLng? {
        if (status == null) return null
        return when (status) {
            om.qabnah.core.model.DeliveryStatus.PICKED_UP, om.qabnah.core.model.DeliveryStatus.AT_DROPOFF -> dropoff
            om.qabnah.core.model.DeliveryStatus.RETURNING -> pickup
            om.qabnah.core.model.DeliveryStatus.DELIVERED, om.qabnah.core.model.DeliveryStatus.FAILED,
            om.qabnah.core.model.DeliveryStatus.RETURNED, om.qabnah.core.model.DeliveryStatus.CANCELLED,
            om.qabnah.core.model.DeliveryStatus.UNKNOWN -> null
            else -> if (status.isBeforePickup) pickup else dropoff
        }
    }

    /** Straight "still to go" leg drawn dashed from the captain to the next stop; empty when either end is unknown. */
    fun remainingLeg(captain: LatLng?, nextStop: LatLng?): List<LatLng> =
        if (captain == null || nextStop == null) emptyList() else listOf(captain, nextStop)

    /** Breadcrumbs plus the captain's latest fix (deduplicated), capped to the most recent [max] points. */
    fun appendBreadcrumb(path: List<LatLng>, point: LatLng, max: Int = 200): List<LatLng> =
        (if (path.lastOrNull() == point) path else path + point).takeLast(max)
}
