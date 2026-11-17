# Qabnah iOS (قبناه)

Two native SwiftUI apps plus a shared Swift package:

| Target | What it is | Bundle id |
|---|---|---|
| `QabnahConsumer` | Customer app: stores, cart & checkout, orders, live tracking, send a parcel (C2C), account | `om.qabnah.consumer` |
| `QabnahCaptain` | Courier app: onboarding & documents, online toggle, offers, active delivery, earnings | `om.qabnah.captain` |
| `QabnahKit` (Swift package) | Models (mirror `API_CONTRACT.yaml`), `APIClient`, `TokenStore`, `RealtimeClient`, money/locale helpers, cart & option rules. Foundation-only, builds on Linux. | — |
| `SharedUI/` | SwiftUI code compiled into **both** app targets (theme, auth flow + sign-in sheet, route map, push registration & notification routing, support tickets, data export / account deletion, session store). | — |

iOS 16+, SwiftUI, async/await. Arabic-first (RTL) with an in-app ar/en toggle.

```
mobile/ios/
  project.yml                 XcodeGen spec (both apps depend on the local package QabnahKit)
  QabnahKit/                  Package.swift, Sources/QabnahKit/{Models,Networking,Realtime,Support}, Tests/
  SharedUI/                   shared SwiftUI sources (added to both targets)
  QabnahConsumer/             Sources/, Resources/{Assets.xcassets, en.lproj, ar.lproj}, Info.plist, entitlements
  QabnahCaptain/              same layout
  Fonts/                      IBM Plex Sans Arabic + IBM Plex Sans (.ttf, OFL) — resources of both apps, listed in UIAppFonts
  QabnahScreens/              XCUITest screenshot tests (target + scheme `QabnahScreens`)
  scripts/gen_strings.py      generates Localizable.strings / InfoPlist.strings (en + ar) and checks key coverage
```

## Generate and open the Xcode project

```bash
brew install xcodegen
cd qabnah/mobile/ios
xcodegen generate          # writes Qabnah.xcodeproj (git-ignored)
open Qabnah.xcodeproj
```

Pick the `QabnahConsumer` or `QabnahCaptain` scheme. To run on a device set your team in Xcode
(Signing & Capabilities) or add `DEVELOPMENT_TEAM` to `project.yml`.

Both targets ship an `aps-environment` entitlement for APNs. If your team cannot sign push
(e.g. a free personal team), delete the `CODE_SIGN_ENTITLEMENTS` line for that target in
`project.yml` and regenerate; push registration is optional and failures are ignored
(unsigned CI builds with `CODE_SIGNING_ALLOWED=NO` are unaffected).

## Point the apps at a backend

The base URL comes from the Info.plist key `QABNAH_API_BASE_URL`, filled from the build setting of
the same name in `project.yml` (default `http://localhost:4000/v1`, the docker-compose backend).
The WebSocket URL is derived from it (`ws://…/v1/realtime`, `wss://` for https).

* **Simulator:** `localhost` reaches the Mac, so the default works once `docker compose up` is running.
* **Physical device:** `localhost` is the phone. Set `QABNAH_API_BASE_URL` to your Mac's LAN IP, e.g.
  `http://192.168.1.20:4000/v1` (in `project.yml` then `xcodegen generate`, or in the target's
  Build Settings), and make sure the phone is on the same Wi-Fi. ATS allows local networking
  (`NSAllowsLocalNetworking`); if your setup still blocks plain `http` to a LAN IP, add an ATS
  exception for that host in a local, uncommitted change.
* **Release:** there is no production API URL yet. Set `QABNAH_API_BASE_URL` for the Release
  configuration before archiving.

### Signing in during development (OTP)

Both apps sign in with phone + SMS OTP (`POST /auth/otp/request` → `POST /auth/otp/verify`).
When the backend runs with `OTP_DEV_ECHO=true` (development only — the server refuses it in
production) the response contains `devCode`; the apps then show the code in a small yellow
"Dev server code" banner on the OTP screen so you don't need a real SMS.
Omani mobiles only: 8 digits starting with 9 or 7 (the `+968` prefix is added for you).

