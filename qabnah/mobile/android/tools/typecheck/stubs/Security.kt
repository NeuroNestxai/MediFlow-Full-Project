package androidx.security.crypto

import android.content.Context
import android.content.SharedPreferences

class MasterKey private constructor() {
    enum class KeyScheme { AES256_GCM }
    class Builder(context: Context) {
        fun setKeyScheme(scheme: KeyScheme): Builder = this
        fun build(): MasterKey = TODO()
    }
}

class EncryptedSharedPreferences private constructor() {
    enum class PrefKeyEncryptionScheme { AES256_SIV }
    enum class PrefValueEncryptionScheme { AES256_GCM }
    companion object {
        @JvmStatic fun create(
            context: Context, fileName: String, masterKey: MasterKey,
            k: PrefKeyEncryptionScheme, v: PrefValueEncryptionScheme,
        ): SharedPreferences = TODO()
    }
}
