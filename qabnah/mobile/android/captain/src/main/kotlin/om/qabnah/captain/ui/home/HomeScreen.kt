package om.qabnah.captain.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.PowerSettingsNew
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.ui.components.InlineError
import om.qabnah.android.ui.components.QButton
import om.qabnah.android.ui.components.QCard
import om.qabnah.android.ui.components.QDockedSheet
import om.qabnah.android.ui.components.QPrice
import om.qabnah.android.ui.components.QSecondaryButton
import om.qabnah.android.ui.components.SkeletonBox
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.deliveryStatusLabel
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.components.tabular
import om.qabnah.android.ui.map.MapMarker
import om.qabnah.android.ui.map.OsmMap
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R
import om.qabnah.captain.ui.components.HaloDot
import om.qabnah.captain.ui.components.RouteRows
import om.qabnah.captain.ui.components.StatTile
import om.qabnah.captain.ui.onboarding.captainStatusColor
import om.qabnah.captain.ui.onboarding.captainStatusLabel
import om.qabnah.core.model.CaptainDelivery
import om.qabnah.core.model.CaptainProfile
import om.qabnah.core.model.CaptainStatus
import om.qabnah.core.model.Earnings
import om.qabnah.core.model.LatLng
import om.qabnah.core.util.Geo

/**
 * Map-first home on the night theme: the dark map fills the screen, a docked sheet carries the giant online/offline
 * control (the screen's one saffron action), today's earnings strip, the onboarding checklist and current deliveries.
 */
