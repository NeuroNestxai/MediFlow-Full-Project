package om.qabnah.android.push

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import om.qabnah.android.R
import om.qabnah.core.push.ClientApp
import om.qabnah.core.push.DeepLink
import om.qabnah.core.push.DeepLinks
import om.qabnah.core.push.PushChannel
import om.qabnah.core.push.PushPayload
import om.qabnah.core.push.PushRouting

/** Shows pushes as notifications whose tap opens the matching `qabnah://` deep link in the app's activity. */
object PushNotifications {

    /**
     * Creates the `orders` and `support` channels (default importance). The captain app also creates the high-importance
     * `offers` channel itself (see captain `Notifications`).
     */
    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(PushChannel.ORDERS.id, context.getString(R.string.channel_orders), NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = context.getString(R.string.channel_orders_desc)
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(PushChannel.SUPPORT.id, context.getString(R.string.channel_support), NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = context.getString(R.string.channel_support_desc)
            },
        )
    }

    /** Explicit VIEW intent carrying the deep link (or just opening the app when [link] is null). */
    fun intentFor(context: Context, activity: Class<out Activity>, link: DeepLink?): Intent =
        Intent(context, activity).apply {
            action = Intent.ACTION_VIEW
            if (link != null) data = Uri.parse(DeepLinks.toUri(link))
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }

    @android.annotation.SuppressLint("MissingPermission") // checked by canPost()
    fun show(context: Context, payload: PushPayload, app: ClientApp, activity: Class<out Activity>) {
        if (!canPost(context)) return
        val title = payload.title ?: payload.body ?: return
        val channel = PushRouting.channel(payload, app)
        val id = PushRouting.notificationId(payload)
        val link = PushRouting.deepLink(payload, app)
        val tap = PendingIntent.getActivity(
            context,
            id,
            intentFor(context, activity, link),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = NotificationCompat.Builder(context, channel.id)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(payload.body.takeIf { payload.title != null })
            .setAutoCancel(true)
            .setContentIntent(tap)
            .setPriority(if (channel == PushChannel.OFFERS) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(if (channel == PushChannel.SUPPORT) NotificationCompat.CATEGORY_MESSAGE else NotificationCompat.CATEGORY_STATUS)
        payload.body?.takeIf { payload.title != null }?.let { builder.setStyle(NotificationCompat.BigTextStyle().bigText(it)) }
        NotificationManagerCompat.from(context).notify(id, builder.build())
    }

    fun canPost(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
}

/**
 * Android 13+: asks for POST_NOTIFICATIONS once (per install) when [enabled], e.g. right after sign-in with FCM
 * configured. Declining is respected; the user can enable notifications later in system settings.
 */
@androidx.compose.runtime.Composable
fun RequestNotificationPermissionOnce(enabled: Boolean) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val context = androidx.compose.ui.platform.LocalContext.current
    val launcher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
    ) { }
    androidx.compose.runtime.LaunchedEffect(enabled) {
        if (!enabled || PushNotifications.canPost(context)) return@LaunchedEffect
        val prefs = context.getSharedPreferences("qabnah_push", Context.MODE_PRIVATE)
        if (prefs.getBoolean("asked_post_notifications", false)) return@LaunchedEffect
        prefs.edit().putBoolean("asked_post_notifications", true).apply()
        launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
}
