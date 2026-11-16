package androidx.core.content

import android.content.Context
import android.content.Intent
import android.graphics.drawable.Drawable
import android.net.Uri
import java.io.File

object ContextCompat {
    @JvmStatic fun checkSelfPermission(context: Context, permission: String): Int = TODO()
    @JvmStatic fun getDrawable(context: Context, id: Int): Drawable? = TODO()
    @JvmStatic fun startForegroundService(context: Context, intent: Intent) {}
}

open class FileProvider : android.content.ContentProvider() {
    companion object {
        @JvmStatic fun getUriForFile(context: Context, authority: String, file: File): Uri = TODO()
    }
    override fun onCreate() = true
    override fun query(uri: Uri, p: Array<out String>?, s: String?, sa: Array<out String>?, so: String?): android.database.Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: android.content.ContentValues?): Uri? = null
    override fun delete(uri: Uri, s: String?, sa: Array<out String>?) = 0
    override fun update(uri: Uri, v: android.content.ContentValues?, s: String?, sa: Array<out String>?) = 0
}
