package om.qabnah.android.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import coil.compose.AsyncImage
import om.qabnah.android.locale.isArabic
import om.qabnah.android.ui.theme.QabnahButtonShape
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.android.ui.theme.isNightPalette
import om.qabnah.android.ui.theme.readableOnSurface
import om.qabnah.core.money.Money
import kotlin.math.abs

// ───────────────────────── Elevation ─────────────────────────

/**
 * The two elevation levels of the design system as soft ink-tinted shadows. On night surfaces there are no shadows:
 * raised surfaces are separated by a `night-line` hairline instead.
 */
@Composable
fun Modifier.qElevation(level: Int, shape: Shape = MaterialTheme.shapes.medium): Modifier =
    if (isNightPalette) {
        border(1.dp, QabnahColors.NightLine, shape)
    } else {
        shadow(
            elevation = if (level >= 2) 18.dp else 6.dp,
            shape = shape,
            clip = false,
            ambientColor = QabnahColors.Ink.copy(alpha = if (level >= 2) 0.16f else 0.08f),
            spotColor = QabnahColors.Ink.copy(alpha = if (level >= 2) 0.20f else 0.10f),
        )
    }

/** Card: surface, radius 16, elevation 1, 16 dp padding, no border (hairline on night). Never nest cards. */
@Composable
fun QCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    padding: PaddingValues = PaddingValues(16.dp),
    containerColor: Color = MaterialTheme.colorScheme.surface,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = MaterialTheme.shapes.medium
    Surface(
        color = containerColor,
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = shape,
        modifier = modifier
            .qElevation(1, shape)
            .clip(shape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
    ) {
        Column(Modifier.padding(padding), content = content)
    }
}

// ───────────────────────── Buttons ─────────────────────────

/**
 * Primary button: radius 12, height 48 (44 [compact]). Brand fill with white text on sand; **saffron fill with ink text**
 * on night surfaces ([saffron], default in the captain app and inside night bars).
 */
@Composable
fun QButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    icon: ImageVector? = null,
    compact: Boolean = false,
    saffron: Boolean = isNightPalette,
) {
    QButton(onClick, modifier, enabled, loading, compact, saffron) {
        if (icon != null) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(text, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Slot variant of [QButton] (e.g. label + [QPrice] on a sticky bar). */
@Composable
fun QButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    compact: Boolean = false,
    saffron: Boolean = isNightPalette,
    content: @Composable RowScope.() -> Unit,
) {
    val night = isNightPalette
    val colors = if (saffron) {
        ButtonDefaults.buttonColors(
            containerColor = QabnahColors.Saffron,
            contentColor = QabnahColors.Ink,
            disabledContainerColor = if (night) QabnahColors.NightLine else QabnahColors.SandDeep,
            disabledContentColor = if (night) QabnahColors.OnNightMuted else QabnahColors.Muted,
        )
    } else {
        ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
        )
    }
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        shape = QabnahButtonShape,
        colors = colors,
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 0.dp),
        modifier = modifier.heightIn(min = if (compact) 44.dp else 48.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = LocalContentColor.current)
        } else {
            content()
        }
    }
}

/** Secondary button: surface fill, 1 dp hairline, ink text. [danger] renders the destructive variant (danger text). */
@Composable
fun QSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    compact: Boolean = false,
    danger: Boolean = false,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        shape = QabnahButtonShape,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = MaterialTheme.colorScheme.surface,
            contentColor = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        ),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 0.dp),
        modifier = modifier.heightIn(min = if (compact) 44.dp else 48.dp),
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(text, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Tertiary button: text only, primary colour (or danger). */
@Composable
fun QTextButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, danger: Boolean = false) {
    TextButton(
        onClick = onClick,
        enabled = enabled,
        shape = QabnahButtonShape,
        colors = ButtonDefaults.textButtonColors(contentColor = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary),
        modifier = modifier.heightIn(min = 44.dp),
    ) { Text(text) }
}

/** Circular icon button (e.g. the 36 dp "add" button of a product row, in the store's brand colour). */
@Composable
fun QCircleIconButton(
    icon: ImageVector,
    contentDescription: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 36.dp,
    enabled: Boolean = true,
    containerColor: Color = MaterialTheme.colorScheme.primary,
    contentColor: Color = MaterialTheme.colorScheme.onPrimary,
) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = CircleShape,
        color = if (enabled) containerColor else MaterialTheme.colorScheme.surfaceVariant,
        contentColor = if (enabled) contentColor else MaterialTheme.colorScheme.onSurfaceVariant,
        // 44 dp touch target around the visual circle is provided by Surface's minimum interactive size.
        modifier = modifier.size(size),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = contentDescription, modifier = Modifier.size(size * 0.55f))
        }
    }
}

