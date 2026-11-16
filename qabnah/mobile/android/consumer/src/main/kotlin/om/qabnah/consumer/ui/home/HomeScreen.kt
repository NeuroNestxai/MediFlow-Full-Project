package om.qabnah.consumer.ui.home

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOff
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import om.qabnah.android.location.hasLocationPermission
import om.qabnah.android.ui.components.EmptyState
import om.qabnah.android.ui.components.LoadableContent
import om.qabnah.android.ui.components.StatusPill
import om.qabnah.android.ui.components.digits
import om.qabnah.android.ui.components.distance
import om.qabnah.android.ui.components.loc
import om.qabnah.android.ui.components.money
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.android.ui.theme.brandColorOrDefault
import om.qabnah.android.ui.theme.contentColorFor
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.core.model.MerchantCategory
import om.qabnah.core.model.MerchantSummary

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
            Text(
                stringResource(R.string.home_title),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp),
            )
            OutlinedTextField(
                value = ui.query,
                onValueChange = vm::onQuery,
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                placeholder = { Text(stringResource(R.string.home_search_hint)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            )
            CategoryChips(selected = ui.category, onSelect = vm::onCategory)
            if (ui.locationDenied) {
                Row(
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.secondaryContainer).padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.LocationOff, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.home_location_denied), style = MaterialTheme.typography.bodySmall)
                }
            }
            LoadableContent(
                state = ui.stores,
                onRefresh = vm::refresh,
                isEmpty = { it.isEmpty() },
                empty = { EmptyState(stringResource(R.string.home_empty), stringResource(R.string.home_empty_body), icon = Icons.Filled.Storefront) },
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
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(stores, key = { it.id }) { store -> StoreCard(store, onClick = { onOpenStore(store.slug) }) }
                    if (ui.loadingMore) {
                        item { Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
                    }
                }
            }
        }
        if (!cart.isEmpty) {
            ExtendedFloatingActionButton(
                onClick = onOpenCart,
                icon = { Icon(Icons.Filled.ShoppingBag, contentDescription = null) },
                text = { Text(stringResource(R.string.cart_view, digits(cart.itemCount.toString()), money(cart.subtotalBaisa))) },
                modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
            )
        }
    }
}

@Composable
private fun CategoryChips(selected: MerchantCategory?, onSelect: (MerchantCategory?) -> Unit) {
    LazyRow(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item { FilterChip(selected = selected == null, onClick = { onSelect(null) }, label = { Text(stringResource(R.string.category_all)) }) }
        items(MerchantCategory.browsable) { c ->
            FilterChip(selected = selected == c, onClick = { onSelect(if (selected == c) null else c) }, label = { Text(categoryLabel(c)) })
        }
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

/** Store card rendered in the merchant's own brand colour. */
@Composable
private fun StoreCard(store: MerchantSummary, onClick: () -> Unit) {
    val brand = brandColorOrDefault(store.brandColor)
    val onBrand = contentColorFor(brand)
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Box(Modifier.fillMaxWidth().height(96.dp).background(brand)) {
            if (store.coverUrl != null) {
                AsyncImage(
                    model = store.coverUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.25f)))
            }
            Row(Modifier.align(Alignment.BottomStart).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(shape = CircleShape, color = Color.White, modifier = Modifier.size(48.dp)) {
                    if (store.logoUrl != null) {
                        AsyncImage(model = store.logoUrl, contentDescription = loc(store.nameEn, store.nameAr), contentScale = ContentScale.Crop, modifier = Modifier.clip(CircleShape))
                    } else {
                        Box(contentAlignment = Alignment.Center) { Icon(Icons.Filled.Storefront, contentDescription = null, tint = brand) }
                    }
                }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(loc(store.nameEn, store.nameAr), style = MaterialTheme.typography.titleMedium, color = if (store.coverUrl != null) Color.White else onBrand, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val tagline = loc(store.taglineEn, store.taglineAr)
                    if (tagline.isNotBlank()) {
                        Text(tagline, style = MaterialTheme.typography.bodySmall, color = if (store.coverUrl != null) Color.White else onBrand, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (store.ratingCount > 0) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Star, contentDescription = stringResource(R.string.store_rating), tint = QabnahColors.Accent, modifier = Modifier.size(16.dp))
                    Text(digits(String.format(java.util.Locale.US, "%.1f", store.ratingAvg)), style = MaterialTheme.typography.labelLarge)
                }
            }
            Text(stringResource(R.string.store_prep_minutes, digits(store.prepTimeMinutes.toString())), style = MaterialTheme.typography.labelMedium)
            store.distanceM?.let { Text(distance(it), style = MaterialTheme.typography.labelMedium) }
            if (store.minOrderBaisa > 0) Text(stringResource(R.string.store_min_order, money(store.minOrderBaisa)), style = MaterialTheme.typography.labelMedium)
            Spacer(Modifier.weight(1f))
            if (store.isOpen) StatusPill(stringResource(R.string.store_open), QabnahColors.Success)
            else StatusPill(stringResource(R.string.store_closed), QabnahColors.Danger)
        }
    }
}
