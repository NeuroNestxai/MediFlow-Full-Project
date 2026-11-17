package om.qabnah.consumer.ui.store

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Fastfood
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import om.qabnah.android.ui.components.QBottomSheet
import om.qabnah.android.ui.components.QButton
import om.qabnah.android.ui.components.QPhoto
import om.qabnah.android.ui.components.QPrice
import om.qabnah.android.ui.components.QStepper
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.loc
import om.qabnah.android.ui.components.priceText
import om.qabnah.consumer.R
import om.qabnah.core.cart.OptionIssue
import om.qabnah.core.cart.OptionRules
import om.qabnah.core.model.OptionGroup

/**
 * Product bottom sheet: large 16:10 photo, option rows (variant radios / add-on checkboxes with min/max rules), notes,
 * and a sticky add bar with the stepper and the live price.
 */
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
    val name = loc(p.nameEn, p.nameAr)
    QBottomSheet(onDismiss = onDismiss) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
                QPhoto(
                    url = p.imageUrl,
                    contentDescription = name,
                    glyph = Icons.Outlined.Fastfood,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).aspectRatio(16f / 10f),
                )
                Column(Modifier.padding(horizontal = 16.dp)) {
                    Spacer(Modifier.height(16.dp))
                    Text(name, style = MaterialTheme.typography.headlineSmall)
                    val desc = loc(p.descriptionEn, p.descriptionAr)
                    if (desc.isNotBlank()) {
                        Text(desc, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                    }
                    Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        QPrice(p.basePriceBaisa, style = MaterialTheme.typography.titleLarge)
                        p.compareAtPriceBaisa?.takeIf { it > p.basePriceBaisa }?.let {
                            Spacer(Modifier.width(10.dp))
                            QPrice(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, strikethrough = true)
                        }
                    }
                }

                p.optionGroups.forEach { g ->
                    Spacer(Modifier.height(20.dp))
                    OptionGroupSection(g, ui.selection[g.id].orEmpty(), ui.issues.filter { it.groupId == g.id }, onToggle)
                }

                OutlinedTextField(
                    value = ui.notes,
                    onValueChange = onNotes,
                    label = { Text(stringResource(R.string.product_notes)) },
                    modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 16.dp),
                    maxLines = 3,
                )
            }
            HorizontalDivider()
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                QStepper(
                    value = digits(ui.quantity.toString()),
                    onDecrease = { onQuantity(ui.quantity - 1) },
                    onIncrease = { onQuantity(ui.quantity + 1) },
                    decreaseDescription = stringResource(R.string.qty_decrease),
                    increaseDescription = stringResource(R.string.qty_increase),
                    decreaseEnabled = ui.quantity > 1,
                )
                QButton(onClick = onAdd, enabled = ui.canAdd, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.product_add_label), modifier = Modifier.weight(1f))
                    Text(priceText(ui.totalBaisa))
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
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(loc(group.nameEn, group.nameAr), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            val hint = when {
                group.minSelect >= 1 && single -> stringResource(R.string.option_required_one)
                group.minSelect >= 1 -> stringResource(R.string.option_required_range, digits(group.minSelect.toString()), digits(max.toString()))
                single -> stringResource(R.string.option_optional_one)
                else -> stringResource(R.string.option_optional_up_to, digits(max.toString()))
            }
            Text(
                hint,
                style = MaterialTheme.typography.labelMedium,
                color = if (issues.any { it is OptionIssue.TooFew }) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(4.dp))
        val canMore = OptionRules.canSelectMore(group, selected)
        group.options.forEachIndexed { index, o ->
            val isSelected = o.id in selected
            val enabled = o.isAvailable && (isSelected || canMore)
            Row(
                Modifier
                    .fillMaxWidth()
                    .selectable(selected = isSelected, enabled = enabled, role = if (single) Role.RadioButton else Role.Checkbox) { onToggle(group.id, o.id) }
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        loc(o.nameEn, o.nameAr),
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (o.isAvailable) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (!o.isAvailable) {
                        Text(stringResource(R.string.product_unavailable), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (o.priceDeltaBaisa != 0L) {
                    Text(if (o.priceDeltaBaisa > 0) "+" else "", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    QPrice(o.priceDeltaBaisa, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(8.dp))
                }
                if (single) RadioButton(selected = isSelected, onClick = null, enabled = enabled)
                else Checkbox(checked = isSelected, onCheckedChange = null, enabled = enabled)
            }
            if (index != group.options.lastIndex) HorizontalDivider(Modifier.padding(horizontal = 16.dp))
        }
    }
}