@Composable
fun HomeScreen(
    container: CaptainContainer,
    onOpenDelivery: (String) -> Unit,
    onDocuments: () -> Unit,
    onZones: () -> Unit,
    onAvailability: () -> Unit,
    onPermissions: () -> Unit,
) {
    val vm: HomeViewModel = viewModel {
        HomeViewModel(container.captain, container.online, container.offers, container.services.location, container.locationReporter)
    }
    val profile by vm.profile.collectAsStateWithLifecycle()
    val active by vm.active.collectAsStateWithLifecycle()
    val onlineUi by vm.onlineUi.collectAsStateWithLifecycle()
    val today by vm.today.collectAsStateWithLifecycle()
    val position by vm.position.collectAsStateWithLifecycle()
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose { }
    }

    BoxWithConstraints(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        val sheetMax = maxHeight * 0.64f
        val here = position
        // Centre on the first fix only; later fixes move the marker but leave the camera where the captain panned it.
        var firstFix by remember { mutableStateOf<LatLng?>(null) }
        if (firstFix == null && here != null) firstFix = here
        OsmMap(
            modifier = Modifier.fillMaxSize(),
            markers = if (here != null) {
                listOf(MapMarker("captain", here, om.qabnah.android.R.drawable.ic_pin_captain, stringResource(om.qabnah.android.R.string.map_captain), anchorCenter = true))
            } else emptyList(),
            initialCenter = here ?: Geo.MUSCAT,
            initialZoom = 14.5,
            centerRequest = firstFix,
            contentDescription = stringResource(R.string.home_map_description),
        )

        // Greeting on a night scrim so it reads over the map.
        val p = profile
        Column(
            Modifier
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(QabnahColors.Night.copy(alpha = 0.92f), Color.Transparent)))
                .statusBarsPadding()
                .padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 40.dp),
        ) {
            Text(
                stringResource(R.string.home_greeting, p?.fullName?.substringBefore(' ').orEmpty()),
                style = MaterialTheme.typography.headlineSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (p != null && p.status != CaptainStatus.ACTIVE) {
                Spacer(Modifier.height(6.dp))
                StatusPill(captainStatusLabel(p.status), captainStatusColor(p.status))
            }
        }

        QDockedSheet(Modifier.align(Alignment.BottomCenter), navigationBarInset = false) {
            Column(
                Modifier.heightIn(max = sheetMax).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (p == null) {
                    SkeletonBox(Modifier.fillMaxWidth().height(64.dp), MaterialTheme.shapes.medium)
                    SkeletonBox(Modifier.fillMaxWidth().height(72.dp), MaterialTheme.shapes.medium)
                    return@Column
                }
                if (p.status == CaptainStatus.ACTIVE) {
                    OnlineControl(
                        online = p.isOnline,
                        busy = onlineUi.busy,
                        onToggle = { target ->
                            vm.clearError()
                            if (target && !vm.canTrack()) onPermissions() else vm.setOnline(target)
                        },
                    )
                    onlineUi.error?.let { InlineError(it, onRetry = null) }
                    EarningsStrip(today)
                } else {
                    StatusBanner(p)
                }
                if (p.status != CaptainStatus.ACTIVE || p.zoneIds.isEmpty() || p.availability.isEmpty()) {
                    Checklist(p, onDocuments, onZones, onAvailability)
                }

                Text(stringResource(R.string.home_active_deliveries), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
                val list = active.data.orEmpty()
                when {
                    active.isInitialLoading -> SkeletonBox(Modifier.fillMaxWidth().height(96.dp), MaterialTheme.shapes.medium)
                    active.error != null && active.data == null -> InlineError(active.error!!, onRetry = vm::refresh)
                    list.isEmpty() -> Text(
                        stringResource(if (p.isOnline) R.string.home_waiting_offers else R.string.home_no_active),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    else -> list.forEach { d -> DeliveryCard(d, onClick = { onOpenDelivery(d.id) }) }
                }
            }
        }
    }
}

/**
 * The giant online/offline control. Offline: a 64 dp saffron "Go online" button. Online: a live status row and a
 * secondary "Go offline" button, so saffron stays reserved for the action that starts work.
 */
@Composable
private fun OnlineControl(online: Boolean, busy: Boolean, onToggle: (Boolean) -> Unit) {
    if (online) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            HaloDot(QabnahColors.PrimaryOnNight)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.home_online), style = MaterialTheme.typography.titleLarge)
                Text(stringResource(R.string.home_online_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        QSecondaryButton(
            stringResource(R.string.home_go_offline),
            onClick = { onToggle(false) },
            enabled = !busy,
            icon = Icons.Outlined.PowerSettingsNew,
            modifier = Modifier.fillMaxWidth().height(56.dp),
        )
    } else {
        Column {
            Text(stringResource(R.string.home_offline), style = MaterialTheme.typography.titleLarge)
            Text(stringResource(R.string.home_offline_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        QButton(
            onClick = { onToggle(true) },
            loading = busy,
            saffron = true,
            modifier = Modifier.fillMaxWidth().height(64.dp),
        ) {
            Icon(Icons.Outlined.PowerSettingsNew, contentDescription = null, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(10.dp))
            Text(stringResource(R.string.home_go_online), style = MaterialTheme.typography.titleLarge)
        }
    }
}

/** Today's earnings and delivery count (from `GET /captain/earnings` for today, Muscat time). */
@Composable
private fun EarningsStrip(today: Earnings?) {
    QCard(Modifier.fillMaxWidth(), containerColor = QabnahColors.Night) {
        Text(stringResource(R.string.earnings_today), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.Bottom) {
            StatTile(stringResource(R.string.earnings_earned), Modifier.weight(1f)) {
                if (today == null) SkeletonBox(Modifier.width(96.dp).height(28.dp))
                else QPrice(today.earningsBaisa, style = MaterialTheme.typography.headlineSmall)
            }
            StatTile(stringResource(R.string.earnings_deliveries), Modifier.weight(1f)) {
                if (today == null) SkeletonBox(Modifier.width(48.dp).height(28.dp))
                else Text(digits(today.deliveriesCount.toString()), style = MaterialTheme.typography.headlineSmall.tabular())
            }
        }
    }
}

@Composable
private fun StatusBanner(p: CaptainProfile) {
    val text = when (p.status) {
        CaptainStatus.PENDING_DOCUMENTS -> stringResource(R.string.banner_pending_documents)
        CaptainStatus.PENDING_REVIEW -> stringResource(R.string.banner_pending_review)
        CaptainStatus.REJECTED -> stringResource(R.string.banner_rejected, p.rejectionReason ?: "—")
        CaptainStatus.SUSPENDED -> stringResource(R.string.banner_suspended)
        else -> return
    }
    Text(text, style = MaterialTheme.typography.bodyMedium)
}

/** Onboarding checklist: documents, zones, availability — each row opens the screen that completes it. */
@Composable
private fun Checklist(p: CaptainProfile, onDocuments: () -> Unit, onZones: () -> Unit, onAvailability: () -> Unit) {
    QCard(Modifier.fillMaxWidth(), padding = PaddingValues(vertical = 4.dp), containerColor = QabnahColors.Night) {
        Text(stringResource(R.string.checklist_title), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 4.dp))
        val docsDone = p.missingDocuments.isEmpty() && p.requiredDocuments.isNotEmpty()
        val rejected = p.documents.count { d -> d.status == "rejected" && p.latestDocument(d.docType)?.id == d.id }
        ChecklistRow(
            Icons.Outlined.Description,
            stringResource(R.string.checklist_documents),
            when {
                rejected > 0 -> stringResource(R.string.checklist_documents_rejected, digits(rejected.toString()))
                docsDone -> stringResource(R.string.checklist_documents_done)
                else -> stringResource(R.string.checklist_documents_missing, digits(p.missingDocuments.size.toString()))
            },
            done = docsDone && rejected == 0,
            onClick = onDocuments,
        )
        HorizontalDivider(Modifier.padding(horizontal = 16.dp))
        ChecklistRow(
            Icons.Outlined.Map,
            stringResource(R.string.checklist_zones),
            stringResource(R.string.checklist_zones_count, digits(p.zoneIds.size.toString())),
            done = p.zoneIds.isNotEmpty(),
            onClick = onZones,
        )
        HorizontalDivider(Modifier.padding(horizontal = 16.dp))
        ChecklistRow(
            Icons.Outlined.Schedule,
            stringResource(R.string.checklist_availability),
            stringResource(R.string.checklist_availability_count, digits(p.availability.size.toString())),
            done = p.availability.isNotEmpty(),
            onClick = onAvailability,
        )
    }
}

@Composable
private fun ChecklistRow(icon: ImageVector, title: String, subtitle: String, done: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(
            if (done) Icons.Filled.CheckCircle else Icons.Outlined.RadioButtonUnchecked,
            contentDescription = stringResource(if (done) R.string.checklist_done else R.string.checklist_todo),
            tint = if (done) QabnahColors.PrimaryOnNight else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(20.dp))
    }
}

/** A delivery in a list: order number and status, pickup → drop-off, earning and cash to collect. */
@Composable
fun DeliveryCard(d: CaptainDelivery, onClick: () -> Unit, modifier: Modifier = Modifier) {
    QCard(modifier.fillMaxWidth(), onClick = onClick, containerColor = QabnahColors.Night) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(digits("#" + d.orderNumber), style = MaterialTheme.typography.titleMedium.tabular())
                d.merchantName?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            }
            StatusPill(deliveryStatusLabel(d.status), QabnahColors.Primary)
        }
        val pickup = d.pickup.address
        val dropoff = d.dropoff.address
        if (pickup != null || dropoff != null) {
            RouteRows(
                pickupLabel = stringResource(R.string.delivery_pickup),
                pickup = pickup ?: "—",
                dropoffLabel = stringResource(R.string.delivery_dropoff),
                dropoff = dropoff ?: "—",
                modifier = Modifier.padding(top = 12.dp),
            )
        }
        HorizontalDivider(Modifier.padding(vertical = 12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            StatTile(stringResource(R.string.offer_you_earn), Modifier.weight(1f)) {
                QPrice(d.earningBaisa, style = MaterialTheme.typography.titleMedium)
            }
            if (d.codAmountBaisa > 0) {
                Icon(Icons.Outlined.Payments, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.delivery_collect_cash, money(d.codAmountBaisa)), style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}
