package om.qabnah.consumer

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import om.qabnah.android.locale.AppLocale
import om.qabnah.android.ui.theme.QabnahTheme
import om.qabnah.consumer.ui.ConsumerRoot

/** AppCompatActivity (not ComponentActivity) so AppCompatDelegate can apply the in-app language on API < 33. */
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        AppLocale.ensureDefault()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as ConsumerApp).container
        setContent {
            QabnahTheme {
                ConsumerRoot(container)
            }
        }
    }
}
