package om.qabnah.consumer

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import om.qabnah.android.links.DeepLinkIntents
import om.qabnah.android.locale.AppLocale
import om.qabnah.android.ui.theme.QabnahPalette
import om.qabnah.android.ui.theme.QabnahTheme
import om.qabnah.consumer.ui.ConsumerRoot
import om.qabnah.core.push.ClientApp

/** AppCompatActivity (not ComponentActivity) so AppCompatDelegate can apply the in-app language on API < 33. */
class MainActivity : AppCompatActivity() {
    private val container get() = (application as ConsumerApp).container

    override fun onCreate(savedInstanceState: Bundle?) {
        AppLocale.ensureDefault()
        super.onCreate(savedInstanceState)
        // The consumer app is always the light "sand" theme: dark system-bar icons regardless of the system dark mode.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        // Only for a fresh launch: after a configuration change the link was already handled.
        if (savedInstanceState == null) container.deepLinks.post(DeepLinkIntents.parse(intent, ClientApp.CONSUMER))
        setContent {
            QabnahTheme(QabnahPalette.SAND) {
                ConsumerRoot(container)
            }
        }
    }

    /** singleTask: qabnah:// links and notification taps arrive here while the app is running. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        container.deepLinks.post(DeepLinkIntents.parse(intent, ClientApp.CONSUMER))
    }
}
