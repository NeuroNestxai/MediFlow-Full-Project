package om.qabnah.captain.ui.onboarding

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import om.qabnah.android.state.Loadable
import om.qabnah.android.state.launchLoad
import om.qabnah.android.util.PreparedUpload
import om.qabnah.captain.data.CaptainRepository
import om.qabnah.core.model.CaptainDocType
import om.qabnah.core.model.CaptainProfile

data class DocumentsUi(
    val uploading: CaptainDocType? = null,
    val error: Throwable? = null,
    /** A picked file waiting for the optional number / expiry before upload. */
    val pending: PendingDoc? = null,
)

data class PendingDoc(val type: CaptainDocType, val uri: Uri)

/** Checklist from `GET /captain/profile`; uploads via `POST /files` + `POST /captain/documents`. */
class DocumentsViewModel(
    private val repo: CaptainRepository,
    private val reader: suspend (Uri) -> PreparedUpload,
) : ViewModel() {
    private val _profile = MutableStateFlow(Loadable<CaptainProfile>(data = repo.profile.value))
    val profile: StateFlow<Loadable<CaptainProfile>> = _profile.asStateFlow()
    private val _ui = MutableStateFlow(DocumentsUi())
    val ui: StateFlow<DocumentsUi> = _ui.asStateFlow()

    init { load(refresh = _profile.value.data != null) }

    fun load(refresh: Boolean = false) {
        _profile.launchLoad(viewModelScope, refresh) { repo.refreshProfile() }
    }

    fun picked(type: CaptainDocType, uri: Uri) = _ui.update { it.copy(pending = PendingDoc(type, uri), error = null) }
    fun cancelPending() = _ui.update { it.copy(pending = null) }

    fun upload(number: String?, expiresAt: String?) {
        val p = _ui.value.pending ?: return
        _ui.update { it.copy(pending = null, uploading = p.type, error = null) }
        viewModelScope.launch {
            try {
                val file = reader(p.uri)
                val profile = repo.uploadDocument(file, p.type, number, expiresAt)
                _profile.value = Loadable(profile)
                _ui.update { it.copy(uploading = null) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.update { it.copy(uploading = null, error = e) }
            }
        }
    }
}
