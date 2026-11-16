package androidx.core.app

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context

class NotificationCompat {
    class Builder(context: Context, channelId: String) {
        fun setSmallIcon(icon: Int): Builder = this
        fun setContentTitle(title: CharSequence?): Builder = this
        fun setContentText(text: CharSequence?): Builder = this
        fun setOngoing(ongoing: Boolean): Builder = this
        fun setCategory(category: String?): Builder = this
        fun setContentIntent(intent: PendingIntent?): Builder = this
        fun setPriority(pri: Int): Builder = this
        fun setAutoCancel(auto: Boolean): Builder = this
        fun setFullScreenIntent(intent: PendingIntent?, highPriority: Boolean): Builder = this
        fun setTimeoutAfter(durationMs: Long): Builder = this
        fun build(): Notification = TODO()
    }
    companion object {
        const val PRIORITY_MAX = 2
        const val CATEGORY_CALL = "call"
        const val CATEGORY_SERVICE = "service"
    }
}

class NotificationManagerCompat private constructor() {
    fun notify(id: Int, notification: Notification) {}
    fun cancel(id: Int) {}
    companion object { @JvmStatic fun from(context: Context): NotificationManagerCompat = TODO() }
}

object ServiceCompat {
    @JvmStatic fun startForeground(service: Service, id: Int, notification: Notification, foregroundServiceType: Int) {}
}
