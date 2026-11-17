package androidx.activity

open class ComponentActivity : android.app.Activity()

// activity 1.8+: EdgeToEdge.kt
class SystemBarStyle private constructor() {
    companion object {
        @JvmStatic fun auto(lightScrim: Int, darkScrim: Int): SystemBarStyle = TODO()
        @JvmStatic fun dark(scrim: Int): SystemBarStyle = TODO()
        @JvmStatic fun light(scrim: Int, darkScrim: Int): SystemBarStyle = TODO()
    }
}

fun ComponentActivity.enableEdgeToEdge(
    statusBarStyle: SystemBarStyle = SystemBarStyle.auto(0, 0),
    navigationBarStyle: SystemBarStyle = SystemBarStyle.auto(0, 0),
) {}
