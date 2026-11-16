package om.qabnah.captain.ui.onboarding

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Map
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimeInput
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.locale.isArabic
import om.qabnah.android.ui.components.EmptyState
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.android.ui.components.ProgressButton
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.components.loc
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R
import om.qabnah.core.model.AvailabilitySlot
import java.time.DayOfWeek
import java.time.format.TextStyle
import java.util.Locale

@Composable
fun ZonesScreen(container: CaptainContainer, onBack: () -> Unit) {
    val vm: ZonesViewModel = viewModel { ZonesViewModel(container.captain) }
    val zones by vm.zones.collectAsStateWithLifecycle()
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.saved.collect { onBack() } }
    ScreenScaffold(
        title = stringResource(R.string.zones_title),
        onBack = onBack,
        bottomBar = {
            Column(Modifier.navigationBarsPadding().padding(16.dp)) {
                ui.error?.let { Text(errorMessage(it), color = MaterialTheme.colorScheme.error) }
                ProgressButton(stringResource(om.qabnah.android.R.string.common_save), onClick = vm::save, enabled = ui.selected.isNotEmpty(), loading = ui.saving)
            }
        },
    ) { padding ->
        LoadableContent(
            state = zones,
            onRefresh = { vm.load(refresh = true) },
            modifier = Modifier.padding(padding),
            isEmpty = { it.isEmpty() },
            empty = { EmptyState(stringResource(R.string.zones_empty), icon = Icons.Filled.Map) },
        ) { list ->
            LazyColumn(Modifier.fillMaxSize()) {
                item { Text(stringResource(R.string.zones_intro), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(16.dp)) }
                items(list, key = { it.id }) { z ->
                    ListItem(
                        leadingContent = { Checkbox(checked = z.id in ui.selected, onCheckedChange = null) },
                        headlineContent = { Text(loc(z.nameEn, z.nameAr)) },
                        supportingContent = { Text(z.code) },
                        modifier = Modifier.clickable { vm.toggle(z.id) },
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
fun AvailabilityScreen(container: CaptainContainer, onBack: () -> Unit) {
    val vm: AvailabilityViewModel = viewModel { AvailabilityViewModel(container.captain) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    var addingFor by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(Unit) { vm.saved.collect { onBack() } }
    val locale = if (isArabic()) Locale.forLanguageTag("ar") else Locale.ENGLISH

    ScreenScaffold(
        title = stringResource(R.string.availability_title),
        onBack = onBack,
        bottomBar = {
            Column(Modifier.navigationBarsPadding().padding(16.dp)) {
                if (ui.issues.isNotEmpty()) Text(stringResource(R.string.availability_invalid), color = MaterialTheme.colorScheme.error)
                ui.error?.let { Text(errorMessage(it), color = MaterialTheme.colorScheme.error) }
                ProgressButton(stringResource(om.qabnah.android.R.string.common_save), onClick = vm::save, enabled = ui.issues.isEmpty(), loading = ui.saving)
            }
        },
    ) { padding ->
        LazyColumn(Modifier.padding(padding).fillMaxSize()) {
            item { Text(stringResource(R.string.availability_intro), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(16.dp)) }
            items((0..6).toList()) { weekday ->
                // Contract: 0 = Sunday. java.time: MONDAY = 1 … SUNDAY = 7.
                val dayName = DayOfWeek.of(if (weekday == 0) 7 else weekday).getDisplayName(TextStyle.FULL, locale)
                val daySlots = ui.slots.filter { it.weekday == weekday }
                Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(dayName, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                            if (daySlots.isNotEmpty()) {
                                IconButton(onClick = { vm.copyToAllDays(weekday) }) {
                                    Icon(Icons.Filled.ContentCopy, contentDescription = stringResource(R.string.availability_copy_all))
                                }
                            }
                            IconButton(onClick = { addingFor = weekday }) {
                                Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.availability_add))
                            }
                        }
                        if (daySlots.isEmpty()) {
                            Text(stringResource(R.string.availability_off), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        } else {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                daySlots.forEach { slot ->
                                    val bad = ui.issues.any { issue -> issueTouches(issue, ui.slots.indexOf(slot)) }
                                    InputChip(
                                        selected = false,
                                        onClick = {},
                                        label = { Text(digits("${slot.start}–${slot.end}"), color = if (bad) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface) },
                                        trailingIcon = {
                                            IconButton(onClick = { vm.remove(slot) }) {
                                                Icon(Icons.Filled.Close, contentDescription = stringResource(om.qabnah.android.R.string.common_delete))
                                            }
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    addingFor?.let { weekday ->
        TimeRangeDialog(onDismiss = { addingFor = null }, onConfirm = { start, end -> vm.add(weekday, start, end); addingFor = null })
    }
}

private fun issueTouches(issue: om.qabnah.core.util.Availability.Issue, index: Int): Boolean = when (issue) {
    is om.qabnah.core.util.Availability.Issue.BadTime -> issue.index == index
    is om.qabnah.core.util.Availability.Issue.EndBeforeStart -> issue.index == index
    is om.qabnah.core.util.Availability.Issue.BadWeekday -> issue.index == index
    is om.qabnah.core.util.Availability.Issue.Overlap -> issue.first == index || issue.second == index
}

@Composable
private fun TimeRangeDialog(onDismiss: () -> Unit, onConfirm: (String, String) -> Unit) {
    var step by remember { mutableIntStateOf(0) }
    val start = rememberTimePickerState(initialHour = 8, initialMinute = 0, is24Hour = true)
    val end = rememberTimePickerState(initialHour = 14, initialMinute = 0, is24Hour = true)
    fun fmt(h: Int, m: Int) = "%02d:%02d".format(Locale.US, h, m)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(if (step == 0) R.string.availability_start else R.string.availability_end)) },
        text = { if (step == 0) TimeInput(state = start) else TimeInput(state = end) },
        confirmButton = {
            TextButton(onClick = {
                if (step == 0) step = 1
                else onConfirm(fmt(start.hour, start.minute), fmt(end.hour, end.minute))
            }) { Text(stringResource(if (step == 0) om.qabnah.android.R.string.common_continue else om.qabnah.android.R.string.common_save)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(om.qabnah.android.R.string.common_cancel)) } },
    )
}
