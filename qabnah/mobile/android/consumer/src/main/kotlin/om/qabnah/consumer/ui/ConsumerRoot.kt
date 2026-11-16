package om.qabnah.consumer.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import om.qabnah.android.auth.AuthScreen
import om.qabnah.android.auth.CompleteProfileGate
import om.qabnah.android.push.PushRegistration
import om.qabnah.android.support.NewTicketScreen
import om.qabnah.android.support.NotificationsScreen
import om.qabnah.android.support.TicketDetailScreen
import om.qabnah.android.support.TicketsScreen
import om.qabnah.android.ui.components.DevBanner
import om.qabnah.core.api.SessionEvent
import om.qabnah.consumer.BuildConfig
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R
import om.qabnah.consumer.ui.account.AccountScreen
import om.qabnah.consumer.ui.account.AddressEditScreen
import om.qabnah.consumer.ui.account.AddressesScreen
import om.qabnah.consumer.ui.checkout.CheckoutScreen
import om.qabnah.consumer.ui.home.HomeScreen
import om.qabnah.consumer.ui.orders.OrderDetailScreen
import om.qabnah.consumer.ui.orders.OrdersScreen
import om.qabnah.consumer.ui.payment.PaymentScreen
import om.qabnah.consumer.ui.send.SendScreen
import om.qabnah.consumer.ui.store.StoreScreen
import om.qabnah.consumer.ui.tracking.TrackingScreen

object Routes {
    const val HOME = "home"
    const val SEND = "send"
    const val ORDERS = "orders"
    const val ACCOUNT = "account"
    const val STORE = "store/{slug}"
    const val CHECKOUT = "checkout"
    const val PAYMENT = "payment/{orderId}"
    const val ORDER = "order/{orderId}"
    const val TRACKING = "tracking/{orderId}"
    const val ADDRESSES = "addresses"
    const val ADDRESS_EDIT = "address/edit?id={id}"
    const val NOTIFICATIONS = "notifications"
    const val TICKETS = "tickets"
    const val TICKET = "ticket/{ticketId}"
    const val TICKET_NEW = "tickets/new?orderId={orderId}"

    fun store(slug: String) = "store/$slug"
    fun payment(orderId: String) = "payment/$orderId"
    fun order(orderId: String) = "order/$orderId"
    fun tracking(orderId: String) = "tracking/$orderId"
    fun addressEdit(id: String? = null) = if (id == null) "address/edit" else "address/edit?id=$id"
    fun ticket(id: String) = "ticket/$id"
    fun newTicket(orderId: String? = null) = if (orderId == null) "tickets/new" else "tickets/new?orderId=$orderId"

    /** savedStateHandle key used by AddressEdit to hand the new address id back to Checkout. */
    const val RESULT_ADDRESS_ID = "result_address_id"
}

private data class Tab(val route: String, val label: Int, val icon: ImageVector)

private val tabs = listOf(
    Tab(Routes.HOME, R.string.tab_home, Icons.Filled.Home),
    Tab(Routes.SEND, R.string.tab_send, Icons.Filled.LocalShipping),
    Tab(Routes.ORDERS, R.string.tab_orders, Icons.Filled.Receipt),
    Tab(Routes.ACCOUNT, R.string.tab_account, Icons.Filled.AccountCircle),
)

@Composable
fun ConsumerRoot(container: ConsumerContainer) {
    val signedIn by container.services.apiClient.signedIn.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val sessionExpiredText = stringResource(om.qabnah.android.R.string.error_session)

    LaunchedEffect(Unit) {
        container.services.apiClient.sessionEvents.collect { if (it == SessionEvent.Expired) snackbar.showSnackbar(sessionExpiredText) }
    }
    LaunchedEffect(signedIn) {
        if (signedIn) {
            container.realtime.connect()
            PushRegistration.register(container.api, "consumer", container.pushTokens)
        } else {
            container.realtime.disconnect()
            container.cart.clear()
        }
    }

    Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            if (BuildConfig.DEBUG) DevBanner(stringResource(om.qabnah.android.R.string.common_dev_banner, BuildConfig.API_BASE_URL))
            Box(Modifier.weight(1f)) {
                if (!signedIn) {
                    AuthScreen(container.api, appName = stringResource(R.string.app_name), logo = R.drawable.ic_logo)
                } else {
                    CompleteProfileGate(container.api)
                    MainScaffold(container, snackbar)
                }
            }
        }
    }
}

@Composable
private fun MainScaffold(container: ConsumerContainer, snackbar: SnackbarHostState) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val destination = backStack?.destination
    val showBottomBar = tabs.any { t -> destination?.hierarchy?.any { it.route == t.route } == true }
    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    tabs.forEach { tab ->
                        val selected = destination?.hierarchy?.any { it.route == tab.route } == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            label = { Text(stringResource(tab.label)) },
                        )
                    }
                }
            }
        },
        contentWindowInsets = androidx.compose.foundation.layout.WindowInsets(0),
    ) { padding ->
        ConsumerNavHost(container, nav, Modifier.padding(padding))
    }
}

