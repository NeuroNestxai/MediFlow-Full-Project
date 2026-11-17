package om.qabnah.core

import om.qabnah.core.cart.Cart
import om.qabnah.core.cart.CartCodec
import om.qabnah.core.cart.CartLine
import om.qabnah.core.cart.CartMerchant
import om.qabnah.core.model.LatLng
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CartCodecTest {
    private val merchant = CartMerchant(
        id = "m-1", slug = "al-noor", nameEn = "Al Noor", nameAr = "النور", brandColor = "#0E7C66",
        acceptsCod = true, acceptsOnline = false, minOrderBaisa = 1500, isOpen = true, location = LatLng(23.588, 58.3829),
    )
    private val line = CartLine(
        productId = "p-1", nameEn = "Karak", nameAr = "كرك", imageUrl = null, optionIds = listOf("o-large"),
        optionNamesEn = listOf("Large"), optionNamesAr = listOf("كبير"), unitPriceBaisa = 500, quantity = 3, notes = "less sugar",
    )

    @Test
    fun `round-trips a cart`() {
        val cart = Cart(merchant, listOf(line, line.copy(productId = "p-2", notes = null, quantity = 1)))
        val decoded = CartCodec.decode(CartCodec.encode(cart, nowMs = 1_000), nowMs = 2_000)
        assertEquals(cart, decoded)
        assertEquals(4, decoded.itemCount)
        assertEquals(2000, decoded.subtotalBaisa)
    }

    @Test
    fun `corrupt, empty or future data gives an empty cart`() {
        assertTrue(CartCodec.decode(null).isEmpty)
        assertTrue(CartCodec.decode("").isEmpty)
        assertTrue(CartCodec.decode("{not json").isEmpty)
        assertTrue(CartCodec.decode("""{"version":99,"cart":{}}""").isEmpty)
        assertTrue(CartCodec.decode(CartCodec.encode(Cart())).isEmpty)
    }

    @Test
    fun `drops invalid lines and expires old carts`() {
        val text = CartCodec.encode(Cart(merchant, listOf(line, line.copy(productId = "p-0", quantity = 0), line.copy(productId = "p-9", quantity = 500))), nowMs = 0)
        val decoded = CartCodec.decode(text, nowMs = 10)
        assertEquals(listOf("p-1", "p-9"), decoded.lines.map { it.productId })
        assertEquals(CartLine.MAX_QUANTITY, decoded.lines[1].quantity)
        assertTrue(CartCodec.decode(text, nowMs = 10_000, maxAgeMs = 5_000).isEmpty)
    }

    @Test
    fun `tolerates unknown fields from a newer build`() {
        val text = CartCodec.encode(Cart(merchant, listOf(line))).replace("\"quantity\":3", "\"quantity\":3,\"giftWrap\":true")
        assertEquals(3, CartCodec.decode(text).lines.single().quantity)
    }
}
