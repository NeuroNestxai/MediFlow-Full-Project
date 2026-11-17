package om.qabnah.android.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import om.qabnah.android.R
import om.qabnah.android.locale.isArabic
import om.qabnah.core.util.BrandColors

/** Design System v2 "Night & Sand" colour tokens (docs/DESIGN_SYSTEM.md). Brand colours and their tints only. */
object QabnahColors {
    val Night = Color(0xFF061A16)
    val Night2 = Color(0xFF0B2A25)
    val NightLine = Color(0xFF1B3F38)
    val OnNight = Color(0xFFF3F7F5)
    val OnNightMuted = Color(0xFFA9BDB8)

    val Primary = Color(0xFF0E7C66)
    val PrimaryDeep = Color(0xFF095C4C)
    val PrimarySoft = Color(0xFFE3F3EF)
    /** Green tint that stays readable on night surfaces (links, selection controls in the captain app). */
    val PrimaryOnNight = Color(0xFF4CC3A6)

    val Saffron = Color(0xFFF4A300)
    val SaffronSoft = Color(0xFFFEF3D6)

    val Sand = Color(0xFFFAF6EE)
    /** Slightly deeper sand for chips and input fills on a sand page. */
    val SandDeep = Color(0xFFF1EBDD)
    val Surface = Color(0xFFFFFFFF)
    val Ink = Color(0xFF0B1F1C)
    val Muted = Color(0xFF5B6B68)
    val Line = Color(0xFFE8E3D8)

    val Success = Color(0xFF15803D)
    val Warning = Color(0xFFB45309)
    val Danger = Color(0xFFC2410C)
    val Info = Color(0xFF1D4ED8)

    // v1 names kept for existing call sites.
    val PrimaryDark = PrimaryDeep
    val PrimaryLight = PrimarySoft
    val Accent = Saffron
    val Border = Line
}

/** Which of the two v2 surfaces an app renders on. Consumer = [SAND] (light), captain = [NIGHT] (dark). */
enum class QabnahPalette { SAND, NIGHT }

val LocalQabnahPalette = staticCompositionLocalOf { QabnahPalette.SAND }

/** True inside the captain app's night theme (primary actions become saffron, cards get a hairline instead of a shadow). */
val isNightPalette: Boolean
    @Composable @ReadOnlyComposable get() = LocalQabnahPalette.current == QabnahPalette.NIGHT

private val SandScheme = lightColorScheme(
    primary = QabnahColors.Primary,
    onPrimary = Color.White,
    primaryContainer = QabnahColors.PrimarySoft,
    onPrimaryContainer = QabnahColors.PrimaryDeep,
    inversePrimary = QabnahColors.PrimaryOnNight,
    secondary = QabnahColors.Saffron,
    onSecondary = QabnahColors.Ink,
    secondaryContainer = QabnahColors.SaffronSoft,
    onSecondaryContainer = QabnahColors.Ink,
    tertiary = QabnahColors.PrimaryDeep,
    onTertiary = Color.White,
    tertiaryContainer = QabnahColors.PrimarySoft,
    onTertiaryContainer = QabnahColors.PrimaryDeep,
    background = QabnahColors.Sand,
    onBackground = QabnahColors.Ink,
    surface = QabnahColors.Surface,
    onSurface = QabnahColors.Ink,
    surfaceVariant = QabnahColors.SandDeep,
    onSurfaceVariant = QabnahColors.Muted,
    surfaceTint = QabnahColors.Surface, // no tonal (green) tint on elevated surfaces
    inverseSurface = QabnahColors.Night,
    inverseOnSurface = QabnahColors.OnNight,
    outline = Color(0xFFCFC8B8),
    outlineVariant = QabnahColors.Line,
    error = QabnahColors.Danger,
    onError = Color.White,
    errorContainer = Color(0xFFFCE9DF),
    onErrorContainer = Color(0xFF7A2807),
    scrim = QabnahColors.Night,
    // Cards, sheets, bars and dialogs are white on the sand page (never beige on beige).
    surfaceBright = QabnahColors.Surface,
    surfaceDim = QabnahColors.SandDeep,
    surfaceContainerLowest = QabnahColors.Surface,
    surfaceContainerLow = QabnahColors.Surface,
    surfaceContainer = QabnahColors.Surface,
    surfaceContainerHigh = QabnahColors.Surface,
    surfaceContainerHighest = QabnahColors.Surface,
)

