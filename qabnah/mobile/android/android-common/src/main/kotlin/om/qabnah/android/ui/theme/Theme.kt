package om.qabnah.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import om.qabnah.core.util.BrandColors

/** brand/tokens.json */
object QabnahColors {
    val Primary = Color(0xFF0E7C66)
    val PrimaryDark = Color(0xFF095C4C)
    val PrimaryLight = Color(0xFFE3F3EF)
    val Accent = Color(0xFFF4A300)
    val Ink = Color(0xFF0B1F1C)
    val Muted = Color(0xFF5B6B68)
    val Sand = Color(0xFFFBF7EF)
    val Surface = Color(0xFFFFFFFF)
    val Border = Color(0xFFE4E1D8)
    val Danger = Color(0xFFC2410C)
    val Success = Color(0xFF15803D)
    val Info = Color(0xFF1D4ED8)
}

private val LightColors = lightColorScheme(
    primary = QabnahColors.Primary,
    onPrimary = Color.White,
    primaryContainer = QabnahColors.PrimaryLight,
    onPrimaryContainer = QabnahColors.PrimaryDark,
    secondary = QabnahColors.Accent,
    onSecondary = QabnahColors.Ink,
    secondaryContainer = Color(0xFFFFEDC2),
    onSecondaryContainer = QabnahColors.Ink,
    tertiary = QabnahColors.Info,
    background = QabnahColors.Sand,
    onBackground = QabnahColors.Ink,
    surface = QabnahColors.Surface,
    onSurface = QabnahColors.Ink,
    surfaceVariant = Color(0xFFF3EFE6),
    onSurfaceVariant = QabnahColors.Muted,
    outline = QabnahColors.Border,
    outlineVariant = QabnahColors.Border,
    error = QabnahColors.Danger,
    onError = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF5BC2A9),
    onPrimary = Color(0xFF00382D),
    primaryContainer = QabnahColors.PrimaryDark,
    onPrimaryContainer = QabnahColors.PrimaryLight,
    secondary = QabnahColors.Accent,
    onSecondary = QabnahColors.Ink,
    background = Color(0xFF0B1F1C),
    onBackground = Color(0xFFE8EFEC),
    surface = Color(0xFF12302A),
    onSurface = Color(0xFFE8EFEC),
    surfaceVariant = Color(0xFF1B3A34),
    onSurfaceVariant = Color(0xFFB6C6C1),
    outline = Color(0xFF3A5650),
    error = Color(0xFFFF8A5B),
)

/** tokens.json radius sm 8 / md 12 / lg 20 */
val QabnahShapes = Shapes(
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(20.dp),
)

@Composable
fun QabnahTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        shapes = QabnahShapes,
        content = content,
    )
}

/** Parses a merchant `brandColor`, falling back to the Qabnah primary. */
fun brandColorOrDefault(hex: String?): Color = BrandColors.parse(hex)?.let { Color(it) } ?: QabnahColors.Primary

fun contentColorFor(brand: Color): Color =
    if (BrandColors.prefersLightContent(brand.toArgbInt())) Color.White else QabnahColors.Ink

private fun Color.toArgbInt(): Int =
    ((alpha * 255).toInt() shl 24) or ((red * 255).toInt() shl 16) or ((green * 255).toInt() shl 8) or (blue * 255).toInt()

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
