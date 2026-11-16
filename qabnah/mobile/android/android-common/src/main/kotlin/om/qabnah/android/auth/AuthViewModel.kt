package om.qabnah.android.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import om.qabnah.core.api.QabnahApi
import om.qabnah.core.money.Digits
import om.qabnah.core.util.Phones

data class AuthUiState(
    val step: Step = Step.PHONE,
    val phoneInput: String = "",
    val phoneE164: String = "",
    val phoneInvalid: Boolean = false,
    val code: String = "",
    val fullName: String = "",
    val loading: Boolean = false,
    val error: Throwable? = null,
    val devCode: String? = null,
    val resendInSeconds: Int = 0,
) {
    enum class Step { PHONE, CODE }

    val canVerify: Boolean get() = code.length == 6 && !loading
}

/** OTP sign-in: `POST /auth/otp/request` → `POST /auth/otp/verify` (stores the session on success). */
class AuthViewModel(private val api: QabnahApi) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()
    private var countdown: Job? = null

    fun onPhoneChange(value: String) = _state.update { it.copy(phoneInput = value.take(16), phoneInvalid = false, error = null) }
    fun onCodeChange(value: String) =
        _state.update { it.copy(code = Digits.toAscii(value).filter(Char::isDigit).take(6), error = null) }
    fun onNameChange(value: String) = _state.update { it.copy(fullName = value.take(80)) }

    fun requestCode() {
        val phone = Phones.normalizeOmanMobile(_state.value.phoneInput)
        if (phone == null) {
            _state.update { it.copy(phoneInvalid = true) }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, phoneE164 = phone) }
            try {
                val result = api.requestOtp(phone)
                _state.update { it.copy(loading = false, step = AuthUiState.Step.CODE, devCode = result.devCode, code = "") }
                startCountdown(30)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e) }
            }
        }
    }

    fun verify() {
        val s = _state.value
        if (!s.canVerify) return
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            try {
                // On success the ApiClient stores tokens and `signedIn` flips, which switches the app's root screen.
                api.verifyOtp(s.phoneE164, s.code, s.fullName.trim().takeIf { it.isNotEmpty() })
                _state.update { it.copy(loading = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e) }
            }
        }
    }

    fun changeNumber() {
        countdown?.cancel()
        _state.update { it.copy(step = AuthUiState.Step.PHONE, code = "", devCode = null, error = null, resendInSeconds = 0) }
    }

    private fun startCountdown(seconds: Int) {
        countdown?.cancel()
        countdown = viewModelScope.launch {
            for (s in seconds downTo 0) {
                _state.update { it.copy(resendInSeconds = s) }
                if (s > 0) delay(1_000)
            }
        }
    }
}
