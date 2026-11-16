package om.qabnah.captain.ui.earnings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import om.qabnah.android.state.Loadable
import om.qabnah.android.state.launchLoad
import om.qabnah.android.ui.components.EmptyState
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.SectionTitle
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.dateTime
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R
import om.qabnah.captain.data.CaptainRepository
import om.qabnah.core.model.Earnings
import om.qabnah.core.model.Settlement
import om.qabnah.core.util.DateRanges

class EarningsViewModel(private val repo: CaptainRepository) : ViewModel() {
    private val _preset = MutableStateFlow(DateRanges.Preset.TODAY)
    val preset: StateFlow<DateRanges.Preset> = _preset.asStateFlow()
    private val _state = MutableStateFlow(Loadable<Earnings>())
    val state: StateFlow<Loadable<Earnings>> = _state.asStateFlow()

    fun select(p: DateRanges.Preset) {
        _preset.value = p
        load()
    }

    fun load(refresh: Boolean = false) {
        val range = DateRanges.of(_preset.value)
        _state.launchLoad(viewModelScope, refresh) { repo.earnings(range) }
    }
}

class PayoutsViewModel(private val repo: CaptainRepository) : ViewModel() {
    private val _state = MutableStateFlow(Loadable<List<Settlement>>())
    val state: StateFlow<Loadable<List<Settlement>>> = _state.asStateFlow()
    init { load() }
    fun load(refresh: Boolean = false) = _state.launchLoad(viewModelScope, refresh) { repo.payouts() }
}

@Composable
fun EarningsScreen(container: CaptainContainer, onPayouts: () -> Unit) {
    val vm: EarningsViewModel = viewModel { EarningsViewModel(container.captain) }
    val preset by vm.preset.collectAsStateWithLifecycle()
    val state by vm.state.collectAsStateWithLifecycle()
    LifecycleResumeEffect(Unit) {
        vm.load(refresh = state.data != null)
        onPauseOrDispose { }
    }
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Text(stringResource(R.string.earnings_title), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(16.dp))
        val presets = DateRanges.Preset.entries
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            presets.forEachIndexed { i, p ->
                SegmentedButton(selected = preset == p, onClick = { vm.select(p) }, shape = SegmentedButtonDefaults.itemShape(i, presets.size)) {
                    Text(
                        stringResource(
                            when (p) {
                                DateRanges.Preset.TODAY -> R.string.earnings_today
                                DateRanges.Preset.WEEK -> R.string.earnings_week
                                DateRanges.Preset.MONTH -> R.string.earnings_month
                            },
                        ),
                    )
                }
            }
        }
        LoadableContent(state = state, onRefresh = { vm.load(refresh = true) }) { e ->
            LazyColumn(Modifier.fillMaxSize()) {
                item {
                    Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        StatCard(stringResource(R.string.earnings_earned), money(e.earningsBaisa), Modifier.weight(1f))
                        StatCard(stringResource(R.string.earnings_deliveries), digits(e.deliveriesCount.toString()), Modifier.weight(1f))
                    }
                    if (e.codCollectedBaisa > 0) {
                        StatCard(stringResource(R.string.earnings_cod_collected), money(e.codCollectedBaisa), Modifier.fillMaxWidth().padding(horizontal = 16.dp))
                    }
                    BalanceCard(e.balanceBaisa)
                    OutlinedButton(onClick = onPayouts, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                        Text(stringResource(R.string.earnings_payouts))
                    }
                    SectionTitle(stringResource(R.string.earnings_ledger))
                    if (e.entries.isEmpty()) Text(stringResource(R.string.earnings_no_entries), modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                items(e.entries, key = { it.id }) { entry ->
                    ListItem(
                        headlineContent = { Text(entry.description.ifBlank { entry.entryType.replace('_', ' ') }) },
                        supportingContent = { Text(listOfNotNull(entry.orderNumber?.let { digits("#$it") }, dateTime(entry.createdAt)).joinToString(" · ")) },
                        trailingContent = {
                            Text(
                                (if (entry.amountBaisa > 0) "+" else "") + money(entry.amountBaisa),
                                color = if (entry.amountBaisa >= 0) QabnahColors.Success else QabnahColors.Danger,
                                style = MaterialTheme.typography.labelLarge,
                            )
                        },
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier) {
        Column(Modifier.padding(16.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleLarge)
        }
    }
}

/** `balanceBaisa`: positive = Qabnah owes the captain; negative = the captain holds cash owed to Qabnah. */
@Composable
private fun BalanceCard(balance: Long) {
    val (title, body, color) = when {
        balance > 0 -> Triple(stringResource(R.string.balance_owed_to_you), stringResource(R.string.balance_owed_to_you_body), QabnahColors.Success)
        balance < 0 -> Triple(stringResource(R.string.balance_you_owe), stringResource(R.string.balance_you_owe_body), QabnahColors.Danger)
        else -> Triple(stringResource(R.string.balance_settled), stringResource(R.string.balance_settled_body), QabnahColors.Primary)
    }
    Card(
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.1f)),
        modifier = Modifier.fillMaxWidth().padding(16.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = color)
            Text(money(kotlin.math.abs(balance)), style = MaterialTheme.typography.headlineMedium, color = color)
            Text(body, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
fun PayoutsScreen(container: CaptainContainer, onBack: () -> Unit) {
    val vm: PayoutsViewModel = viewModel { PayoutsViewModel(container.captain) }
    val state by vm.state.collectAsStateWithLifecycle()
    ScreenScaffold(title = stringResource(R.string.earnings_payouts), onBack = onBack) { padding ->
        LoadableContent(
            state = state,
            onRefresh = { vm.load(refresh = true) },
            modifier = Modifier.padding(padding),
            isEmpty = { it.isEmpty() },
            empty = { EmptyState(stringResource(R.string.payouts_empty), icon = Icons.Filled.AccountBalanceWallet) },
        ) { list ->
            LazyColumn(Modifier.fillMaxSize()) {
                items(list, key = { it.id }) { s ->
                    ListItem(
                        headlineContent = { Text(digits("${s.periodStart} → ${s.periodEnd}")) },
                        supportingContent = {
                            Column {
                                Text(stringResource(R.string.payouts_entries, digits(s.entryCount.toString())))
                                s.payoutReference?.let { Text(stringResource(R.string.payouts_reference, it)) }
                                s.paidAt?.let { Text(stringResource(R.string.payouts_paid_at, dateTime(it))) }
                            }
                        },
                        leadingContent = { androidx.compose.material3.Icon(Icons.Filled.AccountBalance, contentDescription = null) },
                        trailingContent = {
                            Column {
                                Text(money(s.netBaisa), style = MaterialTheme.typography.titleSmall)
                                StatusPill(payoutStatus(s.status), if (s.status == "paid") QabnahColors.Success else QabnahColors.Info)
                            }
                        },
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun payoutStatus(status: String): String = when (status) {
    "draft" -> stringResource(R.string.payout_draft)
    "approved" -> stringResource(R.string.payout_approved)
    "paid" -> stringResource(R.string.payout_paid)
    "cancelled" -> stringResource(R.string.payout_cancelled)
    else -> status
}