/** − value + stepper. */
@Composable
fun QStepper(
    value: String,
    onDecrease: () -> Unit,
    onIncrease: () -> Unit,
    decreaseDescription: String,
    increaseDescription: String,
    modifier: Modifier = Modifier,
    decreaseEnabled: Boolean = true,
    increaseEnabled: Boolean = true,
) {
    Row(
        modifier
            .clip(QabnahButtonShape)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, QabnahButtonShape)
            .background(MaterialTheme.colorScheme.surface)
            .height(44.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(44.dp).clickable(enabled = decreaseEnabled, role = Role.Button, onClick = onDecrease),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Remove,
                contentDescription = decreaseDescription,
                tint = if (decreaseEnabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline,
                modifier = Modifier.size(20.dp),
            )
        }
        Text(value, style = MaterialTheme.typography.titleMedium.tabular(), modifier = Modifier.padding(horizontal = 6.dp))
        Box(
            Modifier.size(44.dp).clickable(enabled = increaseEnabled, role = Role.Button, onClick = onIncrease),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Add,
                contentDescription = increaseDescription,
                tint = if (increaseEnabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

// ───────────────────────── Photo ─────────────────────────

/** The storefront cover scrim: `linear-gradient(to top, rgba(6,26,22,.85), rgba(6,26,22,0) 60%)`. */
fun Modifier.coverScrim(): Modifier = drawWithContent {
    drawContent()
    drawRect(
        Brush.verticalGradient(
            0f to Color.Transparent,
            0.4f to Color.Transparent,
            1f to QabnahColors.Night.copy(alpha = 0.85f),
        ),
    )
}

/** Moving highlight for skeletons and loading photos. Stops automatically when the system disables animations. */
fun Modifier.shimmer(highlight: Color, base: Color = Color.Transparent): Modifier = composed {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val x by transition.animateFloat(
        initialValue = -1f,
        targetValue = 2f,
        animationSpec = infiniteRepeatable(tween(1300, easing = LinearEasing), RepeatMode.Restart),
        label = "shimmer-x",
    )
    drawWithContent {
        drawContent()
        val w = size.width
        drawRect(
            Brush.linearGradient(
                colors = listOf(base, highlight, base),
                start = Offset(w * x, 0f),
                end = Offset(w * (x + 0.6f), size.height),
            ),
        )
    }
}

/**
 * Photo-first image. While loading it shimmers; with no image (or a failed load) it shows the **branded placeholder**:
 * a `night-2 → primary-deep` diagonal gradient (tinted with [tint], the merchant's brand colour, on storefronts) with an
 * outlined [glyph] in 40% white. Never a grey box or a letter.
 * [scrim] adds the cover gradient so white text can sit on the photo; [overlay] is drawn above it.
 */
@Composable
fun QPhoto(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    shape: Shape = MaterialTheme.shapes.medium,
    glyph: ImageVector = Icons.Outlined.Image,
    tint: Color? = null,
    scrim: Boolean = false,
    overlay: @Composable BoxScope.() -> Unit = {},
) {
    // 0 = loading, 1 = loaded, 2 = failed
    var state by remember(url) { mutableIntStateOf(0) }
    val hasUrl = !url.isNullOrBlank()
    val imageAlpha by animateFloatAsState(if (state == 1) 1f else 0f, tween(220), label = "photo-alpha")
    val end = tint?.let { lerp(it, QabnahColors.Night2, 0.25f) } ?: QabnahColors.PrimaryDeep
    Box(
        modifier
            .clip(shape)
            .background(Brush.linearGradient(listOf(QabnahColors.Night2, end)))
            .then(if (contentDescription != null && state != 1) Modifier.semantics { this.contentDescription = contentDescription } else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        if (state != 1) {
            Icon(
                glyph,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.4f),
                modifier = Modifier.fillMaxSize(0.38f),
            )
        }
        if (hasUrl && state != 2) {
            AsyncImage(
                model = url,
                contentDescription = contentDescription,
                contentScale = ContentScale.Crop,
                onSuccess = { state = 1 },
                onError = { state = 2 },
                modifier = Modifier.fillMaxSize().graphicsLayer { alpha = imageAlpha },
            )
            if (state == 0) Box(Modifier.fillMaxSize().shimmer(Color.White.copy(alpha = 0.10f)))
        }
        if (scrim) Box(Modifier.fillMaxSize().coverScrim())
        overlay()
    }
}

/**
 * Store logo: rounded square (radius 14) with a 2 dp white ring. No logo → the merchant's initial in white on their
 * brand colour (the only allowed letter avatar).
 */
@Composable
fun QStoreLogo(logoUrl: String?, name: String, brand: Color, modifier: Modifier = Modifier, size: Dp = 56.dp) {
    val shape = RoundedCornerShape(size * 0.25f)
    Box(
        modifier
            .size(size)
            .shadow(4.dp, shape, clip = false, ambientColor = QabnahColors.Ink.copy(alpha = 0.10f), spotColor = QabnahColors.Ink.copy(alpha = 0.14f))
            .clip(shape)
            .background(Color.White)
            .padding(2.dp)
            .clip(RoundedCornerShape(size * 0.25f - 2.dp))
            .background(brand),
        contentAlignment = Alignment.Center,
    ) {
        var failed by remember(logoUrl) { androidx.compose.runtime.mutableStateOf(false) }
        if (!logoUrl.isNullOrBlank() && !failed) {
            AsyncImage(
                model = logoUrl,
                contentDescription = name,
                contentScale = ContentScale.Crop,
                onError = { failed = true },
                modifier = Modifier.fillMaxSize().background(Color.White),
            )
        } else {
            val initial = name.trim().firstOrNull()?.uppercase().orEmpty()
            Text(
                initial,
                color = om.qabnah.android.ui.theme.contentColorFor(brand),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.clearAndSetSemantics { contentDescription = name },
            )
        }
    }
}

// ───────────────────────── Price ─────────────────────────

/** Tabular numerals so prices and counters don't jitter. */
fun TextStyle.tabular(): TextStyle = copy(fontFeatureSettings = "tnum")

/**
 * A price as rich text: amount in the reader's digits, currency label (`ر.ع.` / `OMR`) at 0.75× size, weight 500.
 * English: `OMR 2.500`; Arabic: `٢٫٥٠٠ ر.ع.`.
 */
@Composable
@ReadOnlyComposable
fun priceText(baisa: Long, currencyColor: Color = Color.Unspecified): AnnotatedString {
    val arabic = isArabic()
    val sign = if (baisa < 0) "-" else ""
    val amount = Money.amount(abs(baisa), arabic)
    val currency = SpanStyle(fontSize = 0.75.em, fontWeight = FontWeight.Medium, color = currencyColor)
    return buildAnnotatedString {
        if (arabic) {
            append(sign + amount)
            append(' ')
            withStyle(currency) { append(Money.AR_CURRENCY) }
        } else {
            append(sign)
            withStyle(currency) { append("OMR") }
            append(' ')
            append(amount)
        }
    }
}

/** Price: tabular numerals, weight 700; muted currency label. [strikethrough] for a compare-at price. */
@Composable
fun QPrice(
    baisa: Long,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.titleMedium,
    color: Color = Color.Unspecified,
    currencyColor: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    strikethrough: Boolean = false,
) {
    Text(
        priceText(baisa, currencyColor),
        modifier = modifier,
        color = color,
        maxLines = 1,
        style = style.tabular().copy(
            fontWeight = if (strikethrough) FontWeight.Medium else FontWeight.Bold,
            textDecoration = if (strikethrough) TextDecoration.LineThrough else null,
        ),
    )
}

// ───────────────────────── Status ─────────────────────────

/**
 * Status pill with a 6 dp dot. [color] is one of the status colours (success / warning / danger / info) or a brand
 * colour for neutral states. [onPhoto] renders it on a white pill so it reads on top of a cover photo.
 */
@Composable
fun StatusPill(text: String, color: Color, modifier: Modifier = Modifier, onPhoto: Boolean = false) {
    val fg = if (onPhoto) color else color.readableOnSurface()
    Row(
        modifier
            .clip(CircleShape)
            .background(if (onPhoto) Color.White else fg.copy(alpha = if (isNightPalette) 0.18f else 0.12f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(fg))
        Spacer(Modifier.width(6.dp))
        Text(text, style = MaterialTheme.typography.labelMedium, color = if (onPhoto) QabnahColors.Ink else fg, maxLines = 1)
    }
}

// ───────────────────────── Skeletons ─────────────────────────

/** A shimmering block that stands in for content while it loads (no spinners on full pages). */
@Composable
fun SkeletonBox(modifier: Modifier = Modifier, shape: Shape = MaterialTheme.shapes.small) {
    val night = isNightPalette
    Box(
        modifier
            .clip(shape)
            .background(if (night) QabnahColors.NightLine.copy(alpha = 0.7f) else QabnahColors.SandDeep)
            .shimmer(if (night) Color.White.copy(alpha = 0.06f) else Color.White.copy(alpha = 0.7f)),
    )
}

/** Generic list skeleton: a photo block and two text lines per row. */
@Composable
fun SkeletonList(modifier: Modifier = Modifier, rows: Int = 6) {
    Column(modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        repeat(rows) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SkeletonBox(Modifier.size(width = 96.dp, height = 72.dp), MaterialTheme.shapes.medium)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    SkeletonBox(Modifier.fillMaxWidth(0.7f).height(16.dp))
                    SkeletonBox(Modifier.fillMaxWidth(0.45f).height(12.dp))
                }
            }
        }
    }
}

/** Skeleton of a store card (16:9 cover + two lines), used on the consumer home. */
@Composable
fun SkeletonCoverCard(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SkeletonBox(Modifier.fillMaxWidth().height(180.dp), MaterialTheme.shapes.medium)
        SkeletonBox(Modifier.fillMaxWidth(0.6f).height(18.dp))
        SkeletonBox(Modifier.fillMaxWidth(0.4f).height(12.dp))
    }
}

