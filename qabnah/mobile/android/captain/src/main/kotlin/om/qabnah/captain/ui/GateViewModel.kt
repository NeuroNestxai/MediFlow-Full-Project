package om.qabnah.captain.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import om.qabnah.captain.data.CaptainRepository
import om.qabnah.captain.data.OnlineController

sealed interface GateState {
    data object Loading : GateState
    data object NeedsRegistration : GateState
    data object Ready : GateState
    data class Failed(val error: Throwable) : GateState
}

class GateViewModel(private val repo: CaptainRepository, private val online: OnlineController) : ViewModel() {
    private val _state = MutableStateFlow<GateState>(GateState.Loading)
    val state: StateFlow<GateState> = _state.asStateFlow()

    fun load() {
        viewModelScope.launch {
            _state.value = GateState.Loading
            try {
                val me = repo.me()
                val captain = me.captain
                if (captain == null) {
                    _state.value = GateState.NeedsRegistration
                } else {
                    // Full profile carries the onboarding checklist (requiredDocuments/missingDocuments).
                    val profile = runCatching { repo.refreshProfile() }.getOrDefault(captain)
                    online.resume(profile)
                    _state.value = GateState.Ready
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.value = GateState.Failed(e)
            }
        }
    }
}
