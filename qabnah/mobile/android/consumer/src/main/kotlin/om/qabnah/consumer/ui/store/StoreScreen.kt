package om.qabnah.consumer.ui.store

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Fastfood
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import om.qabnah.android.ui.components.ConfirmDialog
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.android.ui.components.QCircleIconButton
import om.qabnah.android.ui.components.QPhoto
import om.qabnah.android.ui.components.QPrice
import om.qabnah.android.ui.components.QStoreLogo
import om.qabnah.android.ui.components.SkeletonBox
import om.qabnah.android.ui.components.SkeletonList
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.loc
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.components.tabular
import om.qabnah.android.ui.theme.MerchantBrandTheme
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.android.ui.theme.brandColorOrDefault
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.consumer.ui.components.CartBar
import om.qabnah.consumer.ui.components.categoryGlyph
import om.qabnah.core.model.MerchantCategory
import om.qabnah.core.model.Product
import om.qabnah.core.model.Storefront

private val TopBarHeight = 56.dp
private val TabsHeight = 48.dp

/**
 * Storefront in the merchant's brand colour: full-bleed cover with scrim (name and status on it), a top bar that is
 * transparent over the cover and solid after scrolling, category tabs that pin under it, photo-led product rows and the
 * floating night cart bar.
 */
@Composable
fun StoreScreen(container: ConsumerContainer, slug: String, onBack: () -> Unit, onOpenCart: () -> Unit) {
    val vm: StoreViewModel = viewModel { StoreViewModel(container.stores, container.cart, slug) }
    val state by vm.state.collectAsStateWithLifecycle()
    val sheet by vm.sheet.collectAsStateWithLifecycle()
    val replace by vm.replacePrompt.collectAsStateWithLifecycle()
    val cart by vm.cart.collectAsStateWithLifecycle()
    val merchant = state.data?.merchant
    val showCart = !cart.isEmpty && cart.merchant?.id == merchant?.id

    MerchantBrandTheme(merchant?.brandColor) {
        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
            val listState = rememberLazyListState()
            LoadableContent(
                state = state,
                onRefresh = { vm.load(refresh = true) },
                loading = { StoreSkeleton() },
            ) { sf ->
                StorefrontBody(sf, listState, bottomPadding = if (showCart) 104.dp else 24.dp, onBack = onBack, onProduct = vm::openProduct)
            }
            if (state.data == null) {
                // Back stays reachable while loading or on error.
                Box(Modifier.statusBarsPadding().height(TopBarHeight).padding(start = 8.dp), contentAlignment = Alignment.CenterStart) {
                    BackCircle(onBack)
                }
            }
            if (showCart) {
                CartBar(
                    cart,
                    onClick = onOpenCart,
                    modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp),
                )
            }
        }
        sheet?.let { s ->
            ProductSheet(
                ui = s,
                onDismiss = vm::dismissProduct,
                onToggle = vm::toggleOption,
                onQuantity = vm::setQuantity,
                onNotes = vm::setNotes,
                onAdd = vm::addToCart,
            )
        }
        replace?.let { current ->
            ConfirmDialog(
                title = stringResource(R.string.cart_replace_title),
                text = stringResource(R.string.cart_replace_body, loc(current.nameEn, current.nameAr)),
                confirmLabel = stringResource(R.string.cart_replace_confirm),
                onConfirm = vm::confirmReplace,
                onDismiss = vm::cancelReplace,
            )
        }
    }
}

@Composable
private fun BackCircle(onBack: () -> Unit) {
    QCircleIconButton(
        Icons.AutoMirrored.Filled.ArrowBack,
        contentDescription = stringResource(om.qabnah.android.R.string.common_back),
        onClick = onBack,
        size = 40.dp,
        containerColor = Color.White,
        contentColor = QabnahColors.Ink,
    )
}

private sealed interface StoreRow {
    data class Header(val title: String) : StoreRow
    data class Item(val product: Product, val last: Boolean) : StoreRow
}