private val NightScheme = darkColorScheme(
    primary = QabnahColors.PrimaryOnNight,
    onPrimary = QabnahColors.Night,
    primaryContainer = QabnahColors.PrimaryDeep,
    onPrimaryContainer = QabnahColors.OnNight,
    inversePrimary = QabnahColors.Primary,
    secondary = QabnahColors.Saffron,
    onSecondary = QabnahColors.Ink,
    secondaryContainer = Color(0xFF3A2E0B),
    onSecondaryContainer = QabnahColors.SaffronSoft,
    tertiary = QabnahColors.Saffron,
    onTertiary = QabnahColors.Ink,
    tertiaryContainer = Color(0xFF3A2E0B),
    onTertiaryContainer = QabnahColors.SaffronSoft,
    background = QabnahColors.Night,
    onBackground = QabnahColors.OnNight,
    surface = QabnahColors.Night2,
    onSurface = QabnahColors.OnNight,
    surfaceVariant = QabnahColors.NightLine,
    onSurfaceVariant = QabnahColors.OnNightMuted,
    surfaceTint = QabnahColors.Night2,
    inverseSurface = QabnahColors.Sand,
    inverseOnSurface = QabnahColors.Ink,
    outline = Color(0xFF3C6259),
    outlineVariant = QabnahColors.NightLine,
    error = Color(0xFFFF9466),
    onError = QabnahColors.Night,
    errorContainer = Color(0xFF4A1D0A),
    onErrorContainer = Color(0xFFFFD2BF),
    scrim = Color.Black,
    surfaceBright = QabnahColors.NightLine,
    surfaceDim = QabnahColors.Night,
    surfaceContainerLowest = QabnahColors.Night,
    surfaceContainerLow = QabnahColors.Night2,
    surfaceContainer = QabnahColors.Night2,
    surfaceContainerHigh = QabnahColors.Night2,
    surfaceContainerHighest = QabnahColors.Night2,
)

/** Radius tokens: 10 inputs/chips · 16 cards/images · 24 sheets/hero media. */
val QabnahShapes = Shapes(
    extraSmall = RoundedCornerShape(10.dp), // text fields, menus
    small = RoundedCornerShape(10.dp),      // chips
    medium = RoundedCornerShape(16.dp),     // cards, images
    large = RoundedCornerShape(24.dp),      // sheets, hero media
    extraLarge = RoundedCornerShape(24.dp), // bottom sheets, dialogs
)

/** Button radius from the spec (12). M3 buttons are pills by default, so the Q buttons pass this explicitly. */
val QabnahButtonShape = RoundedCornerShape(12.dp)

/** IBM Plex Sans Arabic (also carries the Latin glyphs used inside Arabic text, e.g. plate numbers). */
val PlexArabic = FontFamily(
    Font(R.font.ibm_plex_sans_arabic_regular, FontWeight.Normal),
    Font(R.font.ibm_plex_sans_arabic_medium, FontWeight.Medium),
    Font(R.font.ibm_plex_sans_arabic_semibold, FontWeight.SemiBold),
    Font(R.font.ibm_plex_sans_arabic_bold, FontWeight.Bold),
)

/** IBM Plex Sans for the English experience. */
val PlexLatin = FontFamily(
    Font(R.font.ibm_plex_sans_regular, FontWeight.Normal),
    Font(R.font.ibm_plex_sans_medium, FontWeight.Medium),
    Font(R.font.ibm_plex_sans_semibold, FontWeight.SemiBold),
    Font(R.font.ibm_plex_sans_bold, FontWeight.Bold),
)

