package om.qabnah.consumer.ui.account

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.ui.components.ConfirmDialog
import om.qabnah.android.ui.components.EmptyState
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.core.model.Address
import om.qabnah.android.R as CommonR

@Composable
fun AddressesScreen(container: ConsumerContainer, onBack: () -> Unit, onAdd: () -> Unit, onEdit: (String) -> Unit) {
    val vm: AddressesViewModel = viewModel { AddressesViewModel(container.account) }
    val state by vm.state.collectAsStateWithLifecycle()
    var deleting by remember { mutableStateOf<Address?>(null) }
    LifecycleResumeEffect(Unit) {
        vm.load(refresh = state.data != null)
        onPauseOrDispose { }
    }
    ScreenScaffold(
        title = stringResource(R.string.account_addresses),
        onBack = onBack,
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = onAdd, icon = { Icon(Icons.Filled.Add, contentDescription = null) }, text = { Text(stringResource(R.string.address_add)) })
        },
    ) { padding ->
        LoadableContent(
            state = state,
            onRefresh = { vm.load(refresh = true) },
            modifier = Modifier.padding(padding),
            isEmpty = { it.isEmpty() },
            empty = { EmptyState(stringResource(R.string.address_empty), icon = Icons.Filled.Place) },
        ) { list ->
            LazyColumn(Modifier.fillMaxSize()) {
                items(list, key = { it.id }) { a ->
                    ListItem(
                        headlineContent = { Text(a.label?.takeIf { it.isNotBlank() } ?: stringResource(R.string.address_untitled)) },
                        supportingContent = {
                            androidx.compose.foundation.layout.Column {
                                Text(a.summary())
                                if (!a.isInServiceArea) Text(stringResource(CommonR.string.error_out_of_service_area), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
                            }
                        },
                        trailingContent = {
                            Row {
                                IconButton(onClick = { if (!a.isDefault) vm.makeDefault(a) }) {
                                    Icon(
                                        if (a.isDefault) Icons.Filled.Star else Icons.Filled.StarBorder,
                                        contentDescription = stringResource(if (a.isDefault) R.string.address_default else R.string.address_make_default),
                                        tint = QabnahColors.Accent,
                                    )
                                }
                                IconButton(onClick = { deleting = a }) {
                                    Icon(Icons.Filled.Delete, contentDescription = stringResource(CommonR.string.common_delete))
                                }
                            }
                        },
                        modifier = Modifier.clickable { onEdit(a.id) },
                    )
                    HorizontalDivider()
                }
            }
        }
    }
    deleting?.let { a ->
        ConfirmDialog(
            title = stringResource(R.string.address_delete_title),
            text = a.summary(),
            confirmLabel = stringResource(CommonR.string.common_delete),
            onConfirm = { vm.delete(a.id); deleting = null },
            onDismiss = { deleting = null },
        )
    }
}