/** Fixed list items before the product rows: cover header, in-flow tabs, banners. */
private const val FIXED_ITEMS = 3

@Composable
private fun StorefrontBody(sf: Storefront, listState: LazyListState, bottomPadding: androidx.compose.ui.unit.Dp, onBack: () -> Unit, onProduct: (Product) -> Unit) {
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val statusBarPx = WindowInsets.statusBars.getTop(density)
    val topBarPx = statusBarPx + with(density) { TopBarHeight.roundToPx() }
    val tabsPx = with(density) { TabsHeight.roundToPx() }

    val otherTitle = stringResource(R.string.store_other_items)
    val sections = sf.categories.filter { it.isActive && it.products.isNotEmpty() }.sortedBy { it.sortOrder }
    val namedSections = sections.map { loc(it.nameEn, it.nameAr) to it.products.sortedBy { p -> p.sortOrder } } +
        (if (sf.uncategorized.isNotEmpty()) listOf(otherTitle to sf.uncategorized) else emptyList())
    val hasTabs = namedSections.size > 1
    val rows = remember(sf, otherTitle) {
        buildList {
            namedSections.forEach { (title, products) ->
                add(StoreRow.Header(title))
                products.forEachIndexed { i, p -> add(StoreRow.Item(p, last = i == products.lastIndex)) }
            }
        }
    }
    val headerIndexes = remember(rows) { rows.withIndex().filter { it.value is StoreRow.Header }.map { it.index + FIXED_ITEMS } }
    val overlayPx = topBarPx + if (hasTabs) tabsPx else 0

    // The top bar turns solid once the cover has scrolled under it; the tabs pin when their in-flow copy reaches the bar.
    val solidBar by remember(topBarPx) {
        derivedStateOf {
            val header = listState.layoutInfo.visibleItemsInfo.firstOrNull { it.index == 0 }
            if (header == null) {
                listState.firstVisibleItemIndex > 0
            } else {
                val coverPx = listState.layoutInfo.viewportSize.width * 3 / 4 // the cover is 4:3
                -header.offset >= coverPx - topBarPx
            }
        }
    }
    val tabsPinned by remember(topBarPx) {
        derivedStateOf {
            val inFlow = listState.layoutInfo.visibleItemsInfo.firstOrNull { it.index == 1 }
            if (inFlow != null) inFlow.offset <= topBarPx else listState.firstVisibleItemIndex > 1
        }
    }
    val selectedTab by remember(headerIndexes, overlayPx) {
        derivedStateOf {
            val current = listState.layoutInfo.visibleItemsInfo.lastOrNull { it.offset <= overlayPx + 8 }?.index ?: listState.firstVisibleItemIndex
            headerIndexes.indexOfLast { it <= current }.coerceAtLeast(0)
        }
    }
    val onTab: (Int) -> Unit = { i -> scope.launch { listState.animateScrollToItem(headerIndexes[i], scrollOffset = -overlayPx) } }
    val tabTitles = namedSections.map { it.first }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(state = listState, contentPadding = PaddingValues(bottom = bottomPadding), modifier = Modifier.fillMaxSize()) {
            item(key = "header") { StoreHeader(sf) }
            item(key = "tabs") {
                if (hasTabs) CategoryTabs(tabTitles, selectedTab, onTab) else Spacer(Modifier.height(0.dp))
            }
            item(key = "banners") {
                if (sf.banners.any { it.isActive }) BannerPager(sf) else Spacer(Modifier.height(0.dp))
            }
            itemsIndexed(rows) { _, row ->
                when (row) {
                    is StoreRow.Header -> Text(
                        row.title,
                        style = MaterialTheme.typography.headlineSmall,
                        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 4.dp),
                    )
                    is StoreRow.Item -> {
                        ProductRow(row.product, sf.merchant.category, onClick = { onProduct(row.product) })
                        if (!row.last) HorizontalDivider(Modifier.padding(horizontal = 16.dp))
                    }
                }
            }
        }

        // Overlay: top bar (transparent → solid) and the pinned copy of the tabs.
        val barAlpha by animateFloatAsState(if (solidBar) 1f else 0f, label = "store-bar")
        Column(Modifier.fillMaxWidth()) {
            Box(Modifier.fillMaxWidth()) {
                Surface(
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.matchParentSize().graphicsLayer { alpha = barAlpha },
                ) {}
                Row(
                    Modifier.statusBarsPadding().height(TopBarHeight).padding(horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    BackCircle(onBack)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        loc(sf.merchant.nameEn, sf.merchant.nameAr),
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f).graphicsLayer { alpha = barAlpha },
                    )
                }
            }
            if (hasTabs && tabsPinned) {
                CategoryTabs(tabTitles, selectedTab, onTab)
                HorizontalDivider()
            } else if (solidBar) {
                HorizontalDivider(Modifier.graphicsLayer { alpha = barAlpha })
            }
        }
    }
}

