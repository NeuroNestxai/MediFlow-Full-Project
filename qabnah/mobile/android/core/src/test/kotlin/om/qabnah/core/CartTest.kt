package om.qabnah.core

import om.qabnah.core.cart.Cart
import om.qabnah.core.cart.CartLine
import om.qabnah.core.cart.CartMerchant
import om.qabnah.core.cart.OptionIssue
import om.qabnah.core.cart.OptionRules
import om.qabnah.core.model.Product
import om.qabnah.core.model.Storefront
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class CartTest {
    private val storefront = QabnahJson.decodeFromString(Storefront.serializer(), Fixtures.read("storefront.json"))
    private val tea: Product = storefront.categories.single().products.single()
    private val size = tea.optionGroups[0]
    private val extras = tea.optionGroups[1]
    private val merchant = CartMerchant.from(storefront.merchant)

    @Test
    fun `default selection picks first available required variant`() {
        val sel = OptionRules.defaultSelection(tea)
        assertEquals(setOf("o-s"), sel["g-size"])
        assertEquals(emptySet(), sel["g-extra"])
        assertTrue(OptionRules.validate(tea, sel).isEmpty())
        assertEquals(300L, OptionRules.unitPriceBaisa(tea, sel))
    }

    @Test
    fun `variant behaves like radio and cannot be cleared when required`() {
        var s = setOf("o-s")
        s = OptionRules.toggle(size, "o-l", s)
        assertEquals(setOf("o-l"), s)
        s = OptionRules.toggle(size, "o-l", s)
        assertEquals(setOf("o-l"), s)
    }

    @Test
    fun `addons are checkboxes limited by maxSelect and skip unavailable`() {
        var s = emptySet<String>()
        s = OptionRules.toggle(extras, "o-saffron", s)
        s = OptionRules.toggle(extras, "o-cardamom", s)
        assertEquals(setOf("o-saffron", "o-cardamom"), s)
        // max 2 reached: a third option is refused
        s = OptionRules.toggle(extras, "o-honey", s)
        assertEquals(setOf("o-saffron", "o-cardamom"), s)
        assertEquals(false, OptionRules.canSelectMore(extras, s))
        s = OptionRules.toggle(extras, "o-saffron", s)
        assertEquals(setOf("o-cardamom"), s)
        // unavailable option is ignored
        assertEquals(setOf("o-cardamom"), OptionRules.toggle(extras, "o-honey", s))
    }

    @Test
    fun `live price adds option deltas`() {
        val sel = mapOf("g-size" to setOf("o-l"), "g-extra" to setOf("o-saffron", "o-cardamom"))
        assertEquals(300L + 150 + 200 + 50, OptionRules.unitPriceBaisa(tea, sel))
    }

    @Test
    fun `validation reports min, max and unavailable`() {
        val missingSize = OptionRules.validate(tea, mapOf("g-size" to emptySet()))
        assertEquals(listOf<OptionIssue>(OptionIssue.TooFew("g-size", 1, 0)), missingSize)

        val tooMany = OptionRules.validate(
            tea,
            mapOf("g-size" to setOf("o-s", "o-l"), "g-extra" to setOf("o-honey")),
        )
        assertTrue(OptionIssue.TooMany("g-size", 1, 2) in tooMany)
        assertTrue(OptionIssue.Unavailable("g-extra", "o-honey") in tooMany)

        val unknown = OptionRules.validate(tea, mapOf("g-size" to setOf("o-s", "nope")))
        assertTrue(OptionIssue.UnknownOption("g-size", "nope") in unknown)
    }

    @Test
    fun `cart merges identical lines, totals and enforces single merchant`() {
        val sel = mapOf("g-size" to setOf("o-l"), "g-extra" to setOf("o-cardamom"))
        val line = (CartLine.build(tea, sel, 2, null) as CartLine.Result.Ok).line
        assertEquals(500L, line.unitPriceBaisa)
        var cart = Cart()
        cart = (cart.add(merchant, line) as Cart.AddResult.Added).cart
        cart = (cart.add(merchant, line.copy(quantity = 1)) as Cart.AddResult.Added).cart
        assertEquals(1, cart.lines.size)
        assertEquals(3, cart.itemCount)
        assertEquals(1500L, cart.subtotalBaisa)
        assertTrue(cart.meetsMinimum)

        val other = merchant.copy(id = "m-2")
        val result = cart.add(other, line)
        assertIs<Cart.AddResult.DifferentMerchant>(result)
        val replaced = cart.replaceWith(other, line)
        assertEquals("m-2", replaced.merchant!!.id)
        assertEquals(1, replaced.lines.size)

        val items = cart.toOrderItems()
        assertEquals(listOf("o-l", "o-cardamom"), items.single().optionIds)
        assertEquals(3, items.single().quantity)

        val emptied = cart.setQuantity(0, 0)
        assertTrue(emptied.isEmpty)
    }

    @Test
    fun `below minimum order`() {
        val line = (CartLine.build(tea, OptionRules.defaultSelection(tea), 1, " ") as CartLine.Result.Ok).line
        val cart = (Cart().add(merchant, line) as Cart.AddResult.Added).cart
        assertEquals(false, cart.meetsMinimum)
        assertEquals(1200L, cart.shortOfMinimumBaisa)
        assertEquals(null, line.notes)
    }

    @Test
    fun `invalid selection is not added`() {
        val r = CartLine.build(tea, emptyMap(), 1, null)
        assertIs<CartLine.Result.Invalid>(r)
    }
}
