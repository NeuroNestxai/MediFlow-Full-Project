package androidx.browser.customtabs

import android.content.Context
import android.net.Uri

class CustomTabColorSchemeParams private constructor() {
    class Builder {
        fun setToolbarColor(color: Int): Builder = this
        fun build(): CustomTabColorSchemeParams = TODO()
    }
}

class CustomTabsIntent private constructor() {
    fun launchUrl(context: Context, url: Uri) {}
    class Builder {
        fun setShowTitle(show: Boolean): Builder = this
        fun setDefaultColorSchemeParams(params: CustomTabColorSchemeParams): Builder = this
        fun build(): CustomTabsIntent = TODO()
    }
}