// ───────────────────────── Sheets and bars ─────────────────────────

/** Modal bottom sheet: radius 24, surface colour, small handle. */
@Composable
fun QBottomSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    skipPartiallyExpanded: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = skipPartiallyExpanded),
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        containerColor = MaterialTheme.colorScheme.surface,
        contentColor = MaterialTheme.colorScheme.onSurface,
        tonalElevation = 0.dp,
        dragHandle = { QSheetHandle() },
        modifier = modifier,
        content = content,
    )
}

@Composable
fun QSheetHandle(modifier: Modifier = Modifier) {
    Box(
        modifier
            .padding(top = 10.dp, bottom = 6.dp)
            .size(width = 36.dp, height = 4.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.outlineVariant),
    )
}

/** A persistent sheet docked to the bottom of a map (tracking, captain home): radius 24 on top, elevation 2. */
@Composable
fun QDockedSheet(modifier: Modifier = Modifier, navigationBarInset: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
    Surface(
        color = MaterialTheme.colorScheme.surface,
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = shape,
        modifier = modifier.fillMaxWidth().qElevation(2, shape),
    ) {
        // [navigationBarInset] = false when the sheet sits above a bottom tab bar that already handles the inset.
        Column(if (navigationBarInset) Modifier.navigationBarsPadding() else Modifier, horizontalAlignment = Alignment.CenterHorizontally) {
            QSheetHandle()
            Column(Modifier.fillMaxWidth(), content = content)
        }
    }
}

