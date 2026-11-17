package om.qabnah.android.state

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Screen data state: [data] is kept while refreshing so pull-to-refresh never blanks the screen.
 * [error] is a Throwable so the UI can localize it (see `errorMessage()`).
 */
data class Loadable<T>(
    val data: T? = null,
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val error: Throwable? = null,
) {
    val isInitialLoading: Boolean get() = loading && data == null
    val showFullError: Boolean get() = error != null && data == null && !loading
}

/** Runs [block] and stores its result. `refresh = true` shows the pull-to-refresh indicator instead of a spinner. */
fun <T> MutableStateFlow<Loadable<T>>.launchLoad(
    scope: CoroutineScope,
    refresh: Boolean = false,
    block: suspend () -> T,
): Job = scope.launch {
    update { it.copy(loading = !refresh, refreshing = refresh, error = null) }
    try {
        val result = block()
        update { Loadable(data = result) }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        android.util.Log.w("QabnahLoad", "Load failed", e)
        update { it.copy(loading = false, refreshing = false, error = e) }
    }
}