/** Horizontal category tabs: the selected one is an ink label on a brand underline. Used in-flow and pinned. */
@Composable
private fun CategoryTabs(titles: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    val rowState = rememberLazyListState()
    LaunchedEffect(selected) { rowState.animateScrollToItem(selected) }
    Surface(color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth().height(TabsHeight)) {
        LazyRow(state = rowState, contentPadding = PaddingValues(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            itemsIndexed(titles) { i, title ->
                val isSelected = i == selected
                Column(
                    Modifier
                        .height(TabsHeight)
                        .selectable(selected = isSelected, role = Role.Tab, onClick = { onSelect(i) })
                        .padding(horizontal = 12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        title,
                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium),
                        color = if (isSelected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                    Spacer(Modifier.height(6.dp))
                    Box(
                        Modifier
                            .size(width = 24.dp, height = 3.dp)
                            .clip(CircleShape)
                            .background(if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent),
                    )
                }
            }
        }
    }
}

@Composable
private fun StoreHeader(sf: Storefront) {
    val m = sf.merchant
    val name = loc(m.nameEn, m.nameAr)
    val brand = brandColorOrDefault(m.brandColor)
    Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface)) {
        Box {
            QPhoto(
                url = m.coverUrl,
                contentDescription = null,
                shape = androidx.compose.ui.graphics.RectangleShape,
                glyph = categoryGlyph(m.category),
                tint = brand,
                scrim = true,
                modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f),
            ) {
                Column(Modifier.align(Alignment.BottomStart).padding(start = 88.dp, end = 16.dp, bottom = 14.dp)) {
                    Text(name, style = MaterialTheme.typography.headlineSmall, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(6.dp))
                    StatusPill(
                        stringResource(if (m.isOpen) R.string.store_open else R.string.store_closed),
                        if (m.isOpen) QabnahColors.Success else QabnahColors.Danger,
                        onPhoto = true,
                    )
                }
            }
            QStoreLogo(m.logoUrl, name, brand, modifier = Modifier.align(Alignment.BottomStart).padding(start = 16.dp).offset(y = 20.dp))
        }
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 28.dp, bottom = 16.dp)) {
            val tagline = loc(m.taglineEn, m.taglineAr)
            if (tagline.isNotBlank()) Text(tagline, style = MaterialTheme.typography.bodyMedium)
            Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (m.ratingCount > 0) {
                    Icon(Icons.Filled.Star, contentDescription = stringResource(R.string.store_rating), tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(2.dp))
                    Text(
                        digits(String.format(java.util.Locale.US, "%.1f (%d)", m.ratingAvg, m.ratingCount)),
                        style = MaterialTheme.typography.labelMedium.tabular(),
                    )
                    Spacer(Modifier.width(10.dp))
                }
                val meta = buildList {
                    if (m.prepTimeMinutes > 0) add(stringResource(R.string.store_prep_minutes, digits(m.prepTimeMinutes.toString())))
                    if (m.minOrderBaisa > 0) add(stringResource(R.string.store_min_order, money(m.minOrderBaisa)))
                }
                Text(meta.joinToString("  ·  "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            m.addressText?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp))
            }
            if (!m.isOpen) {
                Text(
                    stringResource(R.string.store_closed_notice),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun BannerPager(sf: Storefront) {
    val banners = sf.banners.filter { it.isActive }.sortedBy { it.sortOrder }
    val pager = rememberPagerState { banners.size }
    Column(Modifier.padding(top = 16.dp)) {
        HorizontalPager(
            state = pager,
            contentPadding = PaddingValues(horizontal = 16.dp),
            pageSpacing = 10.dp,
            modifier = Modifier.fillMaxWidth(),
        ) { page ->
            val b = banners[page]
            val title = loc(b.titleEn, b.titleAr)
            QPhoto(
                url = b.imageUrl,
                contentDescription = title.ifBlank { null },
                shape = MaterialTheme.shapes.large,
                glyph = Icons.Outlined.Image,
                tint = MaterialTheme.colorScheme.primary,
                scrim = title.isNotBlank(),
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
            ) {
                if (title.isNotBlank()) {
                    Text(title, color = Color.White, style = MaterialTheme.typography.titleLarge, modifier = Modifier.align(Alignment.BottomStart).padding(16.dp))
                }
            }
        }
        if (banners.size > 1) {
            Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.Center) {
                repeat(banners.size) { i ->
                    val active = pager.currentPage == i
                    Box(
                        Modifier
                            .padding(horizontal = 3.dp)
                            .size(width = if (active) 18.dp else 6.dp, height = 6.dp)
                            .clip(CircleShape)
                            .background(if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                    )
                }
            }
        }
    }
}

/**
 * Product row: 4:3 photo on the leading side, title 15/600, one-line description, price row with a circular 36 dp add
 * button in the store's brand colour.
 */
@Composable
private fun ProductRow(p: Product, category: MerchantCategory, onClick: () -> Unit) {
    val enabled = p.isPurchasable
    val name = loc(p.nameEn, p.nameAr)
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .graphicsLayer { alpha = if (enabled) 1f else 0.55f },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        QPhoto(
            url = p.imageUrl,
            contentDescription = null,
            glyph = productGlyph(category),
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(width = 104.dp, height = 78.dp),
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(name, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val desc = loc(p.descriptionEn, p.descriptionAr)
            if (desc.isNotBlank()) {
                Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        QPrice(p.basePriceBaisa, style = MaterialTheme.typography.titleSmall)
                        p.compareAtPriceBaisa?.takeIf { it > p.basePriceBaisa }?.let {
                            Spacer(Modifier.width(8.dp))
                            QPrice(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, strikethrough = true)
                        }
                    }
                    if (!enabled) Text(stringResource(R.string.product_unavailable), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error)
                }
                if (enabled) {
                    QCircleIconButton(
                        Icons.Filled.Add,
                        contentDescription = stringResource(R.string.product_add_to_cart, name),
                        onClick = onClick,
                    )
                }
            }
        }
    }
}

/** Placeholder glyph for products of a store in [category]. */
fun productGlyph(category: MerchantCategory): ImageVector = when (category) {
    MerchantCategory.RESTAURANT, MerchantCategory.CAFE -> Icons.Outlined.Fastfood
    else -> categoryGlyph(category)
}

@Composable
private fun StoreSkeleton() {
    Column(Modifier.fillMaxSize()) {
        SkeletonBox(Modifier.fillMaxWidth().aspectRatio(4f / 3f), androidx.compose.ui.graphics.RectangleShape)
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SkeletonBox(Modifier.fillMaxWidth(0.6f).height(22.dp))
            SkeletonBox(Modifier.fillMaxWidth(0.4f).height(14.dp))
        }
        SkeletonList(rows = 4)
    }
}
