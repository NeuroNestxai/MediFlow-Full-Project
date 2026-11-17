package om.qabnah.captain.ui.earnings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import om.qabnah.android.locale.isArabic
import om.qabnah.android.state.Loadable
import om.qabnah.android.state.launchLoad
import om.qabnah.android.ui.components.EmptyState
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.android.ui.components.QCard
import om.qabnah.android.ui.components.QLargeTitle
import om.qabnah.android.ui.components.QPrice
import om.qabnah.android.ui.components.QSecondaryButton
import om.qabnah.android.ui.components.QSegmentedControl
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.dateTime
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.components.tabular
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.android.ui.theme.readableOnSurface
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R
import om.qabnah.captain.data.CaptainRepository
import om.qabnah.captain.ui.components.EarningsBarChart
import om.qabnah.captain.ui.components.StatTile
import om.qabnah.core.model.Earnings
import om.qabnah.core.model.LedgerEntry
import om.qabnah.core.model.Settlement
import om.qabnah.core.util.DateRanges
import om.qabnah.core.util.EarningsChart
import java.time.format.TextStyle
import java.util.Locale

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

/**
 * Earnings: period selector, the earned figure with a Canvas bar chart (per 4-hour block today, per day otherwise),
 * deliveries and cash figures, the settlement balance and the activity ledger.
 */
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
        QLargeTitle(stringResource(R.string.earnings_title))
        val presets = DateRanges.Preset.entries
        QSegmentedControl(
            options = presets.map {
                stringResource(
                    when (it) {
                        DateRanges.Preset.TODAY -> R.string.earnings_today
                        DateRanges.Preset.WEEK -> R.string.earnings_week
                        DateRanges.Preset.MONTH -> R.string.earnings_month
                    },
                )
            },
            selectedIndex = presets.indexOf(preset),
            onSelect = { vm.select(presets[it]) },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        )
        LoadableContent(state = state, onRefresh = { vm.load(refresh = true) }) { e ->
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item(key = "chart") { EarnedCard(e, preset) }
                item(key = "balance") { BalanceCard(e.balanceBaisa) }
                item(key = "payouts") {
                    QSecondaryButton(stringResource(R.string.earnings_payouts), onClick = onPayouts, icon = Icons.Outlined.AccountBalance, modifier = Modifier.fillMaxWidth())
                }
                item(key = "ledger-title") {
                    Text(stringResource(R.string.earnings_ledger), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
                    if (e.entries.isEmpty()) {
                        Text(stringResource(R.string.earnings_no_entries), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 6.dp))
                    }
                }
                if (e.entries.isNotEmpty()) {
                    item(key = "ledger") {
                        QCard(Modifier.fillMaxWidth(), padding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                            e.entries.forEachIndexed { i, entry ->
                                LedgerRow(entry)
                                if (i != e.entries.lastIndex) HorizontalDivider()
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EarnedCard(e: Earnings, preset: DateRanges.Preset) {
    val arabic = isArabic()
    val range = remember(preset, e.from, e.to) { DateRanges.of(preset) }
    val bars = remember(e, preset) {
        if (preset == DateRanges.Preset.TODAY) EarningsChart.byHourBlocks(e.entries, range.to) else EarningsChart.byDay(e.entries, range)
    }
    val locale = if (arabic) Locale.forLanguageTag("ar") else Locale.ENGLISH
    val labels = bars.mapIndexed { i, bar ->
        when (preset) {
            // Start hour of each 4-hour block.
            DateRanges.Preset.TODAY -> digits((bar.startHour ?: 0).toString().padStart(2, '0'))
            DateRanges.Preset.WEEK -> bar.date.dayOfWeek.getDisplayName(TextStyle.SHORT, locale)
            // Label every fifth day so a month of bars stays readable.
            DateRanges.Preset.MONTH -> if (i == 0 || (i + 1) % 5 == 0) digits(bar.date.dayOfMonth.toString()) else ""
        }
    }
    val highlight = when (preset) {
        DateRanges.Preset.TODAY -> bars.indexOfLast { it.amountBaisa > 0 }
        else -> bars.lastIndex // today
    }
    QCard(Modifier.fillMaxWidth()) {
        Text(stringResource(R.string.earnings_earned), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        QPrice(e.earningsBaisa, style = MaterialTheme.typography.displaySmall)
        Spacer(Modifier.height(16.dp))
        EarningsBarChart(
            values = bars.map { it.amountBaisa },
            labels = labels,
            highlightIndex = highlight,
            description = stringResource(R.string.earnings_chart_description, money(e.earningsBaisa)),
        )
        HorizontalDivider(Modifier.padding(vertical = 14.dp))
        Row {
            StatTile(stringResource(R.string.earnings_deliveries), Modifier.weight(1f)) {
                Text(digits(e.deliveriesCount.toString()), style = MaterialTheme.typography.titleLarge.tabular())
            }
            if (e.codCollectedBaisa > 0) {
                StatTile(stringResource(R.string.earnings_cod_collected), Modifier.weight(1.4f)) {
                    QPrice(e.codCollectedBaisa, style = MaterialTheme.typography.titleLarge)
                }
            }
        }
    }
}

@Composable
private fun LedgerRow(entry: LedgerEntry) {
    Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(entry.description.ifBlank { ledgerTypeLabel(entry.entryType) }, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(entry.orderNumber?.let { digits("#$it") }, dateTime(entry.createdAt)).joinToString("  ·  "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(12.dp))
        if (entry.amountBaisa > 0) Text("+", style = MaterialTheme.typography.titleSmall, color = QabnahColors.Success.readableOnSurface())
        QPrice(
            entry.amountBaisa,
            style = MaterialTheme.typography.titleSmall,
            color = (if (entry.amountBaisa >= 0) QabnahColors.Success else QabnahColors.Danger).readableOnSurface(),
        )
    }
}

/** Localized fallback when a ledger entry has no description. */
@Composable
private fun ledgerTypeLabel(type: String): String = stringResource(
    when (type) {
        "captain_earning" -> R.string.ledger_captain_earning
        "tip" -> R.string.ledger_tip
        "cod_collected" -> R.string.ledger_cod_collected
        "cod_remitted" -> R.string.ledger_cod_remitted
        "payout" -> R.string.ledger_payout
        else -> R.string.ledger_other
    },
)

/** `balanceBaisa`: positive = Qabnah owes the captain; negative = the captain holds cash owed to Qabnah. */
@Composable
private fun BalanceCard(balance: Long) {
    val (title, body, color) = when {
        balance > 0 -> Triple(stringResource(R.string.balance_owed_to_you), stringResource(R.string.balance_owed_to_you_body), QabnahColors.Success)
        balance < 0 -> Triple(stringResource(R.string.balance_you_owe), stringResource(R.string.balance_you_owe_body), QabnahColors.Danger)
        else -> Triple(stringResource(R.string.balance_settled), stringResource(R.string.balance_settled_body), QabnahColors.Primary)
    }
    QCard(Modifier.fillMaxWidth()) {
        StatusPill(title, color)
        QPrice(kotlin.math.abs(balance), style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 10.dp))
        Text(body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
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
            empty = { EmptyState(stringResource(R.string.payouts_empty)) },
        ) { list ->
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(list, key = { it.id }) { s ->
                    QCard(Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.AccountBalance, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.width(12.dp))
                            Text(digits("${s.periodStart} – ${s.periodEnd}"), style = MaterialTheme.typography.titleSmall.tabular(), modifier = Modifier.weight(1f))
                            StatusPill(payoutStatus(s.status), if (s.status == "paid") QabnahColors.Success else QabnahColors.Info)
                        }
                        QPrice(s.netBaisa, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 10.dp))
                        Text(stringResource(R.string.payouts_entries, digits(s.entryCount.toString())), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        s.payoutReference?.let { Text(stringResource(R.string.payouts_reference, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        s.paidAt?.let { Text(stringResource(R.string.payouts_paid_at, dateTime(it)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
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