@Composable
private fun ConsumerNavHost(container: ConsumerContainer, nav: NavHostController, modifier: Modifier) {
    NavHost(nav, startDestination = Routes.HOME, modifier = modifier) {
        composable(Routes.HOME) {
            HomeScreen(container, onOpenStore = { nav.navigate(Routes.store(it)) }, onOpenCart = { nav.navigate(Routes.CHECKOUT) })
        }
        composable(Routes.SEND) {
            SendScreen(container, onCreated = { order ->
                nav.navigate(if (order.needsPayment) Routes.payment(order.id) else Routes.order(order.id))
            })
        }
        composable(Routes.ORDERS) {
            OrdersScreen(container, onOpen = { nav.navigate(Routes.order(it)) })
        }
        composable(Routes.ACCOUNT) {
            AccountScreen(
                container,
                onAddresses = { nav.navigate(Routes.ADDRESSES) },
                onNotifications = { nav.navigate(Routes.NOTIFICATIONS) },
                onSupport = { nav.navigate(Routes.TICKETS) },
            )
        }
        composable(Routes.STORE, arguments = listOf(navArgument("slug") { type = NavType.StringType })) { entry ->
            StoreScreen(
                container,
                slug = entry.arguments?.getString("slug").orEmpty(),
                onBack = { nav.popBackStack() },
                onOpenCart = { nav.navigate(Routes.CHECKOUT) },
            )
        }
        composable(Routes.CHECKOUT) { entry ->
            val newAddressId by entry.savedStateHandle.getStateFlow<String?>(Routes.RESULT_ADDRESS_ID, null).collectAsStateWithLifecycle()
            CheckoutScreen(
                container,
                newAddressId = newAddressId,
                onBack = { nav.popBackStack() },
                onAddAddress = { nav.navigate(Routes.addressEdit()) },
                onPlaced = { order ->
                    val target = if (order.needsPayment) Routes.payment(order.id) else Routes.order(order.id)
                    nav.navigate(target) { popUpTo(Routes.HOME) }
                },
            )
        }
        composable(Routes.PAYMENT, arguments = listOf(navArgument("orderId") { type = NavType.StringType })) { entry ->
            val id = entry.arguments?.getString("orderId").orEmpty()
            PaymentScreen(
                container,
                orderId = id,
                onDone = { nav.navigate(Routes.order(id)) { popUpTo(Routes.PAYMENT) { inclusive = true } } },
            )
        }
        composable(Routes.ORDER, arguments = listOf(navArgument("orderId") { type = NavType.StringType })) { entry ->
            val id = entry.arguments?.getString("orderId").orEmpty()
            OrderDetailScreen(
                container,
                orderId = id,
                onBack = { if (!nav.popBackStack()) nav.navigate(Routes.ORDERS) },
                onTrack = { nav.navigate(Routes.tracking(id)) },
                onPay = { nav.navigate(Routes.payment(id)) },
                onHelp = { nav.navigate(Routes.newTicket(id)) },
            )
        }
        composable(Routes.TRACKING, arguments = listOf(navArgument("orderId") { type = NavType.StringType })) { entry ->
            TrackingScreen(container, orderId = entry.arguments?.getString("orderId").orEmpty(), onBack = { nav.popBackStack() })
        }
        composable(Routes.ADDRESSES) {
            AddressesScreen(
                container,
                onBack = { nav.popBackStack() },
                onAdd = { nav.navigate(Routes.addressEdit()) },
                onEdit = { nav.navigate(Routes.addressEdit(it)) },
            )
        }
        composable(
            Routes.ADDRESS_EDIT,
            arguments = listOf(navArgument("id") { type = NavType.StringType; nullable = true; defaultValue = null }),
        ) { entry ->
            AddressEditScreen(
                container,
                addressId = entry.arguments?.getString("id"),
                onBack = { nav.popBackStack() },
                onSaved = { id ->
                    nav.previousBackStackEntry?.savedStateHandle?.set(Routes.RESULT_ADDRESS_ID, id)
                    nav.popBackStack()
                },
            )
        }
        composable(Routes.NOTIFICATIONS) {
            NotificationsScreen(container.support, onBack = { nav.popBackStack() }, onOpenOrder = { nav.navigate(Routes.order(it)) })
        }
        composable(Routes.TICKETS) {
            TicketsScreen(
                container.support,
                onBack = { nav.popBackStack() },
                onOpen = { nav.navigate(Routes.ticket(it)) },
                onNew = { nav.navigate(Routes.newTicket()) },
            )
        }
        composable(Routes.TICKET, arguments = listOf(navArgument("ticketId") { type = NavType.StringType })) { entry ->
            TicketDetailScreen(container.support, ticketId = entry.arguments?.getString("ticketId").orEmpty(), onBack = { nav.popBackStack() })
        }
        composable(
            Routes.TICKET_NEW,
            arguments = listOf(navArgument("orderId") { type = NavType.StringType; nullable = true; defaultValue = null }),
        ) { entry ->
            NewTicketScreen(
                container.support,
                orderId = entry.arguments?.getString("orderId"),
                onBack = { nav.popBackStack() },
                onCreated = { id -> nav.navigate(Routes.ticket(id)) { popUpTo(Routes.TICKET_NEW) { inclusive = true } } },
            )
        }
    }
}
