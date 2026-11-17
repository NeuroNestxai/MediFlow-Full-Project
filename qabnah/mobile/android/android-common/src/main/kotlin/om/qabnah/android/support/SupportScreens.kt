package om.qabnah.android.support

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.R
import om.qabnah.android.ui.components.EmptyState
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.android.ui.components.ProgressButton
import om.qabnah.android.ui.components.QButton
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.dateTime
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.components.ticketCategoryLabel
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.core.model.TicketCategory

@Composable
fun TicketsScreen(repo: SupportRepository, onBack: () -> Unit, onOpen: (String) -> Unit, onNew: () -> Unit) {
    val vm: TicketsViewModel = viewModel { TicketsViewModel(repo) }
    val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.load(refresh = state.data != null) }
    ScreenScaffold(
        title = stringResource(R.string.support_title),
        onBack = onBack,
        floatingActionButton = {
            QButton(stringResource(R.string.support_new), onClick = onNew, icon = Icons.Filled.Add)
        },
    ) { padding ->
        LoadableContent(
            state = state,
            onRefresh = { vm.load(refresh = true) },
            modifier = Modifier.padding(padding),
            isEmpty = { it.isEmpty() },
            empty = { EmptyState(stringResource(R.string.support_empty), icon = Icons.Filled.SupportAgent) },
        ) { tickets ->
            LazyColumn(Modifier.fillMaxSize()) {
                items(tickets, key = { it.id }) { t ->
                    ListItem(
                        headlineContent = { Text(t.subject) },
                        supportingContent = { Text(stringResource(R.string.support_ticket_number, t.number) + " · " + dateTime(t.updatedAt.ifBlank { t.createdAt })) },
                        trailingContent = { StatusPill(t.status.replace('_', ' '), QabnahColors.Primary) },
                        modifier = Modifier.clickable { onOpen(t.id) },
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
fun TicketDetailScreen(repo: SupportRepository, ticketId: String, onBack: () -> Unit) {
    val vm: TicketDetailViewModel = viewModel { TicketDetailViewModel(repo, ticketId) }
    val state by vm.state.collectAsStateWithLifecycle()
    val ui by vm.ui.collectAsStateWithLifecycle()
    ScreenScaffold(
        title = state.data?.let { stringResource(R.string.support_ticket_number, it.number) } ?: stringResource(R.string.support_title),
        onBack = onBack,
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize().imePadding()) {
            LoadableContent(state = state, onRefresh = { vm.load(refresh = true) }, modifier = Modifier.weight(1f)) { t ->
                LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        Column(Modifier.padding(16.dp)) {
                            Text(t.subject, style = MaterialTheme.typography.titleMedium)
                            Text(t.status.replace('_', ' '), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    items(t.messages.filter { !it.isInternal }, key = { it.id }) { m ->
                        val staff = m.author.isStaff
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                            horizontalArrangement = if (staff) Arrangement.Start else Arrangement.End,
                        ) {
                            Card(
                                colors = CardDefaults.cardColors(
                                    containerColor = if (staff) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.primaryContainer,
                                ),
                                modifier = Modifier.widthIn(max = 320.dp),
                            ) {
                                Column(Modifier.padding(12.dp)) {
                                    Text(
                                        if (staff) stringResource(R.string.support_staff) else m.author.fullName,
                                        style = MaterialTheme.typography.labelMedium,
                                    )
                                    Text(m.body, style = MaterialTheme.typography.bodyMedium)
                                    Text(dateTime(m.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
            ui.sendError?.let { Text(errorMessage(it), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp)) }
            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = ui.reply,
                    onValueChange = vm::onReplyChange,
                    placeholder = { Text(stringResource(R.string.support_reply_hint)) },
                    modifier = Modifier.weight(1f),
                    maxLines = 4,
                )
                IconButton(onClick = vm::send, enabled = ui.reply.isNotBlank() && !ui.sending) {
                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = stringResource(R.string.common_send))
                }
            }
        }
    }
}

@Composable
fun NewTicketScreen(repo: SupportRepository, orderId: String?, onBack: () -> Unit, onCreated: (String) -> Unit) {
    val vm: NewTicketViewModel = viewModel { NewTicketViewModel(repo, orderId) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(ui.createdId) { ui.createdId?.let(onCreated) }
    ScreenScaffold(title = stringResource(R.string.support_new), onBack = onBack) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (vm.hasOrder) Text(stringResource(R.string.support_about_order), style = MaterialTheme.typography.labelLarge)
            Text(stringResource(R.string.support_category), style = MaterialTheme.typography.labelLarge)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TicketCategory.selectable.forEach { c ->
                    FilterChip(selected = ui.category == c, onClick = { vm.onCategory(c) }, label = { Text(ticketCategoryLabel(c)) })
                }
            }
            OutlinedTextField(
                value = ui.subject,
                onValueChange = vm::onSubject,
                label = { Text(stringResource(R.string.support_subject)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = ui.message,
                onValueChange = vm::onMessage,
                label = { Text(stringResource(R.string.support_message)) },
                minLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )
            if (ui.missingFields) Text(stringResource(R.string.support_required), color = MaterialTheme.colorScheme.error)
            ui.error?.let { Text(errorMessage(it), color = MaterialTheme.colorScheme.error) }
            ProgressButton(stringResource(R.string.support_submit), onClick = vm::submit, loading = ui.submitting)
        }
    }
}

@Composable
fun NotificationsScreen(repo: SupportRepository, onBack: () -> Unit, onOpenOrder: ((String) -> Unit)? = null) {
    val vm: NotificationsViewModel = viewModel { NotificationsViewModel(repo) }
    val state by vm.state.collectAsStateWithLifecycle()
    ScreenScaffold(title = stringResource(R.string.notifications_title), onBack = onBack) { padding ->
        LoadableContent(
            state = state,
            onRefresh = { vm.load(refresh = true) },
            modifier = Modifier.padding(padding),
            isEmpty = { it.items.isEmpty() },
            empty = { EmptyState(stringResource(R.string.notifications_empty), icon = Icons.Filled.Notifications) },
        ) { page ->
            LazyColumn(Modifier.fillMaxSize()) {
                items(page.items, key = { it.id }) { n ->
                    val orderId = (n.data?.get("orderId") as? kotlinx.serialization.json.JsonPrimitive)?.content
                    ListItem(
                        leadingContent = if (n.readAt == null) {
                            { Icon(Icons.Filled.Circle, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.widthIn(max = 10.dp)) }
                        } else null,
                        headlineContent = { Text(n.title) },
                        supportingContent = {
                            Column {
                                Text(n.body)
                                Text(dateTime(n.createdAt), style = MaterialTheme.typography.labelSmall)
                            }
                        },
                        modifier = Modifier.clickable {
                            vm.markRead(n.id)
                            if (orderId != null && onOpenOrder != null) onOpenOrder(orderId)
                        },
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}
