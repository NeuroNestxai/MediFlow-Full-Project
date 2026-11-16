package om.qabnah.captain.ui.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import om.qabnah.android.state.Loadable
import om.qabnah.android.state.launchLoad
import om.qabnah.captain.data.CaptainRepository
import om.qabnah.core.model.AvailabilitySlot
import om.qabnah.core.model.Zone
import om.qabnah.core.util.Availability

data class ZonesUi(val selected: Set<String> = emptySet(), val saving: Boolean = false, val error: Throwable? = null)

/** `GET /zones` → checkboxes → `PUT /captain/zones`. */
class ZonesViewModel(private val repo: CaptainRepository) : ViewModel() {
    private val _zones = MutableStateFlow(Loadable<List<Zone>>())
    val zones: StateFlow<Loadable<List<Zone>>> = _zones.asStateFlow()
    private val _ui = MutableStateFlow(ZonesUi(selected = repo.profile.value?.zoneIds.orEmpty().toSet()))
    val ui: StateFlow<ZonesUi> = _ui.asStateFlow()
    private val _saved = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val saved: SharedFlow<Unit> = _saved.asSharedFlow()

    init { load() }

    fun load(refresh: Boolean = false) = _zones.launchLoad(viewModelScope, refresh) { repo.zones() }

    fun toggle(id: String) = _ui.update { it.copy(selected = if (id in it.selected) it.selected - id else it.selected + id, error = null) }

    fun save() {
        viewModelScope.launch {
            _ui.update { it.copy(saving = true, error = null) }
            try {
                repo.setZones(_ui.value.selected.toList())
                _ui.update { it.copy(saving = false) }
                _saved.emit(Unit)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.update { it.copy(saving = false, error = e) }
            }
        }
    }
}

data class AvailabilityUi(
    val slots: List<AvailabilitySlot> = emptyList(),
    val issues: List<Availability.Issue> = emptyList(),
    val saving: Boolean = false,
    val error: Throwable? = null,
    val dirty: Boolean = false,
)

/** Weekly schedule editor → `PUT /captain/availability` (Muscat local time, weekday 0 = Sunday). */
class AvailabilityViewModel(private val repo: CaptainRepository) : ViewModel() {
    private val _ui = MutableStateFlow(AvailabilityUi(slots = repo.profile.value?.availability.orEmpty().sortedWith(slotOrder)))
    val ui: StateFlow<AvailabilityUi> = _ui.asStateFlow()
    private val _saved = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val saved: SharedFlow<Unit> = _saved.asSharedFlow()

    fun add(weekday: Int, start: String, end: String) = setSlots(_ui.value.slots + AvailabilitySlot(weekday, start, end))
    fun remove(slot: AvailabilitySlot) = setSlots(_ui.value.slots - slot)

    /** Copies one day's slots to every other day (common for full-time captains). */
    fun copyToAllDays(weekday: Int) {
        val day = _ui.value.slots.filter { it.weekday == weekday }
        setSlots((0..6).flatMap { d -> day.map { it.copy(weekday = d) } })
    }

    private fun setSlots(slots: List<AvailabilitySlot>) {
        val sorted = slots.distinct().sortedWith(slotOrder)
        _ui.update { it.copy(slots = sorted, issues = Availability.validate(sorted), dirty = true, error = null) }
    }

    fun save() {
        val s = _ui.value
        if (s.issues.isNotEmpty()) return
        viewModelScope.launch {
            _ui.update { it.copy(saving = true, error = null) }
            try {
                repo.setAvailability(s.slots)
                _ui.update { it.copy(saving = false, dirty = false) }
                _saved.emit(Unit)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.update { it.copy(saving = false, error = e) }
            }
        }
    }

    private companion object {
        val slotOrder = compareBy<AvailabilitySlot>({ it.weekday }, { it.start })
    }
}
