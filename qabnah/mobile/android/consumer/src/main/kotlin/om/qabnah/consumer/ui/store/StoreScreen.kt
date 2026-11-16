package om.qabnah.consumer.ui.store

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import om.qabnah.android.ui.components.ConfirmDialog
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.loc
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.theme.MerchantBrandTheme
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.core.model.Product
import om.qabnah.core.model.Storefront

@Composable
fun StoreScreen(container: ConsumerContainer, slug: String, onBack: () -> Unit, onOpenCart: () -> Unit) {
    val vm: StoreViewModel = viewModel { StoreViewModel(container.stores, container.cart, slug) }
    val state by vm.state.collectAsStateWithLifecycle()
    val sheet by vm.sheet.collectAsStateWithLifecycle()
    val replace by vm.replacePrompt.collectAsStateWithLifecycle()
    val cart by vm.cart.collectAsStateWithLifecycle()
    val merchant = state.data?.merchant

    MerchantBrandTheme(merchant?.brandColor) {
        ScreenScaffold(
            title = merchant?.let { loc(it.nameEn, it.nameAr) } ?: "",
            onBack = onBack,
            bottomBar = {
                if (!cart.isEmpty && cart.merchant?.id == merchant?.id) {
                    Button(
                        onClick = onOpenCart,
                        modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp).height(52.dp),
                    ) {
                        Text(stringResource(R.string.cart_view, digits(cart.itemCount.toString()), money(cart.subtotalBaisa)))
                    }
                }
            },
        ) { padding ->
            LoadableContent(state = state, onRefresh = { vm.load(refresh = true) }, modifier = Modifier.padding(padding)) { sf ->
                StorefrontBody(sf, onProduct = vm::openProduct)
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

private sealed interface StoreRow {
    data class Header(val title: String, val index: Int) : StoreRow
    data class Item(val product: Product) : StoreRow
}

@Composable
private fun StorefrontBody(sf: Storefront, onProduct: (Product) -> Unit) {
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val sections = sf.categories.filter { it.isActive && it.products.isNotEmpty() }.sortedBy { it.sortOrder }
    val otherTitle = stringResource(R.string.store_other_items)
    val namedSections = sections.map { loc(it.nameEn, it.nameAr) to it.products.sortedBy { p -> p.sortOrder } } +
        (if (sf.uncategorized.isNotEmpty()) listOf(otherTitle to sf.uncategorized) else emptyList())
    // Rows after the 2 fixed header items (store header, banners).
    val rows = buildList {
        namedSections.forEachIndexed { i, (title, products) ->
            add(StoreRow.Header(title, i))
            products.forEach { add(StoreRow.Item(it)) }
        }
    }
    val headerIndexes = rows.withIndex().filter { it.value is StoreRow.Header }.map { it.index + 2 }

    Column(Modifier.fillMaxSize()) {
        if (namedSections.size > 1) {
            val firstVisible = listState.firstVisibleItemIndex
            val selected = headerIndexes.indexOfLast { it <= firstVisible }.coerceAtLeast(0)
            ScrollableTabRow(selectedTabIndex = selected, edgePadding = 8.dp) {
                namedSections.forEachIndexed { i, (title, _) ->
                    Tab(selected = selected == i, onClick = { scope.launch { listState.animateScrollToItem(headerIndexes[i]) } }, text = { Text(title) })
                }
            }
        }
        LazyColumn(state = listState, contentPadding = PaddingValues(bottom = 24.dp)) {
            item { StoreHeader(sf) }
            item { if (sf.banners.any { it.isActive }) BannerPager(sf) else Spacer(Modifier.height(0.dp)) }
            items(rows.size) { i ->
                when (val row = rows[i]) {
                    is StoreRow.Header -> Text(
                        row.title,
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 4.dp),
                    )
                    is StoreRow.Item -> {
                        ProductRow(row.product, onClick = { onProduct(row.product) })
                        HorizontalDivider(Modifier.padding(horizontal = 16.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun StoreHeader(sf: Storefront) {
    val m = sf.merchant
    Box(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(150.dp).background(MaterialTheme.colorScheme.primary)) {
            if (m.coverUrl != null) {
                AsyncImage(model = m.coverUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            }
        }
        Surface(
            shape = CircleShape,
            color = Color.White,
            shadowElevation = 4.dp,
            modifier = Modifier.padding(start = 16.dp, top = 110.dp).size(80.dp),
        ) {
            if (m.logoUrl != null) {
                AsyncImage(model = m.logoUrl, contentDescription = loc(m.nameEn, m.nameAr), contentScale = ContentScale.Crop, modifier = Modifier.clip(CircleShape))
            } else {
                Box(contentAlignment = Alignment.Center) { Icon(Icons.Filled.Storefront, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(40.dp)) }
            }
        }
    }
    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(loc(m.nameEn, m.nameAr), style = MaterialTheme.typography.headlineSmall)
        val tagline = loc(m.taglineEn, m.taglineAr)
        if (tagline.isNotBlank()) Text(tagline, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (m.isOpen) StatusPill(stringResource(R.string.store_open), QabnahColors.Success) else StatusPill(stringResource(R.string.store_closed), QabnahColors.Danger)
            if (m.ratingCount > 0) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Star, contentDescription = stringResource(R.string.store_rating), tint = QabnahColors.Accent, modifier = Modifier.size(16.dp))
                    Text(digits(String.format(java.util.Locale.US, "%.1f (%d)", m.ratingAvg, m.ratingCount)), style = MaterialTheme.typography.labelLarge)
                }
            }
            Text(stringResource(R.string.store_prep_minutes, digits(m.prepTimeMinutes.toString())), style = MaterialTheme.typography.labelMedium)
        }
        if (m.minOrderBaisa > 0) Text(stringResource(R.string.store_min_order, money(m.minOrderBaisa)), style = MaterialTheme.typography.labelMedium)
        m.addressText?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (!m.isOpen) {
            Spacer(Modifier.height(8.dp))
            Text(stringResource(R.string.store_closed_notice), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun BannerPager(sf: Storefront) {
    val banners = sf.banners.filter { it.isActive }.sortedBy { it.sortOrder }
    val pager = rememberPagerState { banners.size }
    Column {
        HorizontalPager(
            state = pager,
            contentPadding = PaddingValues(horizontal = 16.dp),
            pageSpacing = 8.dp,
            modifier = Modifier.fillMaxWidth().height(140.dp),
        ) { page ->
            val b = banners[page]
            Box(Modifier.fillMaxSize().clip(MaterialTheme.shapes.medium).background(MaterialTheme.colorScheme.primaryContainer)) {
                AsyncImage(model = b.imageUrl, contentDescription = loc(b.titleEn, b.titleAr).ifBlank { null }, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                val title = loc(b.titleEn, b.titleAr)
                if (title.isNotBlank()) {
                    Text(
                        title,
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.align(Alignment.BottomStart).background(Color.Black.copy(alpha = 0.35f)).padding(8.dp),
                    )
                }
            }
        }
        if (banners.size > 1) {
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.Center) {
                repeat(banners.size) { i ->
                    Box(
                        Modifier.padding(2.dp).size(6.dp).clip(CircleShape)
                            .background(if (pager.currentPage == i) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline),
                    )
                }
            }
        }
    }
}

@Composable
private fun ProductRow(p: Product, onClick: () -> Unit) {
    val enabled = p.isPurchasable
    Row(
        Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = onClick).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(loc(p.nameEn, p.nameAr), style = MaterialTheme.typography.titleMedium, color = if (enabled) Color.Unspecified else MaterialTheme.colorScheme.onSurfaceVariant)
            val desc = loc(p.descriptionEn, p.descriptionAr)
            if (desc.isNotBlank()) Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(money(p.basePriceBaisa), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                p.compareAtPriceBaisa?.takeIf { it > p.basePriceBaisa }?.let {
                    Spacer(Modifier.width(8.dp))
                    Text(money(it), style = MaterialTheme.typography.labelMedium, textDecoration = TextDecoration.LineThrough, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (!enabled) Text(stringResource(R.string.product_unavailable), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
        }
        if (p.imageUrl != null) {
            Spacer(Modifier.width(12.dp))
            AsyncImage(
                model = p.imageUrl,
                contentDescription = loc(p.nameEn, p.nameAr),
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(84.dp).clip(MaterialTheme.shapes.medium),
            )
        }
    }
}

