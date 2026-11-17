package com.google.firebase.messaging

import com.google.android.gms.tasks.Task

class FirebaseMessaging private constructor() {
    val token: Task<String> get() = TODO()
    fun deleteToken(): Task<Void> = TODO()
    companion object {
        @JvmStatic fun getInstance(): FirebaseMessaging = TODO()
    }
}

class RemoteMessage private constructor() {
    val data: Map<String, String> get() = TODO()
    val notification: Notification? get() = TODO()
    class Notification private constructor() {
        val title: String? get() = TODO()
        val body: String? get() = TODO()
    }
}

abstract class FirebaseMessagingService : android.app.Service() {
    open fun onMessageReceived(message: RemoteMessage) {}
    open fun onNewToken(token: String) {}
    override fun onBind(intent: android.content.Intent?): android.os.IBinder? = null
}
