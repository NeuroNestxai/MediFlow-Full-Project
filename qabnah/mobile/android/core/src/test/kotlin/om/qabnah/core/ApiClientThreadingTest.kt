package om.qabnah.core

import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.ResponseBody.Companion.asResponseBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import okio.ForwardingSource
import okio.buffer
import om.qabnah.core.api.ApiClient
import om.qabnah.core.api.InMemoryTokenStore
import om.qabnah.core.api.QabnahApi
import java.util.Collections
import java.util.concurrent.Executors
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * View models call the API from the main thread. On Android, reading a response body there throws
 * `NetworkOnMainThreadException` whenever the body is not already buffered — found on the emulator as an intermittent
 * "Something went wrong" screen. The client therefore reads bodies on its IO dispatcher, never on the caller's thread.
 */
class ApiClientThreadingTest {
    @Test
    fun responseBodyIsReadOnTheIoDispatcherNotOnTheCallingThread() {
        val server = MockWebServer()
        server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody("""{"items":[],"total":0}"""))
        server.start()
        val readThreads = Collections.synchronizedList(mutableListOf<String>())
        val http = OkHttpClient.Builder().addInterceptor { chain ->
            val response = chain.proceed(chain.request())
            val body = response.body!!
            val recording = object : ForwardingSource(body.source()) {
                override fun read(sink: Buffer, byteCount: Long): Long {
                    readThreads += Thread.currentThread().name
                    return super.read(sink, byteCount)
                }
            }
            response.newBuilder().body(recording.buffer().asResponseBody(body.contentType(), body.contentLength())).build()
        }.build()
        val executor = Executors.newSingleThreadExecutor { Thread(it, "qabnah-io-test") }
        try {
            val client = ApiClient(server.url("/v1").toString(), InMemoryTokenStore(), okHttp = http, ioDispatcher = executor.asCoroutineDispatcher())
            val page = runBlocking { QabnahApi(client).stores() }
            assertEquals(0, page.total)
            assertTrue(readThreads.isNotEmpty(), "the body was never read through the recording source")
            assertTrue(readThreads.all { it.startsWith("qabnah-io-test") }, "body read on: ${readThreads.distinct()}")
        } finally {
            executor.shutdown()
            server.shutdown()
        }
    }
}