## Design System v2 — "Night & Sand"

Both apps follow `qabnah/docs/DESIGN_SYSTEM.md`. The foundation lives in `SharedUI/`:

* **`Theme.swift`** — `QTheme` tokens. Fixed brand colours (night, night-2, primary, saffron, sand…) and
  semantic colours that resolve per colour scheme: `background` (sand / night), `surface` (white / night-2),
  `ink`, `muted`, `line`, `tint` and `cta` (primary / saffron), status colours. The **consumer app runs in the
  light scheme, the captain app in the dark scheme** (`UIUserInterfaceStyle` + `preferredColorScheme`), so shared
  screens need no branching. Radii 10/12/16/24, the 4-pt spacing grid, `qElevation1()` / `qElevation2()`,
  `card()`, and the button styles: `PrimaryButtonStyle` (primary fill; saffron with ink text on night; optional
  merchant brand colour), `SaffronButtonStyle`, `SecondaryButtonStyle`, `DestructiveButtonStyle`,
  `TertiaryButtonStyle`.
* **`Typography.swift`** — `qFont(.display/.h1/.h2/.h3/.body/.small/.micro)` picks IBM Plex Sans Arabic or
  IBM Plex Sans from the view's locale, scaled with Dynamic Type; `tabular:` for prices and timers. The fonts
  are bundled from `Fonts/` (downloaded from the IBM Plex repository, SIL OFL 1.1, licence in `Fonts/OFL.txt`),
  registered through `UIAppFonts`, and registered again at run time if that failed; when a face is missing the
  system font is used. `QAppearance` styles navigation bars, tab bars (saffron dot on the selected consumer
  tab), segmented controls and page dots.
