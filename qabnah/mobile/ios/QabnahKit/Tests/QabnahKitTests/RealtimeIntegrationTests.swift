import XCTest
@testable import QabnahKit

/// Opt-in: runs only when `QABNAH_WS_TEST_URL` points at a server speaking the realtime protocol,
/// e.g. `Tests/ws_test_server.py` (see its header) or the real backend with a valid token in
/// `QABNAH_WS_TEST_TOKEN`.
final class RealtimeIntegrationTests: XCTestCase {
    func testSubscribeReceiveReconnectAndResubscribe() async throws {
        guard let raw = ProcessInfo.processInfo.environment["QABNAH_WS_TEST_URL"], let url = URL(string: raw) else {
            throw XCTSkip("set QABNAH_WS_TEST_URL to run")
        }
        let token = ProcessInfo.processInfo.environment["QABNAH_WS_TEST_TOKEN"] ?? "T1"
        let client = RealtimeClient(url: url, pingInterval: 2, pongTimeout: 10) { token }
        let events = client.events()
        await client.subscribe("order:o1")
        await client.start()

        // Expect the event from connection #1, a server-side drop, then a resubscribed event from #2.
        let collector = Task { () -> [RealtimeEvent] in
            var received: [RealtimeEvent] = []
            for await e in events where e.channel == "order:o1" {
                received.append(e)
                if received.count == 2 { break }
            }
            return received
        }
        let timeout = Task {
            try await Task.sleep(nanoseconds: 20_000_000_000)
            collector.cancel()
        }
        let got = await collector.value
        timeout.cancel()

        XCTAssertEqual(got.count, 2, "expected an event before and after reconnect")
        XCTAssertEqual(got.map(\.id), [1, 2])
        XCTAssertEqual(got.first?.name, RealtimeEventName.deliveryLocation)
        let loc = try XCTUnwrap(got.last).decodeData(DeliveryLocationEventData.self)
        XCTAssertEqual(loc.lat, 23.6, accuracy: 0.0001)

        let state = await client.state
        XCTAssertEqual(state, .connected)
        let sent = await client.sendLocation(LocationPing(lat: 23.61, lng: 58.41, heading: 10, speed: 5, accuracy: 4))
        XCTAssertTrue(sent)

        await client.stop()
        let stopped = await client.state
        XCTAssertEqual(stopped, .idle)
    }
}
