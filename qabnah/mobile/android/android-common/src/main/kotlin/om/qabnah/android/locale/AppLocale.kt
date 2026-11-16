package om.qabnah.android.locale

import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.core.os.LocaleListCompat
import java.util.Locale

/**
 * Per-app language via AppCompat (backported to API 24 with `autoStoreLocales` in the manifest).
 * Arabic (RTL) is the default on first launch; users switch in Account/Profile.
 */
object AppLocale {
    const val ARABIC = "ar"
    const val ENGLISH = "en"

    /** Call from Activity.onCreate before super.onCreate. Sets Arabic if the user never chose a language. */
    fun ensureDefault() {
        if (AppCompatDelegate.getApplicationLocales().isEmpty) {
            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(ARABIC))
        }
    }

    fun set(language: String) {
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(language))
    }

    fun currentLanguage(): String =
        AppCompatDelegate.getApplicationLocales()[0]?.language ?: Locale.getDefault().language

    fun isArabic(): Boolean = currentLanguage() == ARABIC
}

/** True when the composition renders in Arabic (drives number formatting and bilingual field choice). */
@Composable
@ReadOnlyComposable
fun isArabic(): Boolean = LocalConfiguration.current.locales[0]?.language == AppLocale.ARABIC