* **`QPhoto.swift`** — `QPhoto` / `QPhotoBox` (AsyncImage with shimmer skeleton and cross-fade),
  `QPhotoPlaceholder` (the branded night-2 → primary-deep gradient with an outlined glyph, tinted with the
  merchant's colour on storefronts), `QCoverScrim`, `QLogoChip`.
* **`Components.swift`** — `QPrice` (bold tabular amount, smaller muted currency), `StatusPill` (with dot),
  skeletons (`QShimmer`, `QSkeleton`, `LoadingView`), text-only empty states with an action, `QStepProgress`,
  `QStepper`, `QChoiceRow`, `QIconAction`, `QNightBar` (sticky night CTA bar), `QForm` / `QList`, `qField()`,
  `qSheet()`.
* **`MapViews.swift`** — muted tiles (dark in the captain app), route = 4 pt saffron line with white casing,
  pickup = green pin, drop-off = saffron dot, captain = white dot with a heading wedge.

Screens:

* **Consumer** — Home (greeting + location pill, search, featured-stores carousel, category chips with
  photos, store cards with 16:9 cover / logo chip / open pill / meta row, floating night cart bar with the
  saffron CTA), Storefront (full-bleed cover with scrim; the header turns solid with sticky category tabs once
  the cover has scrolled away; product rows with a leading photo and a round add button in the store's brand
  colour), product sheet (16:10 photo, option rows, stepper, sticky add bar with the live price), cart,
  checkout in three steps, orders, order detail (status, PIN on a night card, captain card, vertical timeline),
  live tracking (map on top, bottom panel with status / ETA / captain), Send a parcel as a three-step wizard,
  Account.
* **Captain** (night) — map-first Home with the giant online control, today's earnings strip, active jobs and
  offers; offer as a full-height sheet with a saffron countdown ring and the earning as the big figure; active
  delivery with step progress, large navigate / call / WhatsApp buttons and one primary action; completion with
  four PIN boxes; earnings with a period selector and a Swift Charts bar chart; onboarding checklist and
  document cards.

Content rules kept: no invented content (the Home carousel and the category photos are real stores' covers;
ratings show only when the API returns a count), no emoji or illustrations, one language per label, digits in
the reader's language.

## Screenshot UI tests (`QabnahScreens`)

`QabnahScreens/QabnahScreensTests.swift` launches both apps by bundle id in Arabic on a simulator, walks the
main flows against the local backend (seeded data, `OTP_DEV_ECHO=true`) and writes a PNG per screen:

```bash
xcodegen generate
TEST_RUNNER_QABNAH_SHOTS_DIR=/tmp/shots xcodebuild test -project Qabnah.xcodeproj -scheme QabnahScreens \
  -destination "platform=iOS Simulator,name=iPhone 16" CODE_SIGNING_ALLOWED=NO
```

Files are named `consumer-01-home.png` … `captain-08-profile.png` and also attached to the test report. Every
step is best effort (a missing control is logged as `missing: <id>` and the flow continues). The accessibility
identifiers the tests rely on are listed at the top of the test file.

## QabnahKit

* `APIClient` — `async`/`await` over `URLSession`; `Authorization: Bearer`; refreshes on 401 or when
  the token is about to expire via `POST /auth/refresh`, **single-flight** (concurrent 401s share one
  refresh; a rejected refresh clears the session and calls `onSessionExpired`). Non-2xx responses
  decode the contract error envelope into `APIError.server(status, code, message, details)`.
  `Accept-Language` follows the in-app language. Multipart `uploadFile` for `POST /files`.
  Mutating order calls carry an `Idempotency-Key` (stable per request body, so a retry after a
  timeout can't create a second order).
* `TokenStore` — Keychain (`#if canImport(Security)`, after-first-unlock so the captain app can
  refresh in the background) with an in-memory fallback.
* `RealtimeClient` (actor) — `URLSessionWebSocketTask`; ref-counted `subscribe`/`unsubscribe`,
  re-subscribes after reconnect, exponential backoff with jitter (1–30 s), `{"type":"ping"}` every
  25 s and a recycle if nothing arrives for 60 s; `sendLocation` for captains. Fan-out via
  `events()` `AsyncStream`s.
* `Money` — integer baisa only. `OMR 2.500` (en) / `٢٫٥٠٠ ر.ع.` (ar), with grouping, and parsing of
  typed amounts (including Arabic-Indic digits).
* `ProductSelection` / `Cart` — variant groups are radio buttons, add-ons are checkboxes capped at
  `maxSelect`, `minSelect` validation, unit price = base + deltas, single-merchant cart.
* `AppConfig`, `Localizer` (runtime ar/en switch), phone normalisation, Muscat date ranges
  (week starts Sunday), navigation/WhatsApp/tel links.
* `PushPayload` / `AppRoute` / `DeepLink` (pure, unit-tested) — parses an APNs `userInfo` (custom keys
  at the top level, or FCM-style under `data`, as a dictionary or JSON string; numeric ids accepted) into
  `{type, orderId, deliveryId, offerId, ticketId, number, title, body}` and maps it to a screen per app;
  parses `qabnah://order/<id>`, `qabnah://order/<id>/tracking`, `qabnah://offer/<id>`,
  `qabnah://delivery/<id>`, `qabnah://ticket/<id>` (and `qabnah-captain://…`). In-app notifications use
  the same mapping.
* `DataExport` (file name + pretty-printing for `GET /me/export`), `AccountDeletionInput.isConfirmed`
  (typed "DELETE" check), `Order.invoiceUrl` / `Order.hasInvoice` (same rule as the server: paid,
  refunded or delivered), `APIClient.data(for:)` (raw bytes) and `APIClient.clearSession()`.

### Tests

```bash
cd QabnahKit
swift test
```

Fixtures in `Tests/QabnahKitTests/Fixtures/` are shaped after the contract schemas (Order, delivered Order
with `invoiceUrl`, Storefront, Offer, CaptainProfile, Tracking, CaptainDelivery, Me, `/me/export`, AuthResult,
Earnings, notifications, ticket, error envelope, APNs and FCM-style push payloads). Tests cover decoding
(including unknown enum values and missing optional fields), round-trips, money formatting/parsing, request
building (incl. `/me/export`, `/me/delete`, `/me/devices[/unregister]`), single-flight refresh, session expiry,
multipart bodies, realtime message coding, channel ref-counting, cart/option rules, phone and link helpers,
date presets, backoff, push payload → route tables for both apps, deep-link parsing/round-trips, the
deletion 409 envelope, export file naming and invoice visibility.

`RealtimeIntegrationTests` is opt-in and talks to a real WebSocket server:

```bash
python3 Tests/ws_test_server.py 8765 &      # stdlib-only test server speaking the realtime protocol
QABNAH_WS_TEST_URL=ws://127.0.0.1:8765/v1/realtime swift test --filter RealtimeIntegrationTests
```

## App notes

* **Language:** Arabic by default; toggle on the sign-in screen and in Account/Profile. Strings are
  looked up from the selected `.lproj` at runtime and the layout direction flips immediately.
  After changing copy, edit `scripts/gen_strings.py` and run
  `python3 scripts/gen_strings.py .` (fails if a key used in code is missing).
  Fonts are the bundled IBM Plex Sans Arabic / IBM Plex Sans (see "Design System v2").
* **Consumer payments:** `POST /orders` (or `/shipments`) → for online payment `POST /orders/{id}/checkout`
  with `returnUrl = qabnah://payment-return?orderId=…` → `SFSafariViewController` → on close the app
  polls `GET /orders/{id}` (2 s, up to 60 s) until `paymentStatus` changes. The result is never
  taken from the redirect itself.
* **Tracking:** subscribes to `order:<id>` and also polls `GET /orders/{id}/tracking` every 10 s. ETAs
  are labelled approximate.
* **Captain location:** while online, standard + significant-change updates (background mode
  `location`), sent over the socket at most every 5 s with `POST /captain/location` as fallback.
  Offers arrive via `captain:me` and a 5 s poll of `GET /captain/offers`. Accepting an offer closes the
  offer card and opens the active-delivery screen on Home.
* **Guest browsing (consumer):** Home and storefronts work without an account (`/stores`,
  `/stores/{slug}`, `/zones` are public) and the cart is kept. Checkout, Send, Orders and Account present
  the OTP sign-in as a sheet; after signing in the app continues to where the user was going (checkout,
  the chosen tab, or a tapped notification / deep link).
* **Push (APNs):** permission is requested right after sign-in, not at launch. The token goes to
  `POST /me/devices` (`platform: ios`, `app: consumer|captain`), is re-sent on launch/foreground when
  already authorized, and is removed with `POST /me/devices/unregister` on sign-out (before
  `/auth/logout`). `UNUserNotificationCenterDelegate` shows banners in the foreground; a tap routes via
  `PushPayload.route(for:)`: consumer → order detail, live tracking (`delivery.assigned` /
  `delivery.picked_up`) or support ticket; captain → offer card, active delivery, documents or ticket.
* **Deep links:** both Info.plists register the `qabnah` scheme (the captain app also
  `qabnah-captain`, because iOS picks an arbitrary app when two register the same scheme); `.onOpenURL`
  uses the same router as push. A consumer link opened while signed out asks for sign-in first.
* **Maps:** `RouteMapView` (SharedUI) wraps `MKMapView`: pickup / dropoff / captain markers, the
  `Tracking.path` breadcrumbs (plus the latest live position) as a solid polyline, a dashed line from the
  captain to the next stop (pickup until picked up, then dropoff), auto-fit when the markers change and a
  re-fit button. Used in consumer tracking, the captain active delivery (own position, the trail driven
  while the screen is open, dashed line to the next stop) and the offer preview.
* **Your data (both apps):** Account / Profile → "Download my data" (`GET /me/export`, saved as a
  pretty-printed JSON file and handed to the share sheet; the temp file is deleted when it closes) and
  "Delete account" (type DELETE → `POST /me/delete`; a 409 `account_deletion_blocked` shows the server's
  reasons; on 204 the app clears the local session without calling `/auth/logout`).
* **Invoice (consumer):** order detail shows "Invoice" when `invoiceUrl` is present and the order is
  paid / refunded / delivered; the order is refetched first (the link is signed for ~30 min) and opened
  in `SFSafariViewController`.

## What was and wasn't compiled

**Update — verified on GitHub Actions (macOS 15 runner, run 43973216012, 2026-11-16):** `swift test` for
QabnahKit passed on macOS, `xcodegen generate` succeeded, and **both app schemes (QabnahConsumer, QabnahCaptain)
built successfully** with `xcodebuild … -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build`
(see `.github/workflows/qabnah-ci.yml`). Not yet done: running on a simulator/device, UI tests, signing, push.

This was written in a Linux container without macOS/Xcode.

* **QabnahKit: built and tested on Linux** with Swift 6.0.3 (Ubuntu's `swiftlang_6.0.3` .deb unpacked
  locally, Swift 5 language mode via `swift-tools-version:5.9`): `swift build` has no warnings,
  and `swift test` passes 52 tests (the opt-in realtime integration test is skipped by default).
  The build also has no warnings with `-strict-concurrency=complete`.
  The realtime integration test could **not** be run on that machine: Ubuntu 24.04's libcurl 8.5 is
  built without WebSocket support, which `URLSessionWebSocketTask` on Linux needs. Run it on a Mac.
* **SwiftUI app targets (`SharedUI/`, `QabnahConsumer/`, `QabnahCaptain/`): NOT compiled.** SwiftUI,
  UIKit, MapKit, CoreLocation, PhotosUI and SafariServices are unavailable on Linux. The sources were
  only syntax-checked (`swift-frontend -parse`), which does not catch type errors. Expect to fix
  some compile errors on the first Xcode build.
* `project.yml` was not run through XcodeGen. Its YAML parses, but the generated project was never opened.
* `.strings` files were parsed with Foundation's property-list parser; en/ar have the same keys and
  matching format specifiers.

**Update 2026-11-17 (push, deep links, guest browsing, route maps, data export/deletion, invoices):**
QabnahKit was built and tested on Linux again (Swift 6.0.3): `swift build` has no warnings (also with
`-strict-concurrency=complete`) and `swift test` runs 70 tests, 0 failures (the opt-in realtime integration
test skipped). The app sources were only syntax-checked with `swift-frontend -parse`; the macOS CI build of
both schemes has to confirm they type-check.

**Update 2026-11-17 (Design System v2 redesign + screenshot UI tests):** QabnahKit on Linux: `swift build`
clean, `swift test` 74 tests, 0 failures (1 skipped). The redesigned app sources and the UI tests were only
syntax-checked with `swift-frontend -parse` here; the macOS CI build has to confirm they type-check, and nothing
was looked at on a simulator from this machine — spacing and scroll behaviour need a visual pass on the
CI screenshots.

## Known gaps / TODO

* The redesign has not been seen running: review the CI screenshots (both languages, Dynamic Type sizes).
* Storefront: the selected category tab follows taps, not the scroll position.
* Map tiles are Apple Maps with the muted style; the design system asks for a production tile provider.

* Run on the simulator / a device against the real backend; UI tests. Push delivery was not tested
  end-to-end (needs a signed build with the push capability and the backend's APNs credentials).
* The route line is the captain's breadcrumbs plus a straight dashed line to the next stop, not a
  road route (no directions request).
* Both apps register `qabnah://`; with both installed iOS picks one for external links. Use
  `qabnah-captain://` for captain links; push taps are unaffected (they are routed in-process).
* Notification actions (e.g. accept an offer from the banner), badge counts and rich notifications are
  not implemented.
* No call masking: captain phone / WhatsApp buttons use the number the API returns, which the
  server masks or hides by delivery state.
* Captain offer card: the dropoff pin is rounded by the server until acceptance, as the contract says.
* The cart is persisted in `UserDefaults` and is not tied to the signed-in user (cleared on sign-out;
  kept across guest → signed-in).
