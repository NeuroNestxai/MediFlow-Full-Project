package om.qabnah.captain.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Person
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
import androidx.lifecycle.viewmodel.compose.viewModel
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
import om.qabnah.android.ui.components.ErrorState
import om.qabnah.android.ui.components.LoadingState
import om.qabnah.captain.BuildConfig
import om.qabnah.captain.CaptainContainer
import om.qabnah.captain.R
import om.qabnah.captain.ui.delivery.CompleteDeliveryScreen
import om.qabnah.captain.ui.delivery.DeliveryScreen
import om.qabnah.captain.ui.deliveries.DeliveriesScreen
import om.qabnah.captain.ui.earnings.EarningsScreen
import om.qabnah.captain.ui.earnings.PayoutsScreen
import om.qabnah.captain.ui.home.HomeScreen
import om.qabnah.captain.ui.offers.OfferOverlay
import om.qabnah.captain.ui.onboarding.AvailabilityScreen
import om.qabnah.captain.ui.onboarding.DocumentsScreen
import om.qabnah.captain.ui.onboarding.ProfileFormScreen
import om.qabnah.captain.ui.onboarding.ZonesScreen
import om.qabnah.captain.ui.permissions.PermissionsScreen
import om.qabnah.captain.ui.profile.ProfileScreen
import om.qabnah.core.api.SessionEvent

object Routes {
    const val HOME = "home"
    const val DELIVERIES = "deliveries"
    const val EARNINGS = "earnings"
    const val PROFILE = "profile"
    const val DELIVERY = "delivery/{id}"
    const val COMPLETE = "delivery/{id}/complete"
    const val DOCUMENTS = "documents"
    const val ZONES = "zones"
    const val AVAILABILITY = "availability"
    const val VEHICLE = "vehicle"
    const val PAYOUTS = "payouts"
    const val PERMISSIONS = "permissions"
    const val NOTIFICATIONS = "notifications"
    const val TICKETS = "tickets"
    const val TICKET = "ticket/{ticketId}"
    const val TICKET_NEW = "tickets/new?orderId={orderId}"

    fun delivery(id: String) = "delivery/$id"
    fun complete(id: String) = "delivery/$id/complete"
    fun ticket(id: String) = "ticket/$id"
    fun newTicket(orderId: String? = null) = if (orderId == null) "tickets/new" else "tickets/new?orderId=$orderId"
}

private data class Tab(val route: String, val label: Int, val icon: ImageVector)

private val tabs = listOf(
    Tab(Routes.HOME, R.string.tab_home, Icons.Filled.Home),
    Tab(Routes.DELIVERIES, R.string.tab_deliveries, Icons.Filled.LocalShipping),
    Tab(Routes.EARNINGS, R.string.tab_earnings, Icons.Filled.AccountBalanceWallet),
    Tab(Routes.PROFILE, R.string.tab_profile, Icons.Filled.Person),
)

@Composable
fun CaptainRoot(container: CaptainContainer) {
    val signedIn by container.services.apiClient.signedIn.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val sessionExpiredText = stringResource(om.qabnah.android.R.string.error_session)
    LaunchedEffect(Unit) {
        container.services.apiClient.sessionEvents.collect {
            if (it == SessionEvent.Expired) {
                container.online.stopTracking()
                snackbar.showSnackbar(sessionExpiredText)
            }
        }
    }
    LaunchedEffect(signedIn) {
        if (signedIn) {
            container.realtime.connect()
            PushRegistration.register(container.api, "captain", container.pushTokens)
        } else {
            container.online.stopTracking()
            container.realtime.disconnect()
            container.captain.clear()
        }
    }

    Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            if (BuildConfig.DEBUG) DevBanner(stringResource(om.qabnah.android.R.string.common_dev_banner, BuildConfig.API_BASE_URL))
            Box(Modifier.weight(1f)) {
                if (!signedIn) {
                    AuthScreen(container.api, appName = stringResource(R.string.app_name), logo = R.drawable.ic_logo)
                } else {
                    CaptainGate(container, snackbar)
                }
            }
        }
    }
}

/** Signed in: `GET /me` decides between onboarding (no captain profile yet) and the main app. */
@Composable
private fun CaptainGate(container: CaptainContainer, snackbar: SnackbarHostState) {
    val vm: GateViewModel = viewModel { GateViewModel(container.captain, container.online) }
    val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.load() }
    CompleteProfileGate(container.api)
    when (val s = state) {
        GateState.Loading -> LoadingState()
        is GateState.Failed -> ErrorState(s.error, onRetry = vm::load)
        GateState.NeedsRegistration -> ProfileFormScreen(container, editing = false, onBack = null, onDone = vm::load)
        GateState.Ready -> MainScaffold(container, snackbar)
    }
}

