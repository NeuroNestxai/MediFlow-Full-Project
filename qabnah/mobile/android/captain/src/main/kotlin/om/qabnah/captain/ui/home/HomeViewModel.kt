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
import om.qabnah.core.model.Earnings
import om.qabnah.core.model.LatLng
import om.qabnah.core.util.DateRanges
import om.qabnah.android.location.LocationProvider
import om.qabnah.captain.data.LocationReporter

data class OnlineUi(val busy: Boolean = false, val error: Throwable? = null)

class HomeViewModel(
    private val repo: CaptainRepository,
    private val online: OnlineController,
    offers: OfferRepository,
    private val location: LocationProvider,
    reporter: LocationReporter,
) : ViewModel() {
    val profile: StateFlow<CaptainProfile?> = repo.profile
    private val _active = MutableStateFlow(Loadable<List<CaptainDelivery>>())
    val active: StateFlow<Loadable<List<CaptainDelivery>>> = _active.asStateFlow()
    private val _online = MutableStateFlow(OnlineUi())
    val onlineUi: StateFlow<OnlineUi> = _online.asStateFlow()

    /** Today's earnings (Muscat day) for the strip on the home sheet; null until loaded or when the call fails. */
    private val _today = MutableStateFlow<Earnings?>(null)
    val today: StateFlow<Earnings?> = _today.asStateFlow()

    /** Where to centre the map: the live fix while online, else a one-shot fix when location is permitted. */
    private val _position = MutableStateFlow(reporter.last.value)
    val position: StateFlow<LatLng?> = _position.asStateFlow()

    init {
        viewModelScope.launch {
            offers.deliveriesChanged.collect {
                loadActive(refresh = true)
                loadToday()
            }
        }
        viewModelScope.launch { reporter.last.collect { fix -> if (fix != null) _position.value = fix } }
    }

    fun refresh() {
        viewModelScope.launch { runCatching { repo.refreshProfile() } }
        loadActive(refresh = _active.value.data != null)
        loadToday()
        if (_position.value == null && location.hasPermission()) {
            viewModelScope.launch { runCatching { location.current() }.getOrNull()?.let { _position.value = it } }
        }
    }

    private fun loadToday() {
        viewModelScope.launch {
            runCatching { repo.earnings(DateRanges.of(DateRanges.Preset.TODAY)) }.onSuccess { _today.value = it }
        }
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