/**
 * The one "night" surface of a sand screen: a floating bar (radius 16, elevation 2) that carries the saffron CTA,
 * e.g. the cart bar. Content colour is the on-night text colour.
 */
@Composable
fun QNightBar(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable RowScope.() -> Unit) {
    val shape = MaterialTheme.shapes.medium
    Surface(
        color = QabnahColors.Night,
        contentColor = QabnahColors.OnNight,
        shape = shape,
        modifier = modifier
            .shadow(18.dp, shape, clip = false, ambientColor = QabnahColors.Ink.copy(alpha = 0.16f), spotColor = QabnahColors.Ink.copy(alpha = 0.24f))
            .clip(shape)
            .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier),
    ) {
        Row(Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically, content = content)
    }
}

/** Full-width sticky CTA area at the bottom of a screen: surface, top hairline, safe-area padding. */
@Composable
fun QBottomActionBar(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface, contentColor = MaterialTheme.colorScheme.onSurface, modifier = modifier.fillMaxWidth()) {
        Column {
            HorizontalDivider()
            Column(Modifier.navigationBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp), content = content)
        }
    }
}

// ───────────────────────── Navigation ─────────────────────────

data class QNavItem(val route: String, val label: String, val icon: ImageVector, val selectedIcon: ImageVector = icon)

