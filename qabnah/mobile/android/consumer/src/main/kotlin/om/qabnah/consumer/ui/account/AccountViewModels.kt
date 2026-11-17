package om.qabnah.consumer.ui.account

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
import om.qabnah.android.locale.AppLocale
import om.qabnah.android.push.PushManager
import om.qabnah.android.state.Loadable
import om.qabnah.android.state.launchLoad
import om.qabnah.consumer.data.AccountRepository
import om.qabnah.consumer.data.CartRepository
import om.qabnah.core.model.Address
import om.qabnah.core.model.AddressInput
import om.qabnah.core.model.LatLng
import om.qabnah.core.model.Me
import om.qabnah.core.realtime.RealtimeClient

class AccountViewModel(
    private val repo: AccountRepository,
    private val cart: CartRepository,
    private val realtime: RealtimeClient,
    private val push: PushManager,
) : ViewModel() {
    private val _me = MutableStateFlow(Loadable<Me>())
    val me: StateFlow<Loadable<Me>> = _me.asStateFlow()
    private val _unread = MutableStateFlow(0)
    val unread: StateFlow<Int> = _unread.asStateFlow()
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()
    private val _error = MutableStateFlow<Throwable?>(null)
    val error: StateFlow<Throwable?> = _error.asStateFlow()

    fun load(refresh: Boolean = false) {
        _me.launchLoad(viewModelScope, refresh) { repo.me() }
        viewModelScope.launch { runCatching { repo.unreadNotifications() }.onSuccess { _unread.value = it } }
    }

    fun rename(name: String) {
        if (name.isBlank()) return
        viewModelScope.launch {
            _busy.value = true
            try {
                _me.value = Loadable(repo.updateName(name.trim()))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _error.value = e
            } finally {
                _busy.value = false
            }
        }
    }

    /** Switches the UI language immediately and stores the preference server-side (for SMS/push language). */
    fun setLanguage(language: String) {
        viewModelScope.launch { runCatching { repo.updateLocale(language) } }
        AppLocale.set(language)
    }

    fun signOut() {
        viewModelScope.launch {
            _busy.value = true
            push.unregister() // POST /me/devices/unregister while the session is still valid
            realtime.disconnect()
            cart.clear()
            repo.signOut() // clears tokens → protected tabs show the sign-in screen
            _busy.value = false
        }
    }

    fun clearError() { _error.value = null }
}

class AddressesViewModel(private val repo: AccountRepository) : ViewModel() {
    private val _state = MutableStateFlow(Loadable<List<Address>>())
    val state: StateFlow<Loadable<List<Address>>> = _state.asStateFlow()

    fun load(refresh: Boolean = false) {
        _state.launchLoad(viewModelScope, refresh) { repo.addresses() }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            try {
                repo.deleteAddress(id)
                _state.update { it.copy(data = it.data?.filterNot { a -> a.id == id }) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(error = e) }
            }
        }
    }

    fun makeDefault(address: Address) {
        viewModelScope.launch {
            try {
                repo.updateAddress(address.id, address.toInput(isDefault = true))
                load(refresh = true)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(error = e) }
            }
        }
    }
}

data class AddressForm(
    val location: LatLng? = null,
    val label: String = "home",
    val area: String = "",
    val street: String = "",
    val building: String = "",
    val floor: String = "",
    val apartment: String = "",
    val landmark: String = "",
    val contactName: String = "",
    val contactPhone: String = "",
    val isDefault: Boolean = false,
    val loading: Boolean = false,
    val saving: Boolean = false,
    val error: Throwable? = null,
    /** Set after saving when the server says the address is outside every zone. */
    val outsideServiceArea: Boolean = false,
)

/** Create (`POST /me/addresses`) or edit (`PATCH /me/addresses/{id}`) an address pinned on the map. */
class AddressEditViewModel(private val repo: AccountRepository, private val addressId: String?) : ViewModel() {
    private val _form = MutableStateFlow(AddressForm(loading = addressId != null))
    val form: StateFlow<AddressForm> = _form.asStateFlow()
    private val _saved = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val saved: SharedFlow<String> = _saved.asSharedFlow()

    init {
        if (addressId != null) {
            viewModelScope.launch {
                try {
                    val a = repo.addresses().first { it.id == addressId }
                    _form.value = AddressForm(
                        location = a.location, label = a.label.orEmpty(), area = a.area.orEmpty(), street = a.street.orEmpty(),
                        building = a.building.orEmpty(), floor = a.floor.orEmpty(), apartment = a.apartment.orEmpty(),
                        landmark = a.landmark.orEmpty(), contactName = a.contactName.orEmpty(), contactPhone = a.contactPhone.orEmpty(),
                        isDefault = a.isDefault,
                    )
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    _form.update { it.copy(loading = false, error = e) }
                }
            }
        }
    }

    fun edit(transform: (AddressForm) -> AddressForm) = _form.update { transform(it).copy(error = null) }

    fun save() {
        val f = _form.value
        val location = f.location ?: return
        viewModelScope.launch {
            _form.update { it.copy(saving = true, error = null) }
            val input = AddressInput(
                label = f.label.trim().ifEmpty { null },
                location = location,
                area = f.area.trim().ifEmpty { null },
                street = f.street.trim().ifEmpty { null },
                building = f.building.trim().ifEmpty { null },
                floor = f.floor.trim().ifEmpty { null },
                apartment = f.apartment.trim().ifEmpty { null },
                landmark = f.landmark.trim().ifEmpty { null },
                contactName = f.contactName.trim().ifEmpty { null },
                contactPhone = f.contactPhone.trim().ifEmpty { null },
                isDefault = f.isDefault,
            )
            try {
                val saved = if (addressId == null) repo.createAddress(input) else repo.updateAddress(addressId, input)
                _form.update { it.copy(saving = false, outsideServiceArea = !saved.isInServiceArea) }
                _saved.emit(saved.id)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _form.update { it.copy(saving = false, error = e) }
            }
        }
    }
}
