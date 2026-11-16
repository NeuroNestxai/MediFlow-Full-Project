package androidx.activity.result.contract

import android.net.Uri

abstract class ActivityResultContract<I, O>

class ActivityResultContracts {
    class RequestMultiplePermissions : ActivityResultContract<Array<String>, Map<String, @JvmSuppressWildcards Boolean>>()
    class RequestPermission : ActivityResultContract<String, Boolean>()
    open class TakePicture : ActivityResultContract<Uri, Boolean>()
    open class OpenDocument : ActivityResultContract<Array<String>, Uri?>()
}
