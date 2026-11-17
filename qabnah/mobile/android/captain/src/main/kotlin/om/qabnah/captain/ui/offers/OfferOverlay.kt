package om.qabnah.captain.ui.offers

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Surface
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import om.qabnah.android.ui.components.QButton
import om.qabnah.android.ui.components.QPrice
import om.qabnah.android.ui.components.QSecondaryButton
import om.qabnah.android.ui.components.QSheetHandle
import om.qabnah.android.ui.components.QTextButton
import om.qabnah.android.ui.components.tabular
import om.qabnah.captain.ui.components.CountdownRing
import om.qabnah.captain.ui.components.RouteRows
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
            confirmButton = { QTextButton(stringResource(om.qabnah.android.R.string.common_ok), onClick = { failure = null }) },
        )
    }
    val offer = offers.firstOrNull() ?: return
    Dialog(onDismissRequest = {}, properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false)) {
        OfferContent(offer, offers.size, busy, onAccept = { vm.accept(offer) }, onReject = { reason -> vm.reject(offer, reason) })
    }
}

/**
 * The offer as a full-height sheet on night: saffron countdown ring, the big earning figure, pickup → drop-off rows and
 * one saffron action (Accept) with a secondary Decline.
 */
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
    val secondsLeft = digits(((remainingMs + 999) / 1000).toString())
    var rejecting by remember(offer.id) { mutableStateOf(false) }

    Box(Modifier.fillMaxSize().background(QabnahColors.Night.copy(alpha = 0.7f)).statusBarsPadding().padding(top = 12.dp)) {
        Surface(
            color = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface,
            shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(Modifier.fillMaxSize().navigationBarsPadding(), horizontalAlignment = Alignment.CenterHorizontally) {
                QSheetHandle()
                Column(
                    Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(R.string.offer_title), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
                        if (count > 1) {
                            Text(stringResource(R.string.offer_more, digits((count - 1).toString())), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val countdown = stringResource(R.string.offer_seconds_left, secondsLeft)
                        CountdownRing(
                            progress = remainingMs.toFloat() / totalMs,
                            modifier = Modifier.semantics { contentDescription = countdown },
                        ) {
                            Text(secondsLeft, style = MaterialTheme.typography.displaySmall.tabular(), modifier = Modifier.clearAndSetSemantics { })
                        }
                        Spacer(Modifier.width(20.dp))
                        Column(Modifier.weight(1f)) {
                            Text(stringResource(R.string.offer_you_earn), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            QPrice(offer.earningBaisa, style = MaterialTheme.typography.displaySmall)
                            if (offer.codAmountBaisa > 0) {
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                                    Icon(Icons.Outlined.Payments, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                                    Text(
                                        stringResource(R.string.offer_cod, money(offer.codAmountBaisa)),
                                        style = MaterialTheme.typography.titleSmall,
                                        modifier = Modifier.padding(start = 6.dp),
                                    )
                                }
                            }
                        }
                    }
                    HorizontalDivider()
                    offer.merchantName?.let {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Storefront, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(it, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 10.dp))
                        }
                    }
                    RouteRows(
                        pickupLabel = stringResource(R.string.offer_pickup),
                        pickup = offer.pickupArea ?: "—",
                        pickupDetail = stringResource(R.string.offer_away, distance(offer.distanceToPickupM)),
                        dropoffLabel = stringResource(R.string.offer_dropoff),
                        dropoff = offer.dropoffArea ?: "—",
                        dropoffDetail = stringResource(R.string.offer_trip, distance(offer.tripDistanceM)),
                    )
                    val details = buildList {
                        if (offer.orderType == OrderType.C2C) add(stringResource(R.string.offer_parcel, packageSizeLabel(offer.packageSize)))
                        offer.vehicleType?.let { v -> vehicleLabel(v).takeIf { it.isNotBlank() }?.let { add(stringResource(R.string.offer_vehicle, it)) } }
                    }
                    if (details.isNotEmpty()) {
                        Text(details.joinToString("  ·  "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    QButton(
                        onClick = onAccept,
                        enabled = remainingMs > 0,
                        loading = busy,
                        saffron = true,
                        modifier = Modifier.fillMaxWidth().height(64.dp),
                    ) { Text(stringResource(R.string.offer_accept), style = MaterialTheme.typography.titleLarge) }
                    QSecondaryButton(stringResource(R.string.offer_reject), onClick = { rejecting = true }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(52.dp))
                }
            }
        }
    }

    if (rejecting) RejectDialog(onDismiss = { rejecting = false }, onConfirm = { reason -> rejecting = false; onReject(reason) })
}

/** Localized parcel size for an offer's `packageSize` wire value. */
@Composable
private fun packageSizeLabel(wire: String?): String = when (wire) {
    "small" -> stringResource(R.string.package_small)
    "medium" -> stringResource(R.string.package_medium)
    "large" -> stringResource(R.string.package_large)
    else -> "—"
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
        confirmButton = { QTextButton(stringResource(R.string.offer_reject), onClick = { onConfirm(selected) }) },
        dismissButton = { QTextButton(stringResource(om.qabnah.android.R.string.common_cancel), onClick = onDismiss) },
    )
}

