package om.qabnah.captain.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import om.qabnah.android.util.PreparedUpload
import om.qabnah.core.api.QabnahApi
import om.qabnah.core.model.AvailabilitySlot
import om.qabnah.core.model.CaptainDeliveriesPage
import om.qabnah.core.model.CaptainDelivery
import om.qabnah.core.model.CaptainDocType
import om.qabnah.core.model.CaptainDocumentInput
import om.qabnah.core.model.CaptainProfile
import om.qabnah.core.model.CaptainProfileInput
import om.qabnah.core.model.CompleteDeliveryInput
import om.qabnah.core.model.DeliveryAction
import om.qabnah.core.model.Earnings
import om.qabnah.core.model.FilePurpose
import om.qabnah.core.model.FileRef
import om.qabnah.core.model.LatLng
import om.qabnah.core.model.Me
import om.qabnah.core.model.ProfileUpdate
import om.qabnah.core.model.Settlement
import om.qabnah.core.model.Zone
import om.qabnah.core.util.DateRanges

/** Captain profile (cached as a StateFlow so every screen sees the same status) and captain endpoints. */
class CaptainRepository(private val api: QabnahApi) {
    private val _profile = MutableStateFlow<CaptainProfile?>(null)
    val profile: StateFlow<CaptainProfile?> = _profile.asStateFlow()

    /** `GET /me`; `captain == null` means the user has not registered as a captain yet. */
    suspend fun me(): Me = api.me().also { me -> me.captain?.let { _profile.value = it } }

    suspend fun refreshProfile(): CaptainProfile = api.captainProfile().also { _profile.value = it }

    suspend fun register(input: CaptainProfileInput): CaptainProfile = api.registerCaptain(input).also { _profile.value = it }
    suspend fun update(input: CaptainProfileInput): CaptainProfile = api.updateCaptainProfile(input).also { _profile.value = it }

    /** `POST /files` (purpose captain_document) then `POST /captain/documents`, then reloads the checklist. */
    suspend fun uploadDocument(file: PreparedUpload, type: CaptainDocType, number: String?, expiresAt: String?): CaptainProfile {
        val ref = api.uploadFile(file.bytes, file.fileName, file.mimeType, FilePurpose.CAPTAIN_DOCUMENT)
        api.addCaptainDocument(CaptainDocumentInput(type, ref.id, number?.takeIf { it.isNotBlank() }, expiresAt?.takeIf { it.isNotBlank() }))
        return refreshProfile()
    }

    suspend fun uploadProof(file: PreparedUpload): FileRef =
        api.uploadFile(file.bytes, file.fileName, file.mimeType, FilePurpose.PROOF_OF_DELIVERY)

    suspend fun zones(): List<Zone> = api.zones().filter { it.isActive }
    suspend fun setZones(ids: List<String>): CaptainProfile = api.setCaptainZones(ids).also { _profile.value = it }
    suspend fun setAvailability(slots: List<AvailabilitySlot>): CaptainProfile =
        api.setCaptainAvailability(slots).also { _profile.value = it }

    suspend fun setOnline(online: Boolean, location: LatLng?): CaptainProfile =
        api.setCaptainStatus(online, location).also { _profile.value = it }

    suspend fun deliveries(active: Boolean, offset: Int = 0): CaptainDeliveriesPage =
        api.captainDeliveries(if (active) "active" else "history", limit = 20, offset = offset)
    suspend fun delivery(id: String): CaptainDelivery = api.captainDelivery(id)
    suspend fun advance(id: String, action: DeliveryAction, reason: String?, location: LatLng?): CaptainDelivery =
        api.advanceDelivery(id, action, reason, location)
    suspend fun complete(id: String, input: CompleteDeliveryInput): CaptainDelivery = api.completeDelivery(id, input)

    suspend fun earnings(range: DateRanges.Range): Earnings = api.earnings(range.fromIso, range.toIso)
    suspend fun payouts(): List<Settlement> = api.payouts().sortedByDescending { it.periodEnd }

    suspend fun updateLocale(locale: String) = api.updateMe(ProfileUpdate(locale = locale))

    fun clear() { _profile.value = null }
}
