package om.qabnah.consumer.ui.store

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.loc
import om.qabnah.android.ui.components.money
import om.qabnah.consumer.R
import om.qabnah.core.cart.OptionIssue
import om.qabnah.core.cart.OptionRules
import om.qabnah.core.model.OptionGroup

@Composable
fun ProductSheet(
    ui: ProductSheetUi,
    onDismiss: () -> Unit,
    onToggle: (groupId: String, optionId: String) -> Unit,
    onQuantity: (Int) -> Unit,
    onNotes: (String) -> Unit,
    onAdd: () -> Unit,
) {
    val p = ui.product
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
                if (p.imageUrl != null) {
                    AsyncImage(
                        model = p.imageUrl,
                        contentDescription = loc(p.nameEn, p.nameAr),
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxWidth().height(200.dp).clip(MaterialTheme.shapes.large),
                    )
                    Spacer(Modifier.height(12.dp))
                }
                Text(loc(p.nameEn, p.nameAr), style = MaterialTheme.typography.headlineSmall)
                val desc = loc(p.descriptionEn, p.descriptionAr)
                if (desc.isNotBlank()) Text(desc, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(money(p.basePriceBaisa), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)

                p.optionGroups.forEach { g ->
                    Spacer(Modifier.height(16.dp))
                    OptionGroupSection(g, ui.selection[g.id].orEmpty(), ui.issues.filter { it.groupId == g.id }, onToggle)
                }

                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = ui.notes,
                    onValueChange = onNotes,
                    label = { Text(stringResource(R.string.product_notes)) },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 3,
                )
                Spacer(Modifier.height(16.dp))
            }
            HorizontalDivider()
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                FilledTonalIconButton(onClick = { onQuantity(ui.quantity - 1) }, enabled = ui.quantity > 1) {
                    Icon(Icons.Filled.Remove, contentDescription = stringResource(R.string.qty_decrease))
                }
                Text(digits(ui.quantity.toString()), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 12.dp))
                FilledTonalIconButton(onClick = { onQuantity(ui.quantity + 1) }) {
                    Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.qty_increase))
                }
                Spacer(Modifier.width(12.dp))
                Button(onClick = onAdd, enabled = ui.canAdd, modifier = Modifier.weight(1f).height(52.dp)) {
                    Text(stringResource(R.string.product_add, money(ui.totalBaisa)))
                }
            }
        }
    }
}

@Composable
private fun OptionGroupSection(
    group: OptionGroup,
    selected: Set<String>,
    issues: List<OptionIssue>,
    onToggle: (String, String) -> Unit,
) {
    val single = OptionRules.isSingleChoice(group)
    val max = OptionRules.effectiveMax(group)
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(loc(group.nameEn, group.nameAr), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            val hint = when {
                group.minSelect >= 1 && single -> stringResource(R.string.option_required_one)
                group.minSelect >= 1 -> stringResource(R.string.option_required_range, digits(group.minSelect.toString()), digits(max.toString()))
                single -> stringResource(R.string.option_optional_one)
                else -> stringResource(R.string.option_optional_up_to, digits(max.toString()))
            }
            Text(hint, style = MaterialTheme.typography.labelMedium, color = if (issues.any { it is OptionIssue.TooFew }) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
        }
        val canMore = OptionRules.canSelectMore(group, selected)
        group.options.forEach { o ->
            val isSelected = o.id in selected
            val enabled = o.isAvailable && (isSelected || canMore)
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable(enabled = enabled, role = if (single) Role.RadioButton else Role.Checkbox) { onToggle(group.id, o.id) }
                    .padding(vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Start,
            ) {
                if (single) RadioButton(selected = isSelected, onClick = null, enabled = enabled)
                else Checkbox(checked = isSelected, onCheckedChange = null, enabled = enabled)
                Text(
                    loc(o.nameEn, o.nameAr) + if (!o.isAvailable) " · " + stringResource(R.string.product_unavailable) else "",
                    modifier = Modifier.weight(1f).padding(start = 8.dp),
                    color = if (o.isAvailable) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (o.priceDeltaBaisa != 0L) {
                    Text((if (o.priceDeltaBaisa > 0) "+" else "") + money(o.priceDeltaBaisa), style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}
