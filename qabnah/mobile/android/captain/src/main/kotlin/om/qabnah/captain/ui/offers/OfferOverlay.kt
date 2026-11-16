package om.qabnah.captain.ui.offers

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.distance
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.components.vehicleLabel
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R
import om.qabnah.captain.data.OfferRepository
import om.qabnah.core.api.ApiException
import om.qabnah.core.model.Offer
import om.qabnah.core.model.OrderType

sealed interface OfferEvent {
    data class Accepted(val deliveryId: String) : OfferEvent
    /** 409: expired or another captain was faster. */
    data object Gone : OfferEvent
    data class Failed(val error: Throwable) : OfferEvent
}

class OfferViewModel(private val repo: OfferRepository) : ViewModel() {
    val offers: StateFlow<List<Offer>> = repo.offers
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()
    private val _events = MutableSharedFlow<OfferEvent>(extraBufferCapacity = 4)
    val events: SharedFlow<OfferEvent> = _events.asSharedFlow()

    fun accept(offer: Offer) = launchAction {
        try {
            val d = repo.accept(offer.id)
            _events.emit(OfferEvent.Accepted(d.id))
        } catch (e: ApiException.Conflict) {
            _events.emit(OfferEvent.Gone)
        } catch (e: ApiException.NotFound) {
            _events.emit(OfferEvent.Gone)
        }
    }

    fun reject(offer: Offer, reason: String) = launchAction { repo.reject(offer.id, reason) }

    private fun launchAction(block: suspend () -> Unit) {
        if (_busy.value) return
        viewModelScope.launch {
            _busy.value = true
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _events.emit(OfferEvent.Failed(e))
            } finally {
                _busy.value = false
            }
        }
    }
}

/** Full-screen offer with countdown; shown above everything while offers are pending. */
@Composable
fun OfferOverlay(container: CaptainContainer, snackbar: SnackbarHostState, onAccepted: (String) -> Unit) {
    val vm: OfferViewModel = viewModel { OfferViewModel(container.offers) }
    val offers by vm.offers.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val goneText = stringResource(R.string.offer_gone)
    var failure by remember { mutableStateOf<Throwable?>(null) }
    LaunchedEffect(Unit) {
        vm.events.collect { e ->
            when (e) {
                is OfferEvent.Accepted -> onAccepted(e.deliveryId)
                OfferEvent.Gone -> snackbar.showSnackbar(goneText)
                is OfferEvent.Failed -> failure = e.error
            }
        }
    }
    failure?.let { err ->
        AlertDialog(
            onDismissRequest = { failure = null },
            text = { Text(errorMessage(err)) },
            confirmButton = { TextButton(onClick = { failure = null }) { Text(stringResource(om.qabnah.android.R.string.common_ok)) } },
        )
    }
    val offer = offers.firstOrNull() ?: return
    Dialog(onDismissRequest = {}, properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false)) {
        OfferContent(offer, offers.size, busy, onAccept = { vm.accept(offer) }, onReject = { reason -> vm.reject(offer, reason) })
    }
}

@Composable
private fun OfferContent(offer: Offer, count: Int, busy: Boolean, onAccept: () -> Unit, onReject: (String) -> Unit) {
    val expiresAt = remember(offer.id) { OfferRepository.expiresAtMs(offer) }
    val totalMs = remember(offer.id) { (expiresAt - System.currentTimeMillis()).coerceAtLeast(1) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(offer.id) {
        while (true) {
            now = System.currentTimeMillis()
            delay(250)
        }
    }
    val remainingMs = (expiresAt - now).coerceAtLeast(0)
    var rejecting by remember(offer.id) { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).statusBarsPadding().navigationBarsPadding().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.offer_title), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
            if (count > 1) Text(stringResource(R.string.offer_more, digits((count - 1).toString())), style = MaterialTheme.typography.labelMedium)
        }
        LinearProgressIndicator(
            progress = { remainingMs.toFloat() / totalMs },
            modifier = Modifier.fillMaxWidth().height(8.dp),
            color = if (remainingMs < 10_000) QabnahColors.Danger else QabnahColors.Primary,
        )
        Text(
            stringResource(R.string.offer_seconds_left, digits(((remainingMs + 999) / 1000).toString())),
            style = MaterialTheme.typography.titleMedium,
            color = if (remainingMs < 10_000) QabnahColors.Danger else MaterialTheme.colorScheme.onSurface,
        )
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(stringResource(R.string.offer_you_earn), style = MaterialTheme.typography.labelLarge)
                Text(money(offer.earningBaisa), style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold, color = QabnahColors.Primary)
                if (offer.codAmountBaisa > 0) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
                        Icon(Icons.Filled.Payments, contentDescription = null, tint = QabnahColors.Danger)
                        Text(
                            stringResource(R.string.offer_cod, money(offer.codAmountBaisa)),
                            color = QabnahColors.Danger,
                            style = MaterialTheme.typography.titleSmall,
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                }
            }
        }
        offer.merchantName?.let {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Storefront, contentDescription = null)
                Text(it, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 8.dp))
            }
        }
        if (offer.orderType == OrderType.C2C) Text(stringResource(R.string.offer_parcel, offer.packageSize ?: "—"))
        AreaRow(stringResource(R.string.offer_pickup), offer.pickupArea, stringResource(R.string.offer_away, distance(offer.distanceToPickupM)))
        AreaRow(stringResource(R.string.offer_dropoff), offer.dropoffArea, stringResource(R.string.offer_trip, distance(offer.tripDistanceM)))
        offer.vehicleType?.let { v -> vehicleLabel(v).takeIf { it.isNotBlank() }?.let { Text(stringResource(R.string.offer_vehicle, it), style = MaterialTheme.typography.bodySmall) } }

        Spacer(Modifier.weight(1f))
        Button(onClick = onAccept, enabled = !busy && remainingMs > 0, modifier = Modifier.fillMaxWidth().height(60.dp)) {
            if (busy) CircularProgressIndicator(Modifier.size(24.dp), color = Color.White) else Text(stringResource(R.string.offer_accept), style = MaterialTheme.typography.titleMedium)
        }
        OutlinedButton(onClick = { rejecting = true }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            Text(stringResource(R.string.offer_reject))
        }
    }

    if (rejecting) RejectDialog(onDismiss = { rejecting = false }, onConfirm = { reason -> rejecting = false; onReject(reason) })
}

@Composable
private fun AreaRow(label: String, area: String?, detail: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(area ?: "—", style = MaterialTheme.typography.titleMedium)
        Text(detail, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun RejectDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    val reasons = listOf(
        "too_far" to R.string.reject_too_far,
        "busy" to R.string.reject_busy,
        "vehicle_unsuitable" to R.string.reject_vehicle,
        "low_earning" to R.string.reject_low_earning,
        "other" to R.string.reject_other,
    )
    var selected by remember { mutableStateOf(reasons.first().first) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.reject_title)) },
        text = {
            Column {
                reasons.forEach { (key, label) ->
                    Row(
                        Modifier.fillMaxWidth().clickable(role = Role.RadioButton) { selected = key }.padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = selected == key, onClick = null)
                        Text(stringResource(label), modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(selected) }) { Text(stringResource(R.string.offer_reject)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(om.qabnah.android.R.string.common_cancel)) } },
    )
}

