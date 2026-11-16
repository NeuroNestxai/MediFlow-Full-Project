package androidx.core.os

import java.util.Locale

class LocaleListCompat private constructor() {
    val isEmpty: Boolean get() = TODO()
    operator fun get(index: Int): Locale? = TODO()
    companion object {
        @JvmStatic fun forLanguageTags(list: String?): LocaleListCompat = TODO()
    }
}
