package om.qabnah.android.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import om.qabnah.core.model.LatLng
import om.qabnah.core.util.Phones

/** Navigation apps offered to captains. */
enum class NavApp { GOOGLE_MAPS, WAZE, OTHER }

object Intents {
    fun dial(context: Context, phone: String) {
        start(context, Intent(Intent.ACTION_DIAL, Uri.parse(Phones.dialUri(phone))))
    }

    /** Opens a chat via `https://wa.me/<digits>` (WhatsApp app if installed, else the browser). */
    fun whatsapp(context: Context, phone: String) {
        val url = Phones.whatsappUrl(phone) ?: return
        start(context, Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }

    /**
     * Turn-by-turn navigation. Google Maps: `google.navigation:q=lat,lng`; Waze: `https://waze.com/ul?ll=…&navigate=yes`;
     * otherwise a generic `geo:` URI. Falls back to `geo:` when the chosen app is not installed.
     */
    fun navigate(context: Context, to: LatLng, app: NavApp, label: String? = null) {
        val geo = Uri.parse("geo:${to.lat},${to.lng}?q=${to.lat},${to.lng}" + (label?.let { "(" + Uri.encode(it) + ")" } ?: ""))
        val intent = when (app) {
            NavApp.GOOGLE_MAPS -> Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=${to.lat},${to.lng}"))
                .setPackage("com.google.android.apps.maps")
            NavApp.WAZE -> Intent(Intent.ACTION_VIEW, Uri.parse("https://waze.com/ul?ll=${to.lat},${to.lng}&navigate=yes"))
                .setPackage("com.waze")
            NavApp.OTHER -> Intent(Intent.ACTION_VIEW, geo)
        }
        try {
            context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            start(context, Intent(Intent.ACTION_VIEW, geo))
        }
    }

    /** Hosted payment page in a Custom Tab; the app polls the order when it resumes. */
    fun openCustomTab(context: Context, url: String, toolbarColor: Int) {
        val tab = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .setDefaultColorSchemeParams(CustomTabColorSchemeParams.Builder().setToolbarColor(toolbarColor).build())
            .build()
        try {
            tab.launchUrl(context, Uri.parse(url))
        } catch (e: ActivityNotFoundException) {
            start(context, Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }
    }

    fun openAppSettings(context: Context) {
        start(
            context,
            Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)),
        )
    }

    private fun start(context: Context, intent: Intent) {
        try {
            context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(context, intent.data?.toString() ?: "", Toast.LENGTH_SHORT).show()
        }
    }
}
