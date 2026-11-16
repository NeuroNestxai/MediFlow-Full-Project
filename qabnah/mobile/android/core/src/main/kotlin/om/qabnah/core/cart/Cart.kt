package om.qabnah.core.cart

import om.qabnah.core.model.LatLng
import om.qabnah.core.model.OptionGroup
import om.qabnah.core.model.OptionGroupKind
import om.qabnah.core.model.OrderItemInput
import om.qabnah.core.model.Product
import om.qabnah.core.model.StorefrontMerchant

/** Why a product's option selection is not acceptable. */
sealed interface OptionIssue {
    val groupId: String

    data class TooFew(override val groupId: String, val min: Int, val selected: Int) : OptionIssue
    data class TooMany(override val groupId: String, val max: Int, val selected: Int) : OptionIssue
    data class Unavailable(override val groupId: String, val optionId: String) : OptionIssue
    data class UnknownOption(override val groupId: String, val optionId: String) : OptionIssue
}

/**
 * Option group rules (mirrors what `POST /orders/quote` validates server-side):
 * - selected count per group must be within [minSelect, maxSelect]; `maxSelect <= 0` is treated as "no limit".
 * - only available options may be selected.
 * - a group behaves like a radio group when `maxSelect == 1` (typical for `variant`), otherwise checkboxes.
 * Unit price = basePriceBaisa + Σ priceDeltaBaisa of the selected options.
 */
object OptionRules {

    fun effectiveMax(group: OptionGroup): Int = if (group.maxSelect <= 0) group.options.size else group.maxSelect

    fun isSingleChoice(group: OptionGroup): Boolean = effectiveMax(group) == 1

    /** Pre-selects the first available option of required single-choice groups (e.g. size variants). */
    fun defaultSelection(product: Product): Map<String, Set<String>> =
        product.optionGroups.associate { g ->
            val pick = if (g.minSelect >= 1 && isSingleChoice(g) && g.kind != OptionGroupKind.ADDON) {
                g.options.firstOrNull { it.isAvailable }?.let { setOf(it.id) } ?: emptySet()
            } else emptySet()
            g.id to pick
        }

    /**
     * Applies a tap on [optionId] in [group]. Radio groups replace the selection (and allow clearing when
     * minSelect == 0); checkbox groups toggle but never exceed the max. Unavailable options are ignored.
     */
    fun toggle(group: OptionGroup, optionId: String, current: Set<String>): Set<String> {
        val option = group.options.firstOrNull { it.id == optionId } ?: return current
        if (!option.isAvailable) return current
        val selected = optionId in current
        return when {
            isSingleChoice(group) -> when {
                selected && group.minSelect == 0 -> emptySet()
                selected -> current
                else -> setOf(optionId)
            }
            selected -> current - optionId
            current.size >= effectiveMax(group) -> current
            else -> current + optionId
        }
    }

    /** True when the option can be ticked without breaking the group's max (for disabling checkboxes). */
    fun canSelectMore(group: OptionGroup, current: Set<String>): Boolean =
        isSingleChoice(group) || current.size < effectiveMax(group)

    fun validate(product: Product, selection: Map<String, Set<String>>): List<OptionIssue> {
        val issues = mutableListOf<OptionIssue>()
        val knownGroups = product.optionGroups.associateBy { it.id }
        selection.forEach { (groupId, ids) ->
            val g = knownGroups[groupId]
            if (g == null) ids.forEach { issues += OptionIssue.UnknownOption(groupId, it) }
        }
        for (g in product.optionGroups) {
            val ids = selection[g.id].orEmpty()
            for (id in ids) {
                val o = g.options.firstOrNull { it.id == id }
                when {
                    o == null -> issues += OptionIssue.UnknownOption(g.id, id)
                    !o.isAvailable -> issues += OptionIssue.Unavailable(g.id, id)
                }
            }
            val count = ids.count { id -> g.options.any { it.id == id } }
            if (count < g.minSelect) issues += OptionIssue.TooFew(g.id, g.minSelect, count)
            if (count > effectiveMax(g)) issues += OptionIssue.TooMany(g.id, effectiveMax(g), count)
        }
        return issues
    }

    fun unitPriceBaisa(product: Product, selection: Map<String, Set<String>>): Long {
        val selected = selection.values.flatten().toSet()
        val deltas = product.optionGroups.flatMap { it.options }.filter { it.id in selected }.sumOf { it.priceDeltaBaisa }
        return product.basePriceBaisa + deltas
    }
}

