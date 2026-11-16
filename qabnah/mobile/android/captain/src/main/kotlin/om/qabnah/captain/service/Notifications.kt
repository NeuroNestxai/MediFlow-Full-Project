package om.qabnah.captain.service

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import om.qabnah.captain.MainActivity
import om.qabnah.captain.R
import om.qabnah.core.model.Offer
import om.qabnah.core.money.Money

object Notifications {
    const val CHANNEL_ONLINE = "online"
    const val CHANNEL_OFFERS = "offers"
    const val ID_ONLINE = 1001
    private const val ID_OFFER_BASE = 2000

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ONLINE, context.getString(R.string.channel_online), NotificationManager.IMPORTANCE_LOW).apply {
                description = context.getString(R.string.channel_online_desc)
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_OFFERS, context.getString(R.string.channel_offers), NotificationManager.IMPORTANCE_HIGH).apply {
                description = context.getString(R.string.channel_offers_desc)
                enableVibration(true)
            },
        )
    }

    private fun openApp(context: Context, requestCode: Int): PendingIntent = PendingIntent.getActivity(
        context,
        requestCode,
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    fun online(context: Context) = NotificationCompat.Builder(context, CHANNEL_ONLINE)
        .setSmallIcon(om.qabnah.android.R.drawable.ic_notification)
        .setContentTitle(context.getString(R.string.notif_online_title))
        .setContentText(context.getString(R.string.notif_online_text))
        .setOngoing(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setContentIntent(openApp(context, 0))
        .build()

    /** Heads-up + full-screen intent so the offer is seen when the phone is locked or another app is open. */
    @android.annotation.SuppressLint("MissingPermission") // checked by canPost()
    fun offer(context: Context, offer: Offer, arabic: Boolean) {
        if (!canPost(context)) return
        val open = openApp(context, offer.id.hashCode())
        val n = NotificationCompat.Builder(context, CHANNEL_OFFERS)
            .setSmallIcon(om.qabnah.android.R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.notif_offer_title, Money.format(offer.earningBaisa, arabic)))
            .setContentText(listOfNotNull(offer.pickupArea, offer.dropoffArea).joinToString(" → "))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setContentIntent(open)
            .setFullScreenIntent(open, true)
            .setTimeoutAfter(OfferTimeout.millisUntil(offer))
            .build()
        NotificationManagerCompat.from(context).notify(ID_OFFER_BASE + (offer.id.hashCode() and 0xFFFF), n)
    }

    fun cancelOffer(context: Context, offerId: String) {
        NotificationManagerCompat.from(context).cancel(ID_OFFER_BASE + (offerId.hashCode() and 0xFFFF))
    }

    private fun canPost(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
}

object OfferTimeout {
    fun millisUntil(offer: Offer): Long =
        (om.qabnah.captain.data.OfferRepository.expiresAtMs(offer) - System.currentTimeMillis()).coerceIn(1_000, 10 * 60_000)
}
