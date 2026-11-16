package androidx.appcompat.app

import androidx.core.os.LocaleListCompat

open class AppCompatActivity : androidx.activity.ComponentActivity()

abstract class AppCompatDelegate {
    companion object {
        @JvmStatic fun getApplicationLocales(): LocaleListCompat = TODO()
        @JvmStatic fun setApplicationLocales(locales: LocaleListCompat) {}
    }
}
