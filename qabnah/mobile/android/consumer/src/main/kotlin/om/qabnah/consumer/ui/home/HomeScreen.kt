package om.qabnah.consumer.ui.home

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.LocationOff
import androidx.compose.material.icons.outlined.NearMe
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.location.hasLocationPermission
import om.qabnah.android.ui.components.EmptyState
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.android.ui.components.QCard
import om.qabnah.android.ui.components.QPhoto
import om.qabnah.android.ui.components.QStoreLogo
import om.qabnah.android.ui.components.SkeletonBox
import om.qabnah.android.ui.components.SkeletonCoverCard
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.distance
import om.qabnah.android.ui.components.loc
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.components.tabular
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.android.ui.theme.brandColorOrDefault
import om.qabnah.android.util.Intents
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.consumer.ui.components.CartBar
import om.qabnah.consumer.ui.components.categoryGlyph
import om.qabnah.core.model.MerchantCategory
import om.qabnah.core.model.MerchantSummary

/**
 * Photo-led home: location pill → large title → search → hero carousel of open stores → category chips with photos →
 * store cards (16:9 cover, logo chip, open pill, meta row). A floating night cart bar appears once the cart has items.
 */
@Composable
fun HomeScreen(container: ConsumerContainer, onOpenStore: (String) -> Unit, onOpenCart: () -> Unit) {
    val vm: HomeViewModel = viewModel { HomeViewModel(container.stores, container.services.location) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val cart by container.cart.cart.collectAsStateWithLifecycle()
    val context = LocalContext.current

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        vm.onLocationPermissionResult(grants.values.any { it })
    }
    LaunchedEffect(Unit) {
        if (!ui.locationResolved) {
            if (hasLocationPermission(context)) vm.onLocationPermissionResult(true)
            else permissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            LocationPill(ui, onOpenSettings = { Intents.openAppSettings(context) })
            LoadableContent(
                state = ui.stores,
                onRefresh = vm::refresh,
                loading = { HomeSkeleton() },
            ) { stores ->
                val listState = rememberLazyListState()
                val nearEnd by remember {
                    derivedStateOf {
                        val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
                        last >= listState.layoutInfo.totalItemsCount - 3
                    }
                }
                LaunchedEffect(nearEnd, stores.size) { if (nearEnd) vm.loadMore() }
                LazyColumn(
                    state = listState,
                    contentPadding = PaddingValues(bottom = if (cart.isEmpty) 24.dp else 104.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    item(key = "title") {
                        Text(
                            stringResource(R.string.home_title),
                            style = MaterialTheme.typography.headlineLarge,
                            modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 12.dp),
                        )
                    }
                    item(key = "search") { SearchField(ui.query, vm::onQuery) }
                    if (!ui.isFiltered && ui.featured.size > 1) {
                        item(key = "featured") { FeaturedPager(ui.featured, onOpenStore) }
                    }
                    item(key = "categories") { CategoryChips(ui.category, ui.categoryCovers, vm::onCategory) }
                    if (stores.isEmpty()) {
                        item(key = "empty") {
                            Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(stringResource(R.string.home_empty), style = MaterialTheme.typography.titleMedium)
                                Spacer(Modifier.height(6.dp))
                                Text(stringResource(R.string.home_empty_body), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    items(stores, key = { it.id }) { store ->
                        StoreCard(store, onClick = { onOpenStore(store.slug) }, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                    }
                    if (ui.loadingMore) {
                        item(key = "more") { SkeletonCoverCard(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) }
                    }
                }
            }
        }
        if (!cart.isEmpty) {
            CartBar(cart, onClick = onOpenCart, modifier = Modifier.align(Alignment.BottomCenter).padding(horizontal = 16.dp, vertical = 12.dp))
        }
    }
}

/** Where results are sorted from: near the user's location, or everywhere when location is off (tap opens settings). */
@Composable
private fun LocationPill(ui: HomeUi, onOpenSettings: () -> Unit) {
    val denied = ui.locationDenied
    val label = stringResource(
        when {
            denied -> R.string.home_location_off
            ui.location != null -> R.string.home_location_near
            ui.locationResolved -> R.string.home_location_off
            else -> R.string.home_location_finding
        },
    )
    val deniedDescription = stringResource(R.string.home_location_denied)
    Row(
        Modifier
            .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 8.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
            .then(
                if (denied) Modifier.clickable(role = Role.Button, onClick = onOpenSettings).semantics { contentDescription = deniedDescription }
                else Modifier,
            )
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (ui.location != null) Icons.Outlined.NearMe else Icons.Outlined.LocationOff,
            contentDescription = null,
            tint = if (ui.location != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun SearchField(query: String, onQuery: (String) -> Unit) {
    OutlinedTextField(
        value = query,
        onValueChange = onQuery,
        leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
        placeholder = { Text(stringResource(R.string.home_search_hint)) },
        singleLine = true,
        shape = MaterialTheme.shapes.small,
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = MaterialTheme.colorScheme.surface,
            unfocusedContainerColor = MaterialTheme.colorScheme.surface,
            unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
        ),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
    )
}

/** Hero carousel: cover photos of open stores (real data), radius 24, name and tagline on the cover scrim. */
@Composable
private fun FeaturedPager(stores: List<MerchantSummary>, onOpenStore: (String) -> Unit) {
    val pager = rememberPagerState { stores.size }
    Column(Modifier.padding(top = 16.dp)) {
        HorizontalPager(
            state = pager,
            contentPadding = PaddingValues(horizontal = 16.dp),
            pageSpacing = 10.dp,
            modifier = Modifier.fillMaxWidth(),
        ) { page ->
            val store = stores[page]
            val name = loc(store.nameEn, store.nameAr)
            QPhoto(
                url = store.coverUrl,
                contentDescription = name,
                shape = MaterialTheme.shapes.large,
                glyph = categoryGlyph(store.category),
                tint = brandColorOrDefault(store.brandColor),
                scrim = true,
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).clickable(role = Role.Button) { onOpenStore(store.slug) },
            ) {
                Column(Modifier.align(Alignment.BottomStart).padding(16.dp)) {
                    Text(name, style = MaterialTheme.typography.headlineSmall, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val tagline = loc(store.taglineEn, store.taglineAr)
                    if (tagline.isNotBlank()) {
                        Text(tagline, style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.85f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.Center) {
            repeat(stores.size) { i ->
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

/** Category chips led by a real cover photo from that category (branded placeholder with the category glyph otherwise). */
@Composable
private fun CategoryChips(selected: MerchantCategory?, covers: Map<MerchantCategory, String>, onSelect: (MerchantCategory?) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
    ) {
        item(key = "all") {
            CategoryChip(stringResource(R.string.category_all), null, Icons.Outlined.GridView, selected == null) { onSelect(null) }
        }
        items(MerchantCategory.browsable, key = { it.wire }) { c ->
            CategoryChip(categoryLabel(c), covers[c], categoryGlyph(c), selected == c) { onSelect(if (selected == c) null else c) }
        }
    }
}

@Composable
private fun CategoryChip(label: String, photoUrl: String?, glyph: ImageVector, selected: Boolean, onClick: () -> Unit) {
    val shape = MaterialTheme.shapes.medium
    Column(
        Modifier.width(76.dp).selectable(selected = selected, role = Role.Tab, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(72.dp)
                .then(if (selected) Modifier.border(2.dp, MaterialTheme.colorScheme.primary, shape) else Modifier)
                .padding(if (selected) 4.dp else 0.dp),
        ) {
            QPhoto(url = photoUrl, contentDescription = null, glyph = glyph, shape = if (selected) MaterialTheme.shapes.small else shape, modifier = Modifier.fillMaxSize())
        }
        Spacer(Modifier.height(6.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium),
            color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun categoryLabel(c: MerchantCategory): String = stringResource(
    when (c) {
        MerchantCategory.RESTAURANT -> R.string.category_restaurant
        MerchantCategory.CAFE -> R.string.category_cafe
        MerchantCategory.GROCERY -> R.string.category_grocery
        MerchantCategory.PHARMACY -> R.string.category_pharmacy
        MerchantCategory.RETAIL -> R.string.category_retail
        MerchantCategory.FLOWERS -> R.string.category_flowers
        MerchantCategory.ELECTRONICS -> R.string.category_electronics
        MerchantCategory.OTHER, MerchantCategory.UNKNOWN -> R.string.category_other
    },
)

/**
 * Store card: 16:9 cover with the open/closed pill top-start, logo overlapping the cover's bottom edge, name 17/600 and
 * a muted meta row (category · prep time · distance · minimum order). Rating only when the store has real ratings.
 */
@Composable
private fun StoreCard(store: MerchantSummary, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val brand = brandColorOrDefault(store.brandColor)
    val name = loc(store.nameEn, store.nameAr)
    QCard(modifier = modifier.fillMaxWidth(), onClick = onClick, padding = PaddingValues(0.dp)) {
        Box {
            QPhoto(
                url = store.coverUrl,
                contentDescription = null,
                shape = MaterialTheme.shapes.medium,
                glyph = categoryGlyph(store.category),
                tint = brand,
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
            ) {
                StatusPill(
                    stringResource(if (store.isOpen) R.string.store_open else R.string.store_closed),
                    if (store.isOpen) QabnahColors.Success else QabnahColors.Danger,
                    onPhoto = true,
                    modifier = Modifier.align(Alignment.TopStart).padding(12.dp),
                )
            }
            QStoreLogo(store.logoUrl, name, brand, modifier = Modifier.align(Alignment.BottomStart).padding(start = 16.dp).offset(y = 28.dp))
        }
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 36.dp, bottom = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                if (store.ratingCount > 0) {
                    Icon(Icons.Filled.Star, contentDescription = stringResource(R.string.store_rating), tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(2.dp))
                    Text(
                        digits(String.format(java.util.Locale.US, "%.1f", store.ratingAvg)),
                        style = MaterialTheme.typography.labelMedium.tabular(),
                    )
                }
            }
            val meta = buildList {
                add(categoryLabel(store.category))
                if (store.prepTimeMinutes > 0) add(stringResource(R.string.store_prep_minutes, digits(store.prepTimeMinutes.toString())))
                store.distanceM?.let { add(distance(it)) }
                if (store.minOrderBaisa > 0) add(stringResource(R.string.store_min_order, money(store.minOrderBaisa)))
            }
            Text(
                meta.joinToString("  ·  "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

@Composable
private fun HomeSkeleton() {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        SkeletonBox(Modifier.fillMaxWidth(0.7f).height(32.dp))
        SkeletonBox(Modifier.fillMaxWidth().height(52.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            repeat(4) { SkeletonBox(Modifier.size(72.dp), MaterialTheme.shapes.medium) }
        }
        SkeletonCoverCard()
        SkeletonCoverCard()
    }
}