/**
 * Type scale (sp / line height): display 44/52 · h1 30/38 · h2 22/30 · h3 17/26 · body 15/24 · small 13/20 · micro 11/16.
 * Arabic gets taller lines (body ≈ 1.7×) because Plex Arabic has deeper ascenders/descenders.
 */
fun qabnahTypography(arabic: Boolean): Typography {
    val family = if (arabic) PlexArabic else PlexLatin
    fun style(size: Int, line: Int, weight: FontWeight, tracking: Float = 0f) = TextStyle(
        fontFamily = family,
        fontWeight = weight,
        fontSize = size.sp,
        lineHeight = (if (arabic) line * 1.1f else line.toFloat()).sp,
        letterSpacing = if (arabic) 0.em else tracking.em, // never track Arabic: it breaks the joins
    )
    return Typography(
        displayLarge = style(44, 52, FontWeight.Bold, -0.01f),
        displayMedium = style(38, 46, FontWeight.Bold, -0.01f),
        displaySmall = style(34, 42, FontWeight.Bold, -0.01f),
        headlineLarge = style(30, 38, FontWeight.Bold),
        headlineMedium = style(26, 34, FontWeight.Bold),
        headlineSmall = style(22, 30, FontWeight.SemiBold),
        titleLarge = style(20, 28, FontWeight.SemiBold),
        titleMedium = style(17, 26, FontWeight.SemiBold),
        titleSmall = style(15, 22, FontWeight.SemiBold),
        bodyLarge = style(16, 26, FontWeight.Normal),
        bodyMedium = style(15, 24, FontWeight.Normal),
        bodySmall = style(13, 20, FontWeight.Normal),
        labelLarge = style(15, 22, FontWeight.SemiBold),
        labelMedium = style(13, 18, FontWeight.Medium),
        labelSmall = style(11, 16, FontWeight.Medium, 0.04f),
    )
}

/**
 * App theme. [palette] is fixed per app (consumer: sand, captain: night) rather than following the system dark mode:
 * the captain app is dark by design so it stays readable outdoors and at night.
 */
@Composable
fun QabnahTheme(palette: QabnahPalette = QabnahPalette.SAND, content: @Composable () -> Unit) {
    val arabic = isArabic()
    val typography = remember(arabic) { qabnahTypography(arabic) }
    CompositionLocalProvider(LocalQabnahPalette provides palette) {
        MaterialTheme(
            colorScheme = if (palette == QabnahPalette.NIGHT) NightScheme else SandScheme,
            shapes = QabnahShapes,
            typography = typography,
            content = content,
        )
    }
}

/** Parses a merchant `brandColor`, falling back to the Qabnah primary. */
fun brandColorOrDefault(hex: String?): Color = BrandColors.parse(hex)?.let { Color(it) } ?: QabnahColors.Primary

fun contentColorFor(brand: Color): Color =
    if (BrandColors.prefersLightContent(brand.toArgbInt())) Color.White else QabnahColors.Ink

private fun Color.toArgbInt(): Int =
    ((alpha * 255).toInt() shl 24) or ((red * 255).toInt() shl 16) or ((green * 255).toInt() shl 8) or (blue * 255).toInt()

/** A status/brand colour adjusted so it stays legible as text on the current palette. */
@Composable
@ReadOnlyComposable
fun Color.readableOnSurface(): Color = if (isNightPalette) lerp(this, Color.White, 0.45f) else this

/** Re-tints the current scheme with a merchant's brand colour (used on that merchant's storefront). */
@Composable
fun MerchantBrandTheme(brandHex: String?, content: @Composable () -> Unit) {
    val brand = brandColorOrDefault(brandHex)
    val base: ColorScheme = MaterialTheme.colorScheme
    MaterialTheme(
        colorScheme = base.copy(primary = brand, onPrimary = contentColorFor(brand)),
        shapes = MaterialTheme.shapes,
        typography = MaterialTheme.typography,
        content = content,
    )
}