/**
 * Bottom tab bar: surface with a top hairline; the active tab uses the brand colour (on-night text in the captain app)
 * and is marked with a saffron dot.
 */
@Composable
fun QNavigationBar(items: List<QNavItem>, selectedRoute: String?, onSelect: (QNavItem) -> Unit, modifier: Modifier = Modifier) {
    val night = isNightPalette
    Surface(color = MaterialTheme.colorScheme.surface, contentColor = MaterialTheme.colorScheme.onSurface, modifier = modifier.fillMaxWidth()) {
        Column {
            HorizontalDivider()
            Row(Modifier.fillMaxWidth().navigationBarsPadding().height(64.dp), verticalAlignment = Alignment.CenterVertically) {
                items.forEach { item ->
                    val selected = item.route == selectedRoute
                    val color = when {
                        !selected -> MaterialTheme.colorScheme.onSurfaceVariant
                        night -> QabnahColors.OnNight
                        else -> QabnahColors.Primary
                    }
                    Column(
                        Modifier
                            .weight(1f)
                            .height(64.dp)
                            .selectable(selected = selected, role = Role.Tab, onClick = { onSelect(item) }),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Icon(if (selected) item.selectedIcon else item.icon, contentDescription = null, tint = color, modifier = Modifier.size(24.dp))
                        Spacer(Modifier.height(2.dp))
                        Text(
                            item.label,
                            color = color,
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium),
                            maxLines = 1,
                        )
                        Spacer(Modifier.height(3.dp))
                        Box(Modifier.size(4.dp).clip(CircleShape).background(if (selected) QabnahColors.Saffron else Color.Transparent))
                    }
                }
            }
        }
    }
}

/** Large title header of a tab screen (h1 30/38) with an optional trailing slot. */
@Composable
fun QLargeTitle(title: String, modifier: Modifier = Modifier, subtitle: String? = null, trailing: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 12.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.headlineLarge)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        trailing?.invoke()
    }
}

// ───────────────────────── Selection ─────────────────────────

/** Segmented control (period selectors, Active/Past): one selected segment on a tinted track, radius 10. */
@Composable
fun QSegmentedControl(options: List<String>, selectedIndex: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val night = isNightPalette
    val track = if (night) QabnahColors.Night2 else QabnahColors.SandDeep
    Row(
        modifier
            .clip(MaterialTheme.shapes.small)
            .background(track)
            .then(if (night) Modifier.border(1.dp, QabnahColors.NightLine, MaterialTheme.shapes.small) else Modifier)
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        options.forEachIndexed { i, label ->
            val selected = i == selectedIndex
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 40.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(
                        when {
                            !selected -> Color.Transparent
                            night -> QabnahColors.NightLine
                            else -> QabnahColors.Surface
                        },
                    )
                    .selectable(selected = selected, role = Role.Tab, onClick = { onSelect(i) })
                    .padding(horizontal = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium),
                    color = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** Step progress for wizards and the active delivery: [current] is 0-based; done = brand, current = saffron. */
@Composable
fun QStepProgress(steps: Int, current: Int, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        repeat(steps) { i ->
            Box(
                Modifier
                    .weight(1f)
                    .height(4.dp)
                    .clip(CircleShape)
                    .background(
                        when {
                            i < current -> if (isNightPalette) QabnahColors.PrimaryOnNight else QabnahColors.Primary
                            i == current -> QabnahColors.Saffron
                            else -> MaterialTheme.colorScheme.outlineVariant
                        },
                    ),
            )
        }
    }
}

/** A selectable option row inside a card or sheet (address, payment method, option): radio/check on the trailing side. */
@Composable
fun QOptionRow(
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    role: Role = Role.RadioButton,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = MaterialTheme.shapes.small
    val border = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
    Row(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .border(if (selected) 1.5.dp else 1.dp, border, shape)
            .background(if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.06f) else MaterialTheme.colorScheme.surface)
            .selectable(selected = selected, enabled = enabled, role = role, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leading != null) {
            leading()
            Spacer(Modifier.width(12.dp))
        }
        Column(Modifier.weight(1f), content = content)
        if (trailing != null) {
            Spacer(Modifier.width(12.dp))
            trailing()
        }
    }
}
