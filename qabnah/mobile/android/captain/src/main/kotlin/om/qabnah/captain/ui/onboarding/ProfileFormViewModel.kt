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
import om.qabnah.captain.data.CaptainRepository
import om.qabnah.core.api.ApiException
import om.qabnah.core.model.CaptainProfile
import om.qabnah.core.model.CaptainProfileInput
import om.qabnah.core.model.CaptainStatus
import om.qabnah.core.model.VehicleType

data class ProfileForm(
    val vehicleType: VehicleType = VehicleType.BIKE,
    val vehicleMake: String = "",
    val vehicleModel: String = "",
    val vehiclePlate: String = "",
    val vehicleColor: String = "",
    val nationalIdNumber: String = "",
    val nationality: String = "",
    /** yyyy-MM-dd */
    val dateOfBirth: String = "",
    val bankName: String = "",
    val iban: String = "",
    val submitting: Boolean = false,
    val error: Throwable? = null,
    val fieldErrors: Map<String, String> = emptyMap(),
    val showValidation: Boolean = false,
) {
    val ibanNormalized: String get() = iban.replace(" ", "").uppercase()
    /** Oman IBANs are 23 characters (OMkk + 3-digit bank + 16 digits); other countries allowed for expat accounts. */
    val ibanValid: Boolean get() = ibanNormalized.isEmpty() || Regex("^[A-Z]{2}\\d{2}[A-Z0-9]{11,30}$").matches(ibanNormalized) &&
        (!ibanNormalized.startsWith("OM") || ibanNormalized.length == 23)
    val missingRequired: Boolean
        get() = vehicleMake.isBlank() || vehicleModel.isBlank() || vehiclePlate.isBlank() ||
            nationalIdNumber.isBlank() || nationality.isBlank() || dateOfBirth.isBlank()
    val isValid: Boolean get() = !missingRequired && ibanValid

    fun toInput() = CaptainProfileInput(
        vehicleType = vehicleType,
        vehicleMake = vehicleMake.trim(),
        vehicleModel = vehicleModel.trim(),
        vehiclePlate = vehiclePlate.trim().uppercase(),
        vehicleColor = vehicleColor.trim().ifEmpty { null },
        nationalIdNumber = nationalIdNumber.trim(),
        nationality = nationality.trim(),
        dateOfBirth = dateOfBirth,
        bankName = bankName.trim().ifEmpty { null },
        iban = ibanNormalized.ifEmpty { null },
    )

    companion object {
        fun from(p: CaptainProfile) = ProfileForm(
            vehicleType = p.vehicleType.takeIf { it != VehicleType.UNKNOWN } ?: VehicleType.BIKE,
            vehicleMake = p.vehicleMake.orEmpty(),
            vehicleModel = p.vehicleModel.orEmpty(),
            vehiclePlate = p.vehiclePlate.orEmpty(),
            vehicleColor = p.vehicleColor.orEmpty(),
            nationalIdNumber = p.nationalIdNumber.orEmpty(),
            nationality = p.nationality.orEmpty(),
            dateOfBirth = p.dateOfBirth.orEmpty(),
            bankName = p.bankName.orEmpty(),
            iban = p.iban.orEmpty(),
        )
    }
}

/** `POST /captain/register` (new captain) or `PATCH /captain/profile` (edit). */
class ProfileFormViewModel(private val repo: CaptainRepository, val editing: Boolean) : ViewModel() {
    private val initial = repo.profile.value?.takeIf { editing }?.let { ProfileForm.from(it) } ?: ProfileForm()
    private val _form = MutableStateFlow(initial)
    val form: StateFlow<ProfileForm> = _form.asStateFlow()
    private val _done = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val done: SharedFlow<Unit> = _done.asSharedFlow()

    /** Editing vehicle details of an active captain sends them back to review (contract note on PATCH). */
    val warnsReview: Boolean get() = editing && repo.profile.value?.status == CaptainStatus.ACTIVE

    fun edit(transform: (ProfileForm) -> ProfileForm) = _form.update { transform(it).copy(error = null, fieldErrors = emptyMap()) }

    fun submit() {
        val f = _form.value
        if (!f.isValid) {
            _form.update { it.copy(showValidation = true) }
            return
        }
        viewModelScope.launch {
            _form.update { it.copy(submitting = true, error = null) }
            try {
                if (editing) repo.update(f.toInput()) else repo.register(f.toInput())
                _form.update { it.copy(submitting = false) }
                _done.emit(Unit)
            } catch (e: CancellationException) {
                throw e
            } catch (e: ApiException.Conflict) {
                // Already registered (e.g. a retry after a timeout): just continue.
                _form.update { it.copy(submitting = false) }
                _done.emit(Unit)
            } catch (e: ApiException.Validation) {
                _form.update { it.copy(submitting = false, error = e, fieldErrors = e.fieldErrors) }
            } catch (e: Exception) {
                _form.update { it.copy(submitting = false, error = e) }
            }
        }
    }
}
