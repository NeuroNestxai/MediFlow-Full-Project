// Stubs for Android-only Compose APIs that desktop Compose lacks. Signatures mirror the androidx ones used by the apps.
package androidx.compose.ui.platform

import androidx.compose.runtime.staticCompositionLocalOf

val LocalContext = staticCompositionLocalOf<android.content.Context> { error("stub") }
val LocalConfiguration = staticCompositionLocalOf<android.content.res.Configuration> { error("stub") }
