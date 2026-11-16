package om.qabnah.core

import om.qabnah.core.money.Digits
import om.qabnah.core.money.Money
import om.qabnah.core.money.Units
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class MoneyTest {
    @Test
    fun `formats english`() {
        assertEquals("OMR 2.500", Money.format(2500, arabic = false))
        assertEquals("OMR 0.050", Money.format(50, arabic = false))
        assertEquals("OMR 0.000", Money.format(0, arabic = false))
        assertEquals("OMR 1,250.000", Money.format(1_250_000, arabic = false))
        assertEquals("-OMR 0.750", Money.format(-750, arabic = false))
    }

    @Test
    fun `formats arabic with arabic-indic digits and separators`() {
        assertEquals("٢٫٥٠٠ ر.ع.", Money.format(2500, arabic = true))
        assertEquals("١٬٢٥٠٫٠٠٠ ر.ع.", Money.format(1_250_000, arabic = true))
        assertEquals("-٠٫٧٥٠ ر.ع.", Money.format(-750, arabic = true))
    }

    @Test
    fun `parses omr input to baisa`() {
        assertEquals(2500L, Money.parseOmr("2.5"))
        assertEquals(2500L, Money.parseOmr("2.500"))
        assertEquals(2000L, Money.parseOmr("2"))
        assertEquals(1_250_750L, Money.parseOmr("1,250.750"))
        assertEquals(2500L, Money.parseOmr("٢٫٥"))
        assertEquals(500L, Money.parseOmr(".5"))
        assertEquals(2500L, Money.parseOmr("OMR 2.500"))
        assertNull(Money.parseOmr("2.5005"))
        assertNull(Money.parseOmr("abc"))
        assertNull(Money.parseOmr(""))
        assertNull(Money.parseOmr("."))
    }

    @Test
    fun `digit conversion`() {
        assertEquals("٠١٢٣٤٥٦٧٨٩", Digits.toArabicIndic("0123456789"))
        assertEquals("91234567", Digits.toAscii("٩١٢٣٤٥٦٧"))
        assertEquals("123", Digits.toAscii("۱۲۳"))
    }

    @Test
    fun `units`() {
        assertEquals("850 m", Units.distance(850, false))
        assertEquals("4.2 km", Units.distance(4200, false))
        assertEquals("١٫٥ كم", Units.distance(1460, true))
        assertEquals("13 min", Units.minutes(780, false))
        assertEquals("1 min", Units.minutes(0, false))
    }
}
