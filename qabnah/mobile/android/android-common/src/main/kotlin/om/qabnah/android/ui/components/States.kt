package om.qabnah.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import om.qabnah.android.R
import om.qabnah.android.state.Loadable
import om.qabnah.android.ui.theme.QabnahColors

@Composable
fun LoadingState(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(modifier = Modifier.size(40.dp))
    }
}

@Composable
fun ErrorState(error: Throwable, onRetry: (() -> Unit)?, modifier: Modifier = Modifier) {
    MessageState(
        icon = Icons.Filled.CloudOff,
        title = errorMessage(error),
        body = null,
        modifier = modifier,
        action = if (onRetry != null) {
            { Button(onClick = onRetry) { Text(stringResource(R.string.common_retry)) } }
        } else null,
    )
}

@Composable
fun EmptyState(title: String, body: String? = null, modifier: Modifier = Modifier, icon: ImageVector = Icons.Filled.Inbox, action: (@Composable () -> Unit)? = null) {
    MessageState(icon, title, body, modifier, action)
}

@Composable
private fun MessageState(
    icon: ImageVector,
    title: String,
    body: String?,
    modifier: Modifier,
    action: (@Composable () -> Unit)?,
) {
    // Scrollable so it still works as pull-to-refresh content.
    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Spacer(Modifier.height(48.dp))
        Icon(icon, contentDescription = null, modifier = Modifier.size(56.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(16.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (body != null) {
            Spacer(Modifier.height(8.dp))
            Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        }
        if (action != null) {
            Spacer(Modifier.height(20.dp))
            action()
        }
    }
}

/**
 * Standard screen body for a [Loadable]: spinner on first load, full-screen error with retry,
 * pull-to-refresh around [content], and an inline error banner when a refresh fails over existing data.
 */
@Composable
fun <T> LoadableContent(
    state: Loadable<T>,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    isEmpty: (T) -> Boolean = { false },
    empty: @Composable () -> Unit = { EmptyState(stringResource(R.string.common_empty_title)) },
    content: @Composable BoxScope.(T) -> Unit,
) {
    PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = onRefresh, modifier = modifier.fillMaxSize()) {
        val data = state.data
        when {
            state.isInitialLoading -> LoadingState()
            state.showFullError -> ErrorState(state.error!!, onRetry = onRefresh)
            data == null -> LoadingState()
            isEmpty(data) -> empty()
            else -> Column(Modifier.fillMaxSize()) {
                if (state.error != null) InlineError(state.error, onRetry = onRefresh)
                Box(Modifier.fillMaxSize()) { content(data) }
            }
        }
    }
}

@Composable
fun InlineError(error: Throwable, onRetry: (() -> Unit)? = null, modifier: Modifier = Modifier) {
    Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(errorMessage(error), modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodySmall)
            if (onRetry != null) {
                OutlinedButton(onClick = onRetry) { Text(stringResource(R.string.common_retry)) }
            }
        }
    }
}

/** Shown only in debug builds, e.g. with the OTP `devCode`. */
@Composable
fun DevBanner(text: String, modifier: Modifier = Modifier) {
    Row(
        modifier
            .fillMaxWidth()
            .background(QabnahColors.Accent)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Info, contentDescription = null, tint = QabnahColors.Ink, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, color = QabnahColors.Ink, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
fun StatusPill(text: String, color: Color, modifier: Modifier = Modifier) {
    Surface(color = color.copy(alpha = 0.14f), contentColor = color, shape = MaterialTheme.shapes.small, modifier = modifier) {
        Text(text, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
fun LabelValueRow(label: String, value: String, modifier: Modifier = Modifier, emphasize: Boolean = false) {
    Row(modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            label,
            modifier = Modifier.weight(1f),
            style = if (emphasize) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
        )
        Text(value, style = if (emphasize) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium)
    }
}

/** Primary action button with an inline progress indicator. */
@Composable
fun ProgressButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    Button(onClick = onClick, enabled = enabled && !loading, modifier = modifier.fillMaxWidth().height(52.dp)) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
        } else {
            Text(text)
        }
    }
}
