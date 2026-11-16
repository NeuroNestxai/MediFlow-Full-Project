package androidx.activity.compose

import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContract
import androidx.compose.runtime.Composable

class ManagedActivityResultLauncher<I, O> : ActivityResultLauncher<I>() {
    override fun launch(input: I) {}
}

@Composable
fun <I, O> rememberLauncherForActivityResult(contract: ActivityResultContract<I, O>, onResult: (O) -> Unit): ManagedActivityResultLauncher<I, O> = TODO()

fun androidx.activity.ComponentActivity.setContent(parent: androidx.compose.runtime.CompositionContext? = null, content: @Composable () -> Unit) {}
