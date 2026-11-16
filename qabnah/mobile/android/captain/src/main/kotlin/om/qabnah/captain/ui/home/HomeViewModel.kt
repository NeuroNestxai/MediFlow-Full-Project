package om.qabnah.captain.ui.home

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
import om.qabnah.captain.data.CaptainRepository
import om.qabnah.captain.data.OfferRepository
import om.qabnah.captain.data.OnlineController
import om.qabnah.core.model.CaptainDelivery
import om.qabnah.core.model.CaptainProfile

data class OnlineUi(val busy: Boolean = false, val error: Throwable? = null)

class HomeViewModel(
    private val repo: CaptainRepository,
    private val online: OnlineController,
    offers: OfferRepository,
) : ViewModel() {
    val profile: StateFlow<CaptainProfile?> = repo.profile
    private val _active = MutableStateFlow(Loadable<List<CaptainDelivery>>())
    val active: StateFlow<Loadable<List<CaptainDelivery>>> = _active.asStateFlow()
    private val _online = MutableStateFlow(OnlineUi())
    val onlineUi: StateFlow<OnlineUi> = _online.asStateFlow()

    init {
        viewModelScope.launch { offers.deliveriesChanged.collect { loadActive(refresh = true) } }
    }

    fun refresh() {
        viewModelScope.launch { runCatching { repo.refreshProfile() } }
        loadActive(refresh = _active.value.data != null)
    }

    private fun loadActive(refresh: Boolean) {
        _active.launchLoad(viewModelScope, refresh) { repo.deliveries(active = true).items }
    }

    fun canTrack() = online.canTrack()

    fun setOnline(target: Boolean) {
        if (_online.value.busy) return
        viewModelScope.launch {
            _online.value = OnlineUi(busy = true)
            try {
                if (target) online.goOnline() else online.goOffline()
                _online.value = OnlineUi()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _online.value = OnlineUi(error = e)
            }
        }
    }

    fun clearError() = _online.update { it.copy(error = null) }
}
