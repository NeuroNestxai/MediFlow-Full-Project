package om.qabnah.core

import om.qabnah.core.model.AvailabilitySlot
import om.qabnah.core.model.LatLng
import om.qabnah.core.util.Availability
import om.qabnah.core.util.BrandColors
import om.qabnah.core.util.DateRanges
import om.qabnah.core.util.Eta
import om.qabnah.core.util.Geo
import om.qabnah.core.util.Phones
import om.qabnah.core.util.localized
import java.time.Instant
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class UtilTest {
    @Test
    fun phones() {
        assertEquals("+96891234567", Phones.normalizeOmanMobile("9123 4567"))
        assertEquals("+96891234567", Phones.normalizeOmanMobile("+968 9123-4567"))
        assertEquals("+96871234567", Phones.normalizeOmanMobile("0096871234567"))
        assertEquals("+96891234567", Phones.normalizeOmanMobile("٩١٢٣٤٥٦٧"))
        assertNull(Phones.normalizeOmanMobile("24123456")) // landline
        assertNull(Phones.normalizeOmanMobile("123"))
        assertEquals("https://wa.me/96891234567", Phones.whatsappUrl("+968 9123 4567"))
        assertEquals("https://wa.me/96891234567", Phones.whatsappUrl("91234567"))
        assertEquals("tel:+96891234567", Phones.dialUri("+968 9123 4567"))
    }

    @Test
    fun localizedFallback() {
        assertEquals("قهوة", localized("Coffee", "قهوة", true))
        assertEquals("Coffee", localized("Coffee", "", true))
        assertEquals("قهوة", localized(null, "قهوة", false))
    }

    @Test
    fun availability() {
        val ok = listOf(AvailabilitySlot(0, "08:00", "12:00"), AvailabilitySlot(0, "12:00", "16:00"), AvailabilitySlot(1, "20:00", "24:00"))
        assertTrue(Availability.validate(ok).isEmpty())
        val bad = listOf(AvailabilitySlot(2, "10:00", "09:00"))
        assertEquals(listOf<Availability.Issue>(Availability.Issue.EndBeforeStart(0)), Availability.validate(bad))
        val overlap = listOf(AvailabilitySlot(3, "08:00", "12:00"), AvailabilitySlot(3, "11:00", "13:00"))
        assertEquals(listOf<Availability.Issue>(Availability.Issue.Overlap(0, 1)), Availability.validate(overlap))
        assertEquals(listOf<Availability.Issue>(Availability.Issue.BadTime(0)), Availability.validate(listOf(AvailabilitySlot(1, "8am", "10:00"))))
    }

    @Test
    fun dateRanges() {
        val wed = LocalDate.of(2026, 11, 18) // Wednesday
        assertEquals(DateRanges.Range(wed, wed), DateRanges.of(DateRanges.Preset.TODAY, wed))
        assertEquals("2026-11-15", DateRanges.of(DateRanges.Preset.WEEK, wed).fromIso) // Sunday
        assertEquals("2026-11-01", DateRanges.of(DateRanges.Preset.MONTH, wed).fromIso)
    }

    @Test
    fun etaAndGeo() {
        val now = Instant.parse("2026-11-16T10:20:00Z").toEpochMilli()
        assertEquals(15, Eta.minutesUntil("2026-11-16T10:35:00Z", now))
        assertEquals(0, Eta.minutesUntil("2026-11-16T10:00:00Z", now))
        assertNull(Eta.minutesUntil("not a date", now))
        val d = Geo.distanceMeters(LatLng(23.588, 58.3829), LatLng(23.6, 58.41))
        assertTrue(d in 2_900.0..3_200.0, "distance was $d")
    }

    @Test
    fun brandColors() {
        assertEquals(0xFF0E7C66.toInt(), BrandColors.parse("#0E7C66"))
        assertNull(BrandColors.parse("teal"))
        assertTrue(BrandColors.prefersLightContent(0xFF0E7C66.toInt()))
        assertTrue(!BrandColors.prefersLightContent(0xFFF4A300.toInt()))
    }
}

class EarningsChartTest {
    private fun entry(id: Long, type: String, amount: Long, at: String) =
        om.qabnah.core.model.LedgerEntry(id = id, entryType = type, amountBaisa = amount, createdAt = at)

    private val entries = listOf(
        entry(1, "captain_earning", 800, "2026-11-15T05:10:00Z"),  // 09:10 Muscat, 15 Nov
        entry(2, "tip", 200, "2026-11-15T05:30:00Z"),
        entry(3, "cod_collected", -2500, "2026-11-15T05:31:00Z"),   // cash is not an earning
        entry(4, "captain_earning", 1000, "2026-11-16T21:30:00Z"), // 01:30 Muscat on 17 Nov
        entry(5, "payout", -1800, "2026-11-17T06:00:00Z"),
        entry(6, "captain_earning", 600, "not-a-date"),
    )

    @kotlin.test.Test
    fun `daily bars cover the whole range in Muscat time`() {
        val range = om.qabnah.core.util.DateRanges.Range(java.time.LocalDate.of(2026, 11, 15), java.time.LocalDate.of(2026, 11, 17))
        val bars = om.qabnah.core.util.EarningsChart.byDay(entries, range)
        kotlin.test.assertEquals(listOf(1000L, 0L, 1000L), bars.map { it.amountBaisa })
        kotlin.test.assertEquals(java.time.LocalDate.of(2026, 11, 16), bars[1].date)
        kotlin.test.assertTrue(bars.all { it.startHour == null })
    }

    @kotlin.test.Test
    fun `hour blocks split today into six bars`() {
        val bars = om.qabnah.core.util.EarningsChart.byHourBlocks(entries, java.time.LocalDate.of(2026, 11, 15))
        kotlin.test.assertEquals(listOf(0, 4, 8, 12, 16, 20), bars.map { it.startHour })
        kotlin.test.assertEquals(listOf(0L, 0L, 1000L, 0L, 0L, 0L), bars.map { it.amountBaisa })
        kotlin.test.assertEquals(1000L, om.qabnah.core.util.EarningsChart.byHourBlocks(entries, java.time.LocalDate.of(2026, 11, 17))[0].amountBaisa)
    }
}
