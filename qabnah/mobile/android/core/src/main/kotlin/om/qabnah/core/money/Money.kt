package om.qabnah.core.money

import kotlin.math.abs

/** Arabic-Indic digit helpers (٠١٢٣٤٥٦٧٨٩). */
object Digits {
    private const val ARABIC_ZERO = '٠'
    private const val PERSIAN_ZERO = '۰'

    fun toArabicIndic(s: String): String = buildString(s.length) {
        for (c in s) append(if (c in '0'..'9') ARABIC_ZERO + (c - '0') else c)
    }

    /** Converts Arabic-Indic and Extended (Persian) digits to ASCII; other characters are kept. */
    fun toAscii(s: String): String = buildString(s.length) {
        for (c in s) {
            append(
                when (c) {
                    in ARABIC_ZERO..'٩' -> '0' + (c - ARABIC_ZERO)
                    in PERSIAN_ZERO..'۹' -> '0' + (c - PERSIAN_ZERO)
                    else -> c
                },
            )
        }
    }
}

/**
 * OMR amounts are integer baisa (1 OMR = 1000 baisa) and always shown with three decimals.
 * - English: `OMR 2.500`, `OMR 1,250.000`, `-OMR 0.750`
 * - Arabic:  `٢٫٥٠٠ ر.ع.`, `١٬٢٥٠٫٠٠٠ ر.ع.`, `-٠٫٧٥٠ ر.ع.`
 */
object Money {
    const val BAISA_PER_OMR = 1000L
    private const val AR_DECIMAL = '٫' // ٫
    private const val AR_GROUP = '٬'   // ٬
    const val AR_CURRENCY = "ر.ع."

    fun format(baisa: Long, arabic: Boolean): String {
        val sign = if (baisa < 0) "-" else ""
        val amount = amount(abs(baisa), arabic)
        return if (arabic) "$sign$amount $AR_CURRENCY" else "${sign}OMR $amount"
    }

    fun format(baisa: Int, arabic: Boolean): String = format(baisa.toLong(), arabic)

    /** The number only, e.g. `2.500` / `٢٫٥٠٠`. */
    fun amount(baisa: Long, arabic: Boolean): String {
        val sign = if (baisa < 0) "-" else ""
        val a = abs(baisa)
        val whole = (a / BAISA_PER_OMR).toString()
        val frac = (a % BAISA_PER_OMR).toString().padStart(3, '0')
        val grouped = whole.reversed().chunked(3).joinToString(",").reversed()
        return if (arabic) {
            sign + Digits.toArabicIndic(grouped).replace(',', AR_GROUP) + AR_DECIMAL + Digits.toArabicIndic(frac)
        } else {
            "$sign$grouped.$frac"
        }
    }

    /**
     * Parses user input in OMR ("2.5", "2,500.750", "٢٫٥") into baisa. Max three decimals; returns null if invalid.
     */
    fun parseOmr(input: String): Long? {
        var s = Digits.toAscii(input.trim())
            .replace(AR_DECIMAL, '.')
            .replace(AR_GROUP.toString(), "")
            .replace(",", "")
            .replace(AR_CURRENCY, "")
            .replace("OMR", "", ignoreCase = true)
            .trim()
        if (s.isEmpty()) return null
        val negative = s.startsWith("-")
        if (negative) s = s.substring(1)
        if (!Regex("""\d*(\.\d{0,3})?""").matches(s) || s == "." ) return null
        val parts = s.split('.')
        val whole = parts[0].ifEmpty { "0" }.toLongOrNull() ?: return null
        val frac = parts.getOrNull(1)?.padEnd(3, '0')?.toLongOrNull() ?: 0L
        val value = whole * BAISA_PER_OMR + frac
        return if (negative) -value else value
    }
}

/** Distances and durations, localized digits. */
object Units {
    fun distance(meters: Int, arabic: Boolean): String {
        val text = if (meters < 1000) {
            "$meters"
        } else {
            val tenths = (meters + 50) / 100 // round to 0.1 km
            "${tenths / 10}.${tenths % 10}"
        }
        val unit = when {
            meters < 1000 && arabic -> "م"
            meters < 1000 -> "m"
            arabic -> "كم"
            else -> "km"
        }
        val number = if (arabic) Digits.toArabicIndic(text).replace('.', '٫') else text
        return "$number $unit"
    }

    /** Rounded-up minutes, at least 1. */
    fun minutes(seconds: Int, arabic: Boolean): String {
        val m = ((seconds + 59) / 60).coerceAtLeast(1)
        return if (arabic) "${Digits.toArabicIndic(m.toString())} د" else "$m min"
    }

    fun localizeDigits(text: String, arabic: Boolean) = if (arabic) Digits.toArabicIndic(text) else text
}
