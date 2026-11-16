package om.qabnah.android.security

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import om.qabnah.core.api.StoredTokens
import om.qabnah.core.api.TokenStore
import java.io.IOException
import java.security.GeneralSecurityException

/**
 * [TokenStore] backed by EncryptedSharedPreferences (AES-256 GCM values, keys wrapped by the Android Keystore).
 * If the keystore entry is lost (backup restore to a new device, OEM bugs) the file is wiped and the user simply
 * signs in again — tokens are never written in plain text.
 */
class EncryptedTokenStore(context: Context, private val fileName: String = "qabnah_session") : TokenStore {
    private val appContext = context.applicationContext
    private val prefs: SharedPreferences by lazy { open() }

    private fun open(): SharedPreferences = try {
        create()
    } catch (e: GeneralSecurityException) {
        Log.w(TAG, "Encrypted prefs unreadable, resetting session", e)
        appContext.deleteSharedPreferences(fileName)
        create()
    } catch (e: IOException) {
        Log.w(TAG, "Encrypted prefs unreadable, resetting session", e)
        appContext.deleteSharedPreferences(fileName)
        create()
    }

    private fun create(): SharedPreferences {
        val masterKey = MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            appContext,
            fileName,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    @Synchronized
    override fun read(): StoredTokens? {
        val access = prefs.getString(KEY_ACCESS, null) ?: return null
        val refresh = prefs.getString(KEY_REFRESH, null) ?: return null
        return StoredTokens(access, refresh, prefs.getLong(KEY_EXPIRES, 0L))
    }

    @Synchronized
    override fun write(tokens: StoredTokens?) {
        prefs.edit().apply {
            if (tokens == null) {
                clear()
            } else {
                putString(KEY_ACCESS, tokens.accessToken)
                putString(KEY_REFRESH, tokens.refreshToken)
                putLong(KEY_EXPIRES, tokens.accessExpiresAtEpochMs)
            }
        }.commit()
    }

    private companion object {
        const val TAG = "EncryptedTokenStore"
        const val KEY_ACCESS = "access_token"
        const val KEY_REFRESH = "refresh_token"
        const val KEY_EXPIRES = "access_expires_at"
    }
}
