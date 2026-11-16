package om.qabnah.android.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import om.qabnah.android.R
import om.qabnah.android.location.LocationUnavailableException
import om.qabnah.core.api.ApiException

/** Localized, user-facing text for any failure. Server messages are used for 4xx business errors. */
@Composable
fun errorMessage(error: Throwable): String = when (error) {
    is ApiException.Network -> stringResource(R.string.error_network)
    is ApiException.Server, is ApiException.Decoding -> stringResource(R.string.error_server)
    is ApiException.Unauthorized -> stringResource(R.string.error_session)
    is ApiException.RateLimited -> stringResource(R.string.error_rate_limited)
    is ApiException.Forbidden -> error.message?.takeIf { it.isNotBlank() } ?: stringResource(R.string.error_forbidden)
    is ApiException.NotFound -> stringResource(R.string.error_not_found)
    is ApiException.Validation -> when (error.code) {
        "out_of_service_area" -> stringResource(R.string.error_out_of_service_area)
        "merchant_closed" -> stringResource(R.string.error_merchant_closed)
        else -> error.message ?: stringResource(R.string.error_generic)
    }
    is ApiException -> error.message ?: stringResource(R.string.error_generic)
    is LocationUnavailableException -> stringResource(R.string.error_location_unavailable)
    else -> stringResource(R.string.error_generic)
}
