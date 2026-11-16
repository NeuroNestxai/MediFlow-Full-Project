package om.qabnah.captain.ui.onboarding

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.core.content.FileProvider
import om.qabnah.android.ui.theme.QabnahColors
import om.qabnah.captain.R
import om.qabnah.core.model.CaptainDocType
import om.qabnah.core.model.CaptainStatus
import java.io.File

@Composable
fun docTypeLabel(type: CaptainDocType): String = stringResource(
    when (type) {
        CaptainDocType.NATIONAL_ID -> R.string.doc_national_id
        CaptainDocType.DRIVING_LICENSE -> R.string.doc_driving_license
        CaptainDocType.VEHICLE_REGISTRATION -> R.string.doc_vehicle_registration
        CaptainDocType.VEHICLE_INSURANCE -> R.string.doc_vehicle_insurance
        CaptainDocType.PROFILE_PHOTO -> R.string.doc_profile_photo
        CaptainDocType.POLICE_CLEARANCE -> R.string.doc_police_clearance
        CaptainDocType.UNKNOWN -> R.string.doc_other
    },
)

@Composable
fun captainStatusLabel(status: CaptainStatus): String = stringResource(
    when (status) {
        CaptainStatus.PENDING_DOCUMENTS -> R.string.status_pending_documents
        CaptainStatus.PENDING_REVIEW -> R.string.status_pending_review
        CaptainStatus.ACTIVE -> R.string.status_active
        CaptainStatus.SUSPENDED -> R.string.status_suspended
        CaptainStatus.REJECTED -> R.string.status_rejected
        CaptainStatus.UNKNOWN -> om.qabnah.android.R.string.status_unknown
    },
)

fun captainStatusColor(status: CaptainStatus): Color = when (status) {
    CaptainStatus.ACTIVE -> QabnahColors.Success
    CaptainStatus.PENDING_REVIEW -> QabnahColors.Info
    CaptainStatus.PENDING_DOCUMENTS -> QabnahColors.Accent
    CaptainStatus.SUSPENDED, CaptainStatus.REJECTED -> QabnahColors.Danger
    CaptainStatus.UNKNOWN -> QabnahColors.Muted
}

/** content:// URI (FileProvider, app cache) for ActivityResultContracts.TakePicture. */
fun newCaptureUri(context: Context, prefix: String): Uri {
    val dir = File(context.cacheDir, "captures").apply { mkdirs() }
    val file = File(dir, "${prefix}_${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(context, "${context.packageName}.files", file)
}
