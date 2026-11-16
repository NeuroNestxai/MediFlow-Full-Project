package om.qabnah.captain.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.ui.components.InlineError
import om.qabnah.android.ui.components.SectionTitle
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.deliveryStatusLabel
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R
import om.qabnah.captain.ui.onboarding.captainStatusColor
import om.qabnah.captain.ui.onboarding.captainStatusLabel
import om.qabnah.core.model.CaptainDelivery
import om.qabnah.core.model.CaptainProfile
import om.qabnah.core.model.CaptainStatus

@Composable
fun HomeScreen(
    container: CaptainContainer,
    onOpenDelivery: (String) -> Unit,
    onDocuments: () -> Unit,
    onZones: () -> Unit,
    onAvailability: () -> Unit,
    onPermissions: () -> Unit,
) {
    val vm: HomeViewModel = viewModel { HomeViewModel(container.captain, container.online, container.offers) }
    val profile by vm.profile.collectAsStateWithLifecycle()
    val active by vm.active.collectAsStateWithLifecycle()
    val onlineUi by vm.onlineUi.collectAsStateWithLifecycle()
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose { }
    }

    PullToRefreshBox(isRefreshing = active.refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize().statusBarsPadding()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            val p = profile
            Text(
                stringResource(R.string.home_greeting, p?.fullName?.substringBefore(' ').orEmpty()),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(16.dp),
            )
            if (p == null) {
                CircularProgressIndicator(Modifier.padding(16.dp))
                return@Column
            }
            StatusBanner(p)
            if (p.status == CaptainStatus.ACTIVE) {
                OnlineCard(
                    online = p.isOnline,
                    busy = onlineUi.busy,
                    onToggle = { target ->
                        vm.clearError()
                        if (target && !vm.canTrack()) onPermissions() else vm.setOnline(target)
                    },
                )
                onlineUi.error?.let { InlineError(it, onRetry = null, modifier = Modifier.padding(horizontal = 16.dp)) }
            }
            if (p.status != CaptainStatus.ACTIVE || p.zoneIds.isEmpty() || p.availability.isEmpty()) {
                Checklist(p, onDocuments, onZones, onAvailability)
            }
            SectionTitle(stringResource(R.string.home_active_deliveries))
            val list = active.data.orEmpty()
            when {
                active.isInitialLoading -> CircularProgressIndicator(Modifier.padding(16.dp))
                active.error != null && active.data == null -> InlineError(active.error!!, onRetry = vm::refresh)
                list.isEmpty() -> Text(
                    stringResource(if (p.isOnline) R.string.home_waiting_offers else R.string.home_no_active),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
                else -> list.forEach { d -> DeliveryCard(d, onClick = { onOpenDelivery(d.id) }) }
            }
        }
    }
}

@Composable
private fun StatusBanner(p: CaptainProfile) {
    val (text, color) = when (p.status) {
        CaptainStatus.PENDING_DOCUMENTS -> stringResource(R.string.banner_pending_documents) to QabnahColors.Accent
        CaptainStatus.PENDING_REVIEW -> stringResource(R.string.banner_pending_review) to QabnahColors.Info
        CaptainStatus.REJECTED -> stringResource(R.string.banner_rejected, p.rejectionReason ?: "—") to QabnahColors.Danger
        CaptainStatus.SUSPENDED -> stringResource(R.string.banner_suspended) to QabnahColors.Danger
        else -> return
    }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp).background(color.copy(alpha = 0.12f), MaterialTheme.shapes.medium).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StatusPill(captainStatusLabel(p.status), captainStatusColor(p.status))
        Spacer(Modifier.size(12.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun OnlineCard(online: Boolean, busy: Boolean, onToggle: (Boolean) -> Unit) {
    val label = stringResource(if (online) R.string.home_online else R.string.home_offline)
    Card(
        colors = CardDefaults.cardColors(containerColor = if (online) QabnahColors.Primary else MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth().padding(16.dp),
    ) {
        Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(label, style = MaterialTheme.typography.titleLarge, color = if (online) Color.White else MaterialTheme.colorScheme.onSurface)
                Text(
                    stringResource(if (online) R.string.home_online_hint else R.string.home_offline_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (online) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (busy) {
                CircularProgressIndicator(Modifier.size(28.dp), color = if (online) Color.White else MaterialTheme.colorScheme.primary)
            } else {
                Switch(
                    checked = online,
                    onCheckedChange = onToggle,
                    modifier = Modifier.semantics { contentDescription = label },
                )
            }
        }
    }
}

@Composable
private fun Checklist(p: CaptainProfile, onDocuments: () -> Unit, onZones: () -> Unit, onAvailability: () -> Unit) {
    SectionTitle(stringResource(R.string.checklist_title))
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        val docsDone = p.missingDocuments.isEmpty() && p.requiredDocuments.isNotEmpty()
        val rejected = p.documents.count { d -> d.status == "rejected" && p.latestDocument(d.docType)?.id == d.id }
        ChecklistRow(
            Icons.Filled.Description,
            stringResource(R.string.checklist_documents),
            when {
                rejected > 0 -> stringResource(R.string.checklist_documents_rejected, digits(rejected.toString()))
                docsDone -> stringResource(R.string.checklist_documents_done)
                else -> stringResource(R.string.checklist_documents_missing, digits(p.missingDocuments.size.toString()))
            },
            done = docsDone && rejected == 0,
            onClick = onDocuments,
        )
        ChecklistRow(
            Icons.Filled.Map,
            stringResource(R.string.checklist_zones),
            stringResource(R.string.checklist_zones_count, digits(p.zoneIds.size.toString())),
            done = p.zoneIds.isNotEmpty(),
            onClick = onZones,
        )
        ChecklistRow(
            Icons.Filled.Schedule,
            stringResource(R.string.checklist_availability),
            stringResource(R.string.checklist_availability_count, digits(p.availability.size.toString())),
            done = p.availability.isNotEmpty(),
            onClick = onAvailability,
        )
    }
}

@Composable
private fun ChecklistRow(icon: ImageVector, title: String, subtitle: String, done: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(
            if (done) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
            contentDescription = stringResource(if (done) R.string.checklist_done else R.string.checklist_todo),
            tint = if (done) QabnahColors.Success else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
fun DeliveryCard(d: CaptainDelivery, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp).clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(digits("#" + d.orderNumber), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                StatusPill(deliveryStatusLabel(d.status), QabnahColors.Primary)
            }
            d.merchantName?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            Text(
                listOfNotNull(d.pickup.address, d.dropoff.address).joinToString(" → "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row {
                Text(stringResource(R.string.delivery_earning, money(d.earningBaisa)), style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                if (d.codAmountBaisa > 0) Text(stringResource(R.string.delivery_collect_cash, money(d.codAmountBaisa)), style = MaterialTheme.typography.labelLarge, color = QabnahColors.Danger)
            }
        }
    }
    Spacer(Modifier.height(0.dp))
}
