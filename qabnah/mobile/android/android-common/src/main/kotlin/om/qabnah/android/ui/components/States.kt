package om.qabnah.android.ui.components

import android.content.pm.ApplicationInfo
import androidx.compose.ui.platform.LocalContext
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

/** Full-page loading: a skeleton, never a spinner. Pass a screen-specific skeleton to [LoadableContent] when one fits better. */
@Composable
fun LoadingState(modifier: Modifier = Modifier) {
    SkeletonList(modifier.fillMaxSize())
}

/** Says what happened and what to do (retry). */
@Composable
fun ErrorState(error: Throwable, onRetry: (() -> Unit)?, modifier: Modifier = Modifier) {
    // Debug builds also name the failure, so a screenshot or a UI dump is enough to diagnose it.
    val debuggable = (LocalContext.current.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    MessageState(
        title = errorMessage(error),
        body = if (debuggable) "${error::class.java.name}: ${error.message}" else null,
        modifier = modifier,
        action = if (onRetry != null) {
            { QSecondaryButton(stringResource(R.string.common_retry), onClick = onRetry, compact = true) }
        } else null,
    )
}

/**
 * Empty state: one line of plain text (plus an optional second line) and the action that fixes it. No illustrations;
 * [icon] is accepted for source compatibility and not drawn.
 */
@Composable
fun EmptyState(
    title: String,
    body: String? = null,
    modifier: Modifier = Modifier,
    @Suppress("UNUSED_PARAMETER") icon: ImageVector? = null,
    action: (@Composable () -> Unit)? = null,
) {
    MessageState(title, body, modifier, action)
}

@Composable
private fun MessageState(
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
            .padding(horizontal = 32.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (body != null) {
            Spacer(Modifier.height(6.dp))
            Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        }
        if (action != null) {
            Spacer(Modifier.height(20.dp))
            action()
        }
    }
}

/**
 * Standard screen body for a [Loadable]: skeleton ([loading]) on first load, full-screen error with retry,
 * pull-to-refresh around [content], and an inline error banner when a refresh fails over existing data.
 */
@Composable
fun <T> LoadableContent(
    state: Loadable<T>,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    isEmpty: (T) -> Boolean = { false },
    empty: @Composable () -> Unit = { EmptyState(stringResource(R.string.common_empty_title)) },
    loading: @Composable () -> Unit = { LoadingState() },
    content: @Composable BoxScope.(T) -> Unit,
) {
    PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = onRefresh, modifier = modifier.fillMaxSize()) {
        val data = state.data
        when {
            state.isInitialLoading -> loading()
            state.showFullError -> ErrorState(state.error!!, onRetry = onRefresh)
            data == null -> loading()
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
            if (onRetry != null) QTextButton(stringResource(R.string.common_retry), onClick = onRetry)
        }
    }
}

/** Shown only in debug builds, e.g. with the OTP `devCode`. */
@Composable
fun DevBanner(text: String, modifier: Modifier = Modifier) {
    Row(
        modifier
            .fillMaxWidth()
            .background(QabnahColors.SaffronSoft)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Info, contentDescription = null, tint = QabnahColors.Ink, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, color = QabnahColors.Ink, style = MaterialTheme.typography.labelMedium)
    }
}

/** Section heading inside a screen (h3). */
@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
        modifier = modifier.padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 8.dp),
    )
}

@Composable
fun LabelValueRow(label: String, value: String, modifier: Modifier = Modifier, emphasize: Boolean = false) {
    Row(modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            label,
            modifier = Modifier.weight(1f),
            style = if (emphasize) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
            color = if (emphasize) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(value, style = (if (emphasize) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium).tabular())
    }
}

/** Label + [QPrice] row for price breakdowns. */
@Composable
fun PriceRow(label: String, baisa: Long, modifier: Modifier = Modifier, emphasize: Boolean = false, negative: Boolean = false) {
    Row(modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            label,
            modifier = Modifier.weight(1f),
            style = if (emphasize) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
            color = if (emphasize) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        QPrice(
            if (negative) -baisa else baisa,
            style = if (emphasize) MaterialTheme.typography.titleLarge else MaterialTheme.typography.bodyMedium,
        )
    }
}

/** Full-width primary action with an inline progress indicator. */
@Composable
fun ProgressButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    QButton(text, onClick, modifier.fillMaxWidth(), enabled = enabled, loading = loading)
}
