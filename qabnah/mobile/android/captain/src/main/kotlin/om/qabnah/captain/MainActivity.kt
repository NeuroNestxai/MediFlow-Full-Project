package om.qabnah.captain

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import om.qabnah.android.locale.AppLocale
import om.qabnah.android.ui.theme.QabnahTheme
import om.qabnah.captain.ui.CaptainRoot

/** AppCompatActivity (not ComponentActivity) so AppCompatDelegate can apply the in-app language on API < 33. */
class MainActivity : AppCompatActivity() {
    private val container get() = (application as CaptainApp).container

    override fun onCreate(savedInstanceState: Bundle?) {
        AppLocale.ensureDefault()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            QabnahTheme {
                CaptainRoot(container)
            }
        }
    }

    override fun onStart() {
        super.onStart()
        container.appVisible.value = true
    }

    override fun onStop() {
        container.appVisible.value = false
        super.onStop()
    }
}
