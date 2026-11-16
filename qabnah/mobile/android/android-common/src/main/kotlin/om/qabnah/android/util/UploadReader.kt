package om.qabnah.android.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.provider.OpenableColumns
import androidx.exifinterface.media.ExifInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

/** A file ready for `POST /files`. */
class PreparedUpload(val bytes: ByteArray, val fileName: String, val mimeType: String)

/**
 * Reads a picked/captured document. Images are down-scaled to [maxDimension] px, EXIF-rotated and re-encoded as
 * JPEG (keeps uploads small on mobile data); PDFs and other files are sent as-is.
 */
object UploadReader {
    private const val MAX_BYTES = 10 * 1024 * 1024

    suspend fun read(context: Context, uri: Uri, maxDimension: Int = 2048): PreparedUpload = withContext(Dispatchers.IO) {
        val resolver = context.contentResolver
        val mime = resolver.getType(uri) ?: "image/jpeg"
        val name = displayName(context, uri) ?: "upload"
        if (!mime.startsWith("image/")) {
            val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: error("Cannot read file")
            require(bytes.size <= MAX_BYTES) { "File too large" }
            return@withContext PreparedUpload(bytes, name, mime)
        }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (bounds.outWidth / sample > maxDimension * 2 || bounds.outHeight / sample > maxDimension * 2) sample *= 2
        val decoded = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: error("Cannot decode image")
        val rotation = resolver.openInputStream(uri)?.use {
            when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
        } ?: 0f
        val scale = minOf(1f, maxDimension.toFloat() / maxOf(decoded.width, decoded.height))
        val matrix = Matrix().apply {
            if (scale < 1f) postScale(scale, scale)
            if (rotation != 0f) postRotate(rotation)
        }
        val bitmap = if (scale < 1f || rotation != 0f) {
            Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        } else decoded
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
        if (bitmap !== decoded) decoded.recycle()
        bitmap.recycle()
        PreparedUpload(out.toByteArray(), name.substringBeforeLast('.') + ".jpg", "image/jpeg")
    }

    private fun displayName(context: Context, uri: Uri): String? = runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    }.getOrNull() ?: uri.lastPathSegment
}