/** The subset of the storefront merchant the cart and checkout need. */
data class CartMerchant(
    val id: String,
    val slug: String,
    val nameEn: String,
    val nameAr: String,
    val brandColor: String?,
    val acceptsCod: Boolean,
    val acceptsOnline: Boolean,
    val minOrderBaisa: Long,
    val isOpen: Boolean,
    val location: LatLng?,
) {
    companion object {
        fun from(m: StorefrontMerchant) = CartMerchant(
            m.id, m.slug, m.nameEn, m.nameAr, m.brandColor, m.acceptsCod, m.acceptsOnline, m.minOrderBaisa, m.isOpen, m.location,
        )
    }
}

data class CartLine(
    val productId: String,
    val nameEn: String,
    val nameAr: String,
    val imageUrl: String?,
    val optionIds: List<String>,
    val optionNamesEn: List<String>,
    val optionNamesAr: List<String>,
    val unitPriceBaisa: Long,
    val quantity: Int,
    val notes: String?,
) {
    val lineTotalBaisa: Long get() = unitPriceBaisa * quantity

    /** Two lines with the same product, options and notes are merged. */
    val key: String get() = productId + "|" + optionIds.sorted().joinToString(",") + "|" + notes.orEmpty().trim()

    companion object {
        const val MAX_QUANTITY = 99

        /** Builds a line after validating the selection; returns the issues instead when invalid. */
        fun build(
            product: Product,
            selection: Map<String, Set<String>>,
            quantity: Int,
            notes: String?,
        ): Result {
            if (!product.isPurchasable) return Result.Invalid(emptyList(), unavailable = true)
            val issues = OptionRules.validate(product, selection)
            if (issues.isNotEmpty()) return Result.Invalid(issues)
            val chosen = product.optionGroups.flatMap { g -> g.options.filter { it.id in selection[g.id].orEmpty() } }
            return Result.Ok(
                CartLine(
                    productId = product.id,
                    nameEn = product.nameEn,
                    nameAr = product.nameAr,
                    imageUrl = product.imageUrl,
                    optionIds = chosen.map { it.id },
                    optionNamesEn = chosen.map { it.nameEn },
                    optionNamesAr = chosen.map { it.nameAr },
                    unitPriceBaisa = OptionRules.unitPriceBaisa(product, selection),
                    quantity = quantity.coerceIn(1, MAX_QUANTITY),
                    notes = notes?.trim()?.takeIf { it.isNotEmpty() },
                ),
            )
        }
    }

    sealed interface Result {
        data class Ok(val line: CartLine) : Result
        data class Invalid(val issues: List<OptionIssue>, val unavailable: Boolean = false) : Result
    }
}

/** Single-merchant cart. Immutable; every operation returns a new cart. */
data class Cart(val merchant: CartMerchant? = null, val lines: List<CartLine> = emptyList()) {
    val isEmpty: Boolean get() = lines.isEmpty()
    val itemCount: Int get() = lines.sumOf { it.quantity }
    val subtotalBaisa: Long get() = lines.sumOf { it.lineTotalBaisa }
    val meetsMinimum: Boolean get() = merchant == null || subtotalBaisa >= merchant.minOrderBaisa
    val shortOfMinimumBaisa: Long get() = ((merchant?.minOrderBaisa ?: 0) - subtotalBaisa).coerceAtLeast(0)

    sealed interface AddResult {
        data class Added(val cart: Cart) : AddResult
        /** The cart holds items from another store; ask the user, then call [replaceWith]. */
        data class DifferentMerchant(val current: CartMerchant) : AddResult
    }

    fun add(merchant: CartMerchant, line: CartLine): AddResult {
        if (this.merchant != null && this.merchant.id != merchant.id && lines.isNotEmpty()) {
            return AddResult.DifferentMerchant(this.merchant)
        }
        val existing = lines.indexOfFirst { it.key == line.key }
        val newLines = if (existing >= 0) {
            lines.toMutableList().also {
                val old = it[existing]
                it[existing] = old.copy(quantity = (old.quantity + line.quantity).coerceAtMost(CartLine.MAX_QUANTITY))
            }
        } else lines + line
        return AddResult.Added(Cart(merchant, newLines))
    }

    fun replaceWith(merchant: CartMerchant, line: CartLine): Cart = Cart(merchant, listOf(line))

    fun setQuantity(index: Int, quantity: Int): Cart {
        if (index !in lines.indices) return this
        val newLines = if (quantity <= 0) lines.filterIndexed { i, _ -> i != index }
        else lines.toMutableList().also { it[index] = it[index].copy(quantity = quantity.coerceAtMost(CartLine.MAX_QUANTITY)) }
        return if (newLines.isEmpty()) Cart() else copy(lines = newLines)
    }

    fun toOrderItems(): List<OrderItemInput> =
        lines.map { OrderItemInput(it.productId, it.quantity, it.optionIds, it.notes) }
}
