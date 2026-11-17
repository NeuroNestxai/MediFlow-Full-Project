// Stubs for com.google.firebase:firebase-messaging (Google Maven only). Signatures follow firebase-messaging 24.1.0.
package com.google.firebase

import android.content.Context

class FirebaseOptions private constructor() {
    class Builder {
        fun setApiKey(apiKey: String): Builder = this
        fun setApplicationId(applicationId: String): Builder = this
        fun setProjectId(projectId: String?): Builder = this
        fun setGcmSenderId(gcmSenderId: String?): Builder = this
        fun build(): FirebaseOptions = TODO()
    }
}

class FirebaseApp private constructor() {
    companion object {
        @JvmStatic fun getApps(context: Context): List<FirebaseApp> = TODO()
        @JvmStatic fun initializeApp(context: Context, options: FirebaseOptions): FirebaseApp = TODO()
    }
}