@Composable
private fun MainScaffold(container: CaptainContainer, snackbar: SnackbarHostState) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val destination = backStack?.destination
    val showBottomBar = tabs.any { t -> destination?.hierarchy?.any { it.route == t.route } == true }
    Box(Modifier.fillMaxSize()) {
        Scaffold(
            snackbarHost = { SnackbarHost(snackbar) },
            bottomBar = {
                if (showBottomBar) {
                    NavigationBar {
                        tabs.forEach { tab ->
                            NavigationBarItem(
                                selected = destination?.hierarchy?.any { it.route == tab.route } == true,
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
            contentWindowInsets = WindowInsets(0),
        ) { padding ->
            CaptainNavHost(container, nav, Modifier.padding(padding))
        }
        // Incoming offers cover everything until accepted, rejected or expired.
        OfferOverlay(container, snackbar, onAccepted = { deliveryId -> nav.navigate(Routes.delivery(deliveryId)) })
    }
}

@Composable
private fun CaptainNavHost(container: CaptainContainer, nav: NavHostController, modifier: Modifier) {
    NavHost(nav, startDestination = Routes.HOME, modifier = modifier) {
        composable(Routes.HOME) {
            HomeScreen(
                container,
                onOpenDelivery = { nav.navigate(Routes.delivery(it)) },
                onDocuments = { nav.navigate(Routes.DOCUMENTS) },
                onZones = { nav.navigate(Routes.ZONES) },
                onAvailability = { nav.navigate(Routes.AVAILABILITY) },
                onPermissions = { nav.navigate(Routes.PERMISSIONS) },
            )
        }
        composable(Routes.DELIVERIES) { DeliveriesScreen(container, onOpen = { nav.navigate(Routes.delivery(it)) }) }
        composable(Routes.EARNINGS) { EarningsScreen(container, onPayouts = { nav.navigate(Routes.PAYOUTS) }) }
        composable(Routes.PROFILE) {
            ProfileScreen(
                container,
                onDocuments = { nav.navigate(Routes.DOCUMENTS) },
                onZones = { nav.navigate(Routes.ZONES) },
                onAvailability = { nav.navigate(Routes.AVAILABILITY) },
                onVehicle = { nav.navigate(Routes.VEHICLE) },
                onPermissions = { nav.navigate(Routes.PERMISSIONS) },
                onNotifications = { nav.navigate(Routes.NOTIFICATIONS) },
                onSupport = { nav.navigate(Routes.TICKETS) },
            )
        }
        composable(Routes.DELIVERY, arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
            val id = entry.arguments?.getString("id").orEmpty()
            DeliveryScreen(
                container,
                deliveryId = id,
                onBack = { nav.popBackStack() },
                onComplete = { nav.navigate(Routes.complete(id)) },
                onHelp = { orderId -> nav.navigate(Routes.newTicket(orderId)) },
            )
        }
        composable(Routes.COMPLETE, arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
            CompleteDeliveryScreen(
                container,
                deliveryId = entry.arguments?.getString("id").orEmpty(),
                onBack = { nav.popBackStack() },
                onDone = { nav.navigate(Routes.HOME) { popUpTo(Routes.HOME) { inclusive = true } } },
            )
        }
        composable(Routes.DOCUMENTS) { DocumentsScreen(container, onBack = { nav.popBackStack() }) }
        composable(Routes.ZONES) { ZonesScreen(container, onBack = { nav.popBackStack() }) }
        composable(Routes.AVAILABILITY) { AvailabilityScreen(container, onBack = { nav.popBackStack() }) }
        composable(Routes.VEHICLE) { ProfileFormScreen(container, editing = true, onBack = { nav.popBackStack() }, onDone = { nav.popBackStack() }) }
        composable(Routes.PAYOUTS) { PayoutsScreen(container, onBack = { nav.popBackStack() }) }
        composable(Routes.PERMISSIONS) { PermissionsScreen(container, onBack = { nav.popBackStack() }) }
        composable(Routes.NOTIFICATIONS) { NotificationsScreen(container.support, onBack = { nav.popBackStack() }) }
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
