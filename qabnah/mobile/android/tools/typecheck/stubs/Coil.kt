package coil.compose

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale

// coil-compose 2.7: AsyncImagePainter.State and the AsyncImage overload with state callbacks.
class AsyncImagePainter private constructor() {
    sealed class State {
        abstract val painter: Painter?
        data object Empty : State() { override val painter: Painter? get() = null }
        data class Loading(override val painter: Painter?) : State()
        data class Success(override val painter: Painter) : State()
        data class Error(override val painter: Painter?) : State()
    }
}

@Composable
fun AsyncImage(
    model: Any?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    placeholder: Painter? = null,
    error: Painter? = null,
    fallback: Painter? = error,
    onLoading: ((AsyncImagePainter.State.Loading) -> Unit)? = null,
    onSuccess: ((AsyncImagePainter.State.Success) -> Unit)? = null,
    onError: ((AsyncImagePainter.State.Error) -> Unit)? = null,
    alignment: androidx.compose.ui.Alignment = androidx.compose.ui.Alignment.Center,
    contentScale: ContentScale = ContentScale.Fit,
) {}
