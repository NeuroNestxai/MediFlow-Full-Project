package om.qabnah.captain.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import om.qabnah.core.api.ApiException
import om.qabnah.core.api.QabnahApi
import om.qabnah.core.model.CaptainDelivery
import om.qabnah.core.model.Offer
import om.qabnah.core.realtime.Channels
import om.qabnah.core.realtime.RealtimeClient
import om.qabnah.core.realtime.RealtimeEvents
import om.qabnah.core.realtime.offerId
import om.qabnah.core.realtime.offerOrNull
import java.time.Instant

/**
 * Pending offers while the captain is online: WebSocket `captain:me` (`offer.created/expired/cancelled`) plus
 * polling `GET /captain/offers` every 5 s, so a dropped socket never hides an offer for long.
 */
class OfferRepository(
    private val api: QabnahApi,
    private val realtime: RealtimeClient,
    private val scope: CoroutineScope,
) {
    private val _offers = MutableStateFlow<List<Offer>>(emptyList())
    val offers: StateFlow<List<Offer>> = _offers.asStateFlow()

    /** Emits when assignments/deliveries may have changed (accepted offer, `delivery.assigned`, status events). */
    private val _deliveriesChanged = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
    val deliveriesChanged: SharedFlow<Unit> = _deliveriesChanged.asSharedFlow()

    private var job: Job? = null

    fun start() {
        if (job?.isActive == true) return
        job = scope.launch {
            launch {
                while (isActive) {
                    refresh()
                    delay(POLL_MS)
                }
            }
            launch {
                realtime.channel(Channels.CAPTAIN_ME).collect { ev ->
                    when (ev.event) {
                        RealtimeEvents.OFFER_CREATED -> ev.offerOrNull()?.let(::upsert) ?: refresh()
                        RealtimeEvents.OFFER_EXPIRED, RealtimeEvents.OFFER_CANCELLED -> ev.offerId()?.let(::remove) ?: refresh()
                        RealtimeEvents.DELIVERY_ASSIGNED, RealtimeEvents.DELIVERY_STATUS_CHANGED, RealtimeEvents.ORDER_STATUS_CHANGED ->
                            _deliveriesChanged.tryEmit(Unit)
                    }
                }
            }
            launch {
                while (isActive) {
                    delay(1_000)
                    val now = System.currentTimeMillis()
                    _offers.update { list -> list.filter { expiresAtMs(it) > now } }
                }
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
        _offers.value = emptyList()
    }

    suspend fun refresh() {
        try {
            val now = System.currentTimeMillis()
            _offers.value = api.offers().filter { expiresAtMs(it) > now }.sortedBy { it.expiresAt }
        } catch (e: ApiException) {
            // Keep what we have; the next poll retries.
        }
    }

    /** `POST /captain/offers/{id}/accept`. A 409 means it expired or another captain took it. */
    suspend fun accept(id: String): CaptainDelivery {
        try {
            val delivery = api.acceptOffer(id)
            remove(id)
            _deliveriesChanged.tryEmit(Unit)
            return delivery
        } catch (e: ApiException.Conflict) {
            remove(id)
            throw e
        } catch (e: ApiException.NotFound) {
            remove(id)
            throw e
        }
    }

    suspend fun reject(id: String, reason: String?) {
        api.rejectOffer(id, reason)
        remove(id)
    }

    private fun upsert(offer: Offer) = _offers.update { list -> (list.filterNot { it.id == offer.id } + offer).sortedBy { it.expiresAt } }
    private fun remove(id: String) = _offers.update { list -> list.filterNot { it.id == id } }

    companion object {
        const val POLL_MS = 5_000L

        fun expiresAtMs(offer: Offer): Long = runCatching { Instant.parse(offer.expiresAt).toEpochMilli() }.getOrDefault(Long.MAX_VALUE)
    }
}
