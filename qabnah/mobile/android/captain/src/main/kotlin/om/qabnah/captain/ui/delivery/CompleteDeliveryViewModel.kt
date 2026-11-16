package om.qabnah.captain.ui.delivery

import android.net.Uri
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
import om.qabnah.android.location.LocationProvider
import om.qabnah.android.util.PreparedUpload
import om.qabnah.captain.data.CaptainRepository
import om.qabnah.captain.data.LocationReporter
import om.qabnah.core.api.ApiException
import om.qabnah.core.model.CaptainDelivery
import om.qabnah.core.model.CompleteDeliveryInput
import om.qabnah.core.money.Digits
import om.qabnah.core.money.Money

data class CompleteUi(
    val delivery: CaptainDelivery? = null,
    val loadError: Throwable? = null,
    val pin: String = "",
    val recipientName: String = "",
    /** COD collected in OMR, prefilled with the amount due. */
    val codText: String = "",
    val note: String = "",
    val photoUri: Uri? = null,
    val photoFileId: String? = null,
    val photoUploading: Boolean = false,
    val photoError: Throwable? = null,
    val submitting: Boolean = false,
    /** Inline errors keyed by request field (pin, codCollectedBaisa, photoFileId, recipientName). */
    val fieldErrors: Map<String, String> = emptyMap(),
    val localError: LocalError? = null,
    val error: Throwable? = null,
) {
    enum class LocalError { PIN_OR_PHOTO, BAD_COD_AMOUNT }

    val codDue: Long get() = delivery?.codAmountBaisa ?: 0
    val codCollectedBaisa: Long? get() = if (codDue > 0) Money.parseOmr(codText) else null
}

/** Proof of delivery → `POST /captain/deliveries/{id}/complete`; 422 errors are shown next to their fields. */
class CompleteDeliveryViewModel(
    private val repo: CaptainRepository,
    private val location: LocationProvider,
    private val reporter: LocationReporter,
    private val reader: suspend (Uri) -> PreparedUpload,
    private val id: String,
) : ViewModel() {
    private val _ui = MutableStateFlow(CompleteUi())
    val ui: StateFlow<CompleteUi> = _ui.asStateFlow()
    private val _done = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val done: SharedFlow<Unit> = _done.asSharedFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            try {
                val d = repo.delivery(id)
                _ui.update {
                    it.copy(
                        delivery = d,
                        loadError = null,
                        codText = if (d.codAmountBaisa > 0) Money.amount(d.codAmountBaisa, arabic = false) else "",
                        recipientName = it.recipientName.ifEmpty { d.dropoff.contactName.orEmpty() },
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.update { it.copy(loadError = e) }
            }
        }
    }

    fun setPin(v: String) = _ui.update { it.copy(pin = Digits.toAscii(v).filter(Char::isDigit).take(8), fieldErrors = it.fieldErrors - "pin", localError = null) }
    fun setRecipient(v: String) = _ui.update { it.copy(recipientName = v.take(80), fieldErrors = it.fieldErrors - "recipientName") }
    fun setCod(v: String) = _ui.update { it.copy(codText = v.take(12), fieldErrors = it.fieldErrors - "codCollectedBaisa", localError = null) }
    fun setNote(v: String) = _ui.update { it.copy(note = v.take(300)) }

    fun onPhotoTaken(uri: Uri) {
        _ui.update { it.copy(photoUri = uri, photoUploading = true, photoError = null, photoFileId = null, localError = null) }
        viewModelScope.launch {
            try {
                val ref = repo.uploadProof(reader(uri))
                _ui.update { it.copy(photoFileId = ref.id, photoUploading = false, fieldErrors = it.fieldErrors - "photoFileId") }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.update { it.copy(photoUploading = false, photoError = e) }
            }
        }
    }

    fun submit() {
        val s = _ui.value
        val d = s.delivery ?: return
        if (s.submitting || s.photoUploading) return
        if (d.pinRequired && s.pin.isBlank() && s.photoFileId == null) {
            _ui.update { it.copy(localError = CompleteUi.LocalError.PIN_OR_PHOTO) }
            return
        }
        if (s.codDue > 0 && s.codCollectedBaisa == null) {
            _ui.update { it.copy(localError = CompleteUi.LocalError.BAD_COD_AMOUNT) }
            return
        }
        viewModelScope.launch {
            _ui.update { it.copy(submitting = true, error = null, fieldErrors = emptyMap(), localError = null) }
            try {
                repo.complete(
                    id,
                    CompleteDeliveryInput(
                        pin = s.pin.ifBlank { null },
                        photoFileId = s.photoFileId,
                        recipientName = s.recipientName.trim().ifEmpty { null },
                        codCollectedBaisa = s.codCollectedBaisa,
                        note = s.note.trim().ifEmpty { null },
                        location = reporter.last.value ?: location.current(),
                    ),
                )
                _ui.update { it.copy(submitting = false) }
                _done.emit(Unit)
            } catch (e: CancellationException) {
                throw e
            } catch (e: ApiException.Validation) {
                val fields = e.fieldErrors.toMutableMap()
                // Error codes like `invalid_pin` without per-field details still belong next to the PIN.
                if (fields.isEmpty() && e.code.contains("pin", ignoreCase = true)) fields["pin"] = e.message ?: e.code
                _ui.update { it.copy(submitting = false, fieldErrors = fields, error = if (fields.isEmpty()) e else null) }
            } catch (e: Exception) {
                _ui.update { it.copy(submitting = false, error = e) }
            }
        }
    }
}
