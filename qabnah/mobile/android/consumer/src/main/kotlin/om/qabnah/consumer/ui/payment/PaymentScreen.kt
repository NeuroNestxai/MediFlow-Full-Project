package om.qabnah.consumer.ui.payment

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.HourglassTop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import om.qabnah.android.ui.components.ProgressButton
import om.qabnah.android.ui.components.QSecondaryButton
import androidx.compose.foundation.layout.fillMaxWidth
import om.qabnah.android.ui.components.ScreenScaffold
import om.qabnah.android.ui.components.errorMessage
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.android.util.Intents
import om.qabnah.consumer.ConsumerContainer
import om.qabnah.consumer.R

@Composable
fun PaymentScreen(container: ConsumerContainer, orderId: String, onDone: () -> Unit) {
    val vm: PaymentViewModel = viewModel { PaymentViewModel(container.orders, orderId) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val toolbar = MaterialTheme.colorScheme.primary.toArgb()

    LaunchedEffect(ui.openTab) {
        val url = ui.checkoutUrl
        if (ui.openTab && url != null) {
            Intents.openCustomTab(context, url, toolbar)
            vm.onTabOpened()
        }
    }
    LifecycleResumeEffect(Unit) {
        vm.onResumed()
        onPauseOrDispose { }
    }
    LaunchedEffect(ui.phase) { if (ui.phase == PaymentUi.Phase.PAID) onDone() }

    ScreenScaffold(title = stringResource(R.string.payment_title), onBack = onDone) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            when (ui.phase) {
                PaymentUi.Phase.STARTING, PaymentUi.Phase.CHECKING, PaymentUi.Phase.PAID -> {
                    CircularProgressIndicator()
                    Spacer(Modifier.height(16.dp))
                    Text(
                        stringResource(if (ui.phase == PaymentUi.Phase.STARTING) R.string.payment_starting else R.string.payment_checking),
                        textAlign = TextAlign.Center,
                    )
                }
                PaymentUi.Phase.IN_BROWSER -> {
                    Icon(Icons.Outlined.HourglassTop, contentDescription = null, modifier = Modifier.size(40.dp), tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.height(16.dp))
                    Text(stringResource(R.string.payment_in_browser), textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(16.dp))
                    ProgressButton(stringResource(R.string.payment_open_again), onClick = vm::reopenTab)
                    QSecondaryButton(stringResource(R.string.payment_check_now), onClick = vm::poll, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                }
                PaymentUi.Phase.PENDING -> {
                    Icon(Icons.Outlined.HourglassTop, contentDescription = null, modifier = Modifier.size(40.dp), tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.height(16.dp))
                    Text(stringResource(R.string.payment_pending), textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(16.dp))
                    ProgressButton(stringResource(R.string.payment_check_now), onClick = vm::poll)
                    QSecondaryButton(stringResource(R.string.payment_open_again), onClick = vm::reopenTab, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                }
                PaymentUi.Phase.FAILED -> {
                    Icon(Icons.Outlined.ErrorOutline, contentDescription = null, modifier = Modifier.size(40.dp), tint = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.height(16.dp))
                    Text(stringResource(R.string.payment_failed), textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(16.dp))
                    ProgressButton(stringResource(R.string.payment_try_again), onClick = vm::startCheckout)
                    QSecondaryButton(stringResource(R.string.payment_view_order), onClick = onDone, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                }
                PaymentUi.Phase.ERROR -> {
                    Icon(Icons.Outlined.ErrorOutline, contentDescription = null, modifier = Modifier.size(40.dp), tint = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.height(16.dp))
                    Text(ui.error?.let { errorMessage(it) } ?: "", textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(16.dp))
                    ProgressButton(stringResource(om.qabnah.android.R.string.common_retry), onClick = vm::startCheckout)
                    QSecondaryButton(stringResource(R.string.payment_view_order), onClick = onDone, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                }
            }
        }
    }
}
