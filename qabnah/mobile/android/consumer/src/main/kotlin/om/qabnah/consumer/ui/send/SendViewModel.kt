package om.qabnah.consumer.ui.send

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import om.qabnah.consumer.data.AccountRepository
import om.qabnah.consumer.data.OrderRepository
import om.qabnah.core.model.CodPayer
import om.qabnah.core.model.DeliveryQuote
import om.qabnah.core.model.LatLng
import om.qabnah.core.model.Order
import om.qabnah.core.model.PackageSize
import om.qabnah.core.model.PaymentMethod
import om.qabnah.core.model.PlaceInput
import om.qabnah.core.model.ShipmentInput
import om.qabnah.core.model.ShipmentPackage
import om.qabnah.core.money.Money
import om.qabnah.core.util.Phones
import java.util.UUID

data class PlaceDraft(
    val location: LatLng? = null,
    val address: String = "",
    val contactName: String = "",
    val contactPhone: String = "",
    val notes: String = "",
) {
    val phoneE164: String? get() = Phones.normalizeOmanMobile(contactPhone)
    val isComplete: Boolean get() = location != null && contactName.isNotBlank() && phoneE164 != null

    fun toInput() = PlaceInput(
        location = location!!,
        address = address.trim().takeIf { it.isNotEmpty() },
        contactName = contactName.trim(),
        contactPhone = phoneE164,
        notes = notes.trim().takeIf { it.isNotEmpty() },
    )
}

enum class Side { PICKUP, DROPOFF }

data class SendUi(
    val pickup: PlaceDraft = PlaceDraft(),
    val dropoff: PlaceDraft = PlaceDraft(),
    val size: PackageSize = PackageSize.SMALL,
    val description: String = "",
    val declaredValue: String = "",
    val paymentMethod: PaymentMethod = PaymentMethod.ONLINE,
    val codPayer: CodPayer = CodPayer.SENDER,
    val quote: DeliveryQuote? = null,
    val quoting: Boolean = false,
    val quoteError: Throwable? = null,
    val submitting: Boolean = false,
    val submitError: Throwable? = null,
    val showValidation: Boolean = false,
) {
    val declaredValueBaisa: Long? get() = declaredValue.takeIf { it.isNotBlank() }?.let { Money.parseOmr(it) }
    val declaredValueInvalid: Boolean get() = declaredValue.isNotBlank() && declaredValueBaisa == null
    val isValid: Boolean
        get() = pickup.isComplete && dropoff.isComplete && description.isNotBlank() && !declaredValueInvalid
    val canSubmit: Boolean get() = isValid && quote != null && !submitting && !quoting
    val placesComplete: Boolean get() = pickup.isComplete && dropoff.isComplete
    val packageComplete: Boolean get() = description.isNotBlank() && !declaredValueInvalid
}

/** C2C parcel: `POST /quotes/delivery` (type c2c) then `POST /shipments` with an Idempotency-Key. */
class SendViewModel(
    private val orders: OrderRepository,
    private val account: AccountRepository,
) : ViewModel() {
    private val _ui = MutableStateFlow(SendUi())
    val ui: StateFlow<SendUi> = _ui.asStateFlow()
    private val _created = MutableSharedFlow<Order>(extraBufferCapacity = 1)
    val created: SharedFlow<Order> = _created.asSharedFlow()
    private var quoteJob: Job? = null
    private var idempotencyKey = UUID.randomUUID().toString()
    private var keyFingerprint: ShipmentInput? = null

    init {
        // Prefill the sender with the signed-in user.
        viewModelScope.launch {
            runCatching { account.me() }.getOrNull()?.user?.let { u ->
                _ui.update { s ->
                    if (s.pickup.contactName.isNotBlank()) s
                    else s.copy(pickup = s.pickup.copy(contactName = u.fullName, contactPhone = u.phone?.removePrefix("+968").orEmpty()))
                }
            }
        }
    }

    fun update(side: Side, transform: (PlaceDraft) -> PlaceDraft) {
        _ui.update { if (side == Side.PICKUP) it.copy(pickup = transform(it.pickup)) else it.copy(dropoff = transform(it.dropoff)) }
    }

    fun setLocation(side: Side, location: LatLng) {
        update(side) { it.copy(location = location) }
        requote()
    }

    /** Highlights incomplete fields (used when the wizard's Next is pressed on an incomplete step). */
    fun showValidation() = _ui.update { it.copy(showValidation = true) }

    fun setSize(size: PackageSize) = _ui.update { it.copy(size = size) }
    fun setDescription(v: String) = _ui.update { it.copy(description = v.take(200)) }
    fun setDeclaredValue(v: String) = _ui.update { it.copy(declaredValue = v.take(12)) }
    fun setPayment(m: PaymentMethod) = _ui.update { it.copy(paymentMethod = m) }
    fun setCodPayer(p: CodPayer) = _ui.update { it.copy(codPayer = p) }

    fun requote() {
        val s = _ui.value
        val from = s.pickup.location ?: return
        val to = s.dropoff.location ?: return
        quoteJob?.cancel()
        quoteJob = viewModelScope.launch {
            _ui.update { it.copy(quoting = true, quoteError = null) }
            try {
                val q = orders.quoteParcel(from, to)
                _ui.update { it.copy(quote = q, quoting = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.update { it.copy(quote = null, quoting = false, quoteError = e) }
            }
        }
    }

    fun submit() {
        val s = _ui.value
        if (!s.isValid) {
            _ui.update { it.copy(showValidation = true) }
            return
        }
        if (!s.canSubmit) return
        val input = ShipmentInput(
            pickup = s.pickup.toInput(),
            dropoff = s.dropoff.toInput(),
            pkg = ShipmentPackage(s.size, s.description.trim(), s.declaredValueBaisa),
            paymentMethod = s.paymentMethod,
            codPayer = if (s.paymentMethod == PaymentMethod.COD) s.codPayer else null,
        )
        if (input != keyFingerprint) {
            keyFingerprint = input
            idempotencyKey = UUID.randomUUID().toString()
        }
        viewModelScope.launch {
            _ui.update { it.copy(submitting = true, submitError = null) }
            try {
                val order = orders.createShipment(input, idempotencyKey)
                _ui.value = SendUi(pickup = s.pickup.copy(location = null, address = "", notes = ""))
                _created.emit(order)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.update { it.copy(submitting = false, submitError = e) }
            }
        }
    }
}
