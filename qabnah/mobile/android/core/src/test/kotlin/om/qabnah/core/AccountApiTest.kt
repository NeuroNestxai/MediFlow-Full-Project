package om.qabnah.core

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import om.qabnah.core.account.DataExport
import om.qabnah.core.api.ApiClient
import om.qabnah.core.api.ApiException
import om.qabnah.core.api.InMemoryTokenStore
import om.qabnah.core.api.QabnahApi
import om.qabnah.core.api.StoredTokens
import om.qabnah.core.model.AccountDeletion
import om.qabnah.core.model.DeliveryStatus
import om.qabnah.core.model.LatLng
import om.qabnah.core.util.MapRoute
import org.junit.After
import org.junit.Before
import java.time.LocalDate
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** `GET /me/export`, `POST /me/delete`, `POST /me/devices(/unregister)` and the related pure helpers. */
class AccountApiTest {
    private lateinit var server: MockWebServer
    private val store = InMemoryTokenStore()
    private lateinit var client: ApiClient
    private lateinit var api: QabnahApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        store.write(StoredTokens("access", "refresh", 1_000_000L + 600_000))
        client = ApiClient(
            baseUrl = server.url("/v1").toString(),
            tokenStore = store,
            okHttp = OkHttpClient.Builder().readTimeout(5, TimeUnit.SECONDS).build(),
            clock = { 1_000_000L },
        )
        api = QabnahApi(client)
    }

    @After
    fun tearDown() = server.shutdown()

    @Test
    fun `exports my data as JSON and pretty-prints it for saving`() = runBlocking<Unit> {
        server.enqueue(MockResponse().setBody(Fixtures.read("me_export.json")).setHeader("Content-Type", "application/json"))
        val export = api.exportMyData()
        val req = server.takeRequest()
        assertEquals("GET", req.method)
        assertEquals("/v1/me/export", req.path)
        assertEquals("Bearer access", req.getHeader("Authorization"))
        assertEquals("QB100001", export.jsonObject["orders"]!!.jsonArray[0].jsonObject["number"]!!.jsonPrimitive.content)

        val text = DataExport.toPrettyJson(export)
        assertTrue(text.contains("\n"), "pretty-printed")
        assertEquals(export, Json.parseToJsonElement(text))
        assertEquals("qabnah-my-data-2026-11-17.json", DataExport.fileName(LocalDate.of(2026, 11, 17)))
    }

    @Test
    fun `delete account sends confirm DELETE and clears the session on 204`() = runBlocking<Unit> {
        server.enqueue(MockResponse().setResponseCode(204))
        api.deleteAccount()
        val req = server.takeRequest()
        assertEquals("POST", req.method)
        assertEquals("/v1/me/delete", req.path)
        assertEquals("""{"confirm":"DELETE"}""", req.body.readUtf8())
        assertNull(store.read())
        assertFalse(client.signedIn.value)
    }

    @Test
    fun `delete account 409 keeps the session and carries the server message`() = runBlocking<Unit> {
        server.enqueue(
            MockResponse().setResponseCode(409).setBody(
                """{"error":{"code":"conflict","message":"You have an active order. Try again once it is delivered.","details":{}}}""",
            ),
        )
        val e = assertFailsWith<ApiException.Conflict> { api.deleteAccount() }
        assertEquals("conflict", e.code)
        assertEquals("You have an active order. Try again once it is delivered.", e.message)
        assertNotNull(store.read())
        assertTrue(client.signedIn.value)
    }

    @Test
    fun `registers and unregisters the push token`() = runBlocking<Unit> {
        server.enqueue(MockResponse().setResponseCode(204))
        server.enqueue(MockResponse().setResponseCode(204))
        api.registerDevice("captain", "fcm-token-1")
        api.unregisterDevice("fcm-token-1")
        val reg = server.takeRequest()
        assertEquals("/v1/me/devices", reg.path)
        assertEquals("""{"platform":"android","app":"captain","token":"fcm-token-1"}""", reg.body.readUtf8())
        val unreg = server.takeRequest()
        assertEquals("/v1/me/devices/unregister", unreg.path)
        assertEquals("""{"token":"fcm-token-1"}""", unreg.body.readUtf8())
    }

    @Test
    fun `delete confirmation requires the exact word`() {
        assertTrue(AccountDeletion.isConfirmed("DELETE"))
        assertTrue(AccountDeletion.isConfirmed("  DELETE "))
        assertFalse(AccountDeletion.isConfirmed("delete"))
        assertFalse(AccountDeletion.isConfirmed("حذف"))
        assertFalse(AccountDeletion.isConfirmed(""))
    }

    @Test
    fun `map route heads to pickup then dropoff`() {
        val pickup = LatLng(23.588, 58.3829)
        val dropoff = LatLng(23.6, 58.41)
        assertEquals(pickup, MapRoute.nextStop(DeliveryStatus.ASSIGNED, pickup, dropoff))
        assertEquals(pickup, MapRoute.nextStop(DeliveryStatus.AT_PICKUP, pickup, dropoff))
        assertEquals(dropoff, MapRoute.nextStop(DeliveryStatus.PICKED_UP, pickup, dropoff))
        assertEquals(dropoff, MapRoute.nextStop(DeliveryStatus.AT_DROPOFF, pickup, dropoff))
        assertEquals(pickup, MapRoute.nextStop(DeliveryStatus.RETURNING, pickup, dropoff))
        assertNull(MapRoute.nextStop(DeliveryStatus.DELIVERED, pickup, dropoff))
        assertNull(MapRoute.nextStop(null, pickup, dropoff))

        val captain = LatLng(23.59, 58.39)
        assertEquals(listOf(captain, dropoff), MapRoute.remainingLeg(captain, dropoff))
        assertTrue(MapRoute.remainingLeg(null, dropoff).isEmpty())
        assertTrue(MapRoute.remainingLeg(captain, null).isEmpty())

        val path = listOf(LatLng(1.0, 1.0), captain)
        assertEquals(path, MapRoute.appendBreadcrumb(path, captain))
        assertEquals(3, MapRoute.appendBreadcrumb(path, dropoff).size)
        assertEquals(listOf(captain, dropoff), MapRoute.appendBreadcrumb(path, dropoff, max = 2))
    }
}
