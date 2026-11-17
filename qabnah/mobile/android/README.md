# Qabnah Android apps

Two native apps in Kotlin + Jetpack Compose (Material 3), Arabic (RTL) by default with an in-app language switch:

| App | applicationId | Bottom navigation |
|---|---|---|
| **Qabnah** (consumer) | `om.qabnah.consumer` | Home · Send · Orders · Account |
| **Qabnah Captain** (courier) | `om.qabnah.captain` | Home · Deliveries · Earnings · Profile |

The API contract (`../../API_CONTRACT.yaml`) is the source of truth for endpoints, field names and the WebSocket protocol.
The UI follows **Design System v2 "Night & Sand"** (`../../docs/DESIGN_SYSTEM.md`): the consumer app is the light
"sand" palette and photo-first, the captain app is the dark "night" palette. See [Design](#design).

## Modules

```
mobile/android/
  settings.gradle.kts      :core always; :android-common, :consumer, :captain only when an Android SDK is configured
  build.gradle.kts         AGP is put on the classpath only when an SDK is configured (so :core builds anywhere)
  gradle/libs.versions.toml
  core/                    pure Kotlin/JVM, no Android dependency
    model/                 kotlinx.serialization models mirroring the contract (lenient: unknown enum values -> UNKNOWN)
    api/                   ApiClient (OkHttp + coroutines, Bearer auth, single-flight refresh, error envelope -> ApiException),
                           QabnahApi (typed endpoints), TokenStore
    realtime/              RealtimeClient (WebSocket subscribe/unsubscribe, ping, reconnect with backoff, Flow of events)
    money/                 Money (OMR 2.500 / ٢٫٥٠٠ ر.ع.), Digits, Units
    cart/                  option rules (variant radios / addon checkboxes, min/max), live price, single-merchant cart,
                           CartCodec (JSON persistence)
    push/                  DeepLinks (qabnah:// parse/format), PushPayload + PushRouting (push data -> channel, deep link, id)
    account/               DataExport (pretty JSON + file name for GET /me/export)
    util/                  Omani phone normalisation, wa.me links, geo/ETA, brand colours, availability validation, date presets,
                           MapRoute (next stop, dashed remaining leg, breadcrumbs)
    src/test/              JUnit tests (fixtures shaped like the contract, MockWebServer for HTTP + WebSocket)
  android-common/          shared Android library: Design System v2 theme (sand + night colour schemes, bundled IBM Plex
                           Sans Arabic / IBM Plex Sans in res/font, shapes 10/16/24) and components (ui/components/Design.kt:
                           QButton / QSecondaryButton / QTextButton, QPhoto, QStoreLogo, QPrice, StatusPill, skeletons,
                           QBottomSheet / QDockedSheet / QNightBar, QNavigationBar, QSegmentedControl, QStepProgress…),
                           EncryptedSharedPreferences TokenStore, OTP sign-in,
                           osmdroid map (markers, solid + dashed polylines) + pin picker, location, intents (dial/WhatsApp/
                           navigation/Custom Tabs), uploads, support tickets + notifications screens, FCM push (manual
                           Firebase init, base FirebaseMessagingService, notifications), deep-link intent parsing,
                           "Download my data" / "Delete account" section, lifecycle-aware WhileStarted helper
  consumer/                Qabnah app
  captain/                 Qabnah Captain app (foreground location service, offers, proof of delivery)
  tools/typecheck/         SDK-less compile check of all app sources (see "What was verified")
```

Each app has: ViewModels exposing `StateFlow`, repositories over `:core`'s `QabnahApi` (no networking in composables),
loading / empty / error states with pull-to-refresh, and content descriptions on actionable icons.

## Design

Design System v2 "Night & Sand" (`docs/DESIGN_SYSTEM.md`) is implemented in `:android-common` and used by every screen.

- **Palettes** (`ui/theme/Theme.kt`): `QabnahTheme(QabnahPalette.SAND)` for the consumer app (sand page, white cards,
  green primary) and `QabnahTheme(QabnahPalette.NIGHT)` for the captain app (night background, night-2 surfaces,
  hairlines instead of shadows). The palette is fixed per app, not tied to the system dark mode; the activities set
  the system-bar icon colours to match. Only brand colours and their tints are used; status colours only for status.
- **Type**: IBM Plex Sans Arabic (Arabic UI) and IBM Plex Sans (English UI), weights 400/500/600/700, bundled as
  `android-common/src/main/res/font/ibm_plex_sans*_*.ttf` (SIL OFL 1.1, licence in `android-common/licenses/`).
  Scale: display 44/52 · h1 30/38 · h2 22/30 · h3 17/26 · body 15/24 · small 13/20 · micro 11/16; Arabic gets taller
  lines and no letter-spacing. Prices use `QPrice`: tabular numerals, weight 700, currency label at 0.75×.
- **Shape / elevation**: radius 10 (inputs, chips) · 16 (cards, photos) · 24 (sheets, hero media) · 12 (buttons);
  two soft ink-tinted shadow levels on sand (`Modifier.qElevation`), hairlines on night.
- **Photo-first**: `QPhoto` (Coil) shimmers while loading and falls back to the branded placeholder (night-2 →
  primary-deep gradient, outlined glyph at 40% white, tinted with the merchant's brand colour on storefronts) — never a
  grey box or a letter. `QStoreLogo` is the only allowed letter avatar (merchant initial on their brand colour).
- **Buttons**: primary = brand fill on sand, **saffron fill with ink text on night** (`QButton`); secondary = surface
  with hairline; tertiary = text. One saffron element per view (cart bar CTA, go online, accept, the primary delivery
  action).
- **Loading / empty / error**: skeleton shimmer for full pages (no spinners), one line of text plus the fixing action
  for empty states, no illustrations.
- **No invented content**: ratings appear only when the API reports rating counts; the home hero carousel and the
  category-chip photos use covers of real stores from `GET /stores`; there are no fake banners, badges or counters.
- **Language separation**: every label comes from `values/` (en) or `values-ar/` (ar); currency labels, digits, week-day
  names and package sizes follow the UI language. PINs are always shown left-to-right in Latin digits (the captain types
  them as shown).

Consumer screens: Home (location pill, large title, search, hero carousel of open stores, category chips with photos,
store cards with 16:9 cover + logo chip + open pill + meta row), Storefront (full-bleed cover with scrim, top bar that
turns solid on scroll, category tabs that pin under it, product rows with a leading 4:3 photo and a circular add button
in the store's brand colour), product bottom sheet (16:10 photo, option rows, stepper, sticky add bar with the live
price), floating night cart bar with the saffron CTA, checkout in four numbered steps, order detail (status + one
primary action, PIN card with four boxes, captain card, vertical timeline), live tracking (full-screen map + docked
sheet), Send-a-parcel three-step wizard, Account (profile card, grouped rows). Bottom bar: white, active tab in the
brand colour with a saffron dot.

Captain screens: map-first Home (dark map, docked sheet with the giant online/offline control, today's earnings strip,
onboarding checklist, current deliveries), offer as a full-height sheet (saffron countdown ring, big earning figure,
pickup → drop-off rows, saffron Accept / secondary Decline), active delivery (map, four-step progress, next stop first
with large Navigate / Call / WhatsApp buttons, one saffron primary action in a sticky bar, fail / release as text
actions), completion (four large PIN boxes, cash collected, photo), Earnings (period selector, Canvas bar chart per
4-hour block today / per day for week and month, balance, ledger), onboarding (checklist + document cards with status
pills), Profile.

Maps: OSM raster tiles with a colour filter per palette (muted light for the consumer, dark for the captain), route =
4 dp saffron line with a casing, pickup = green pin, drop-off = saffron dot, captain = white dot with a heading wedge.

## Build and run

Requirements: Android Studio (Meerkat or newer) with Android SDK 35, JDK 17+.

1. Open `mobile/android` in Android Studio. It writes `local.properties` with `sdk.dir`; that is what makes
   `settings.gradle.kts` include the app modules. (Without an SDK only `:core` is configured.)
2. Start the backend (`docker compose up` in the repo root, API on port 4000).
3. Run the `consumer` or `captain` configuration on an emulator, or from the command line:
   ```
   ./gradlew :consumer:installDebug
   ./gradlew :captain:installDebug
   ```

### API base URL

`BuildConfig.API_BASE_URL` comes from the Gradle property `qabnah.apiBaseUrl` (default in `gradle.properties`:
`http://10.0.2.2:4000/v1`, which is the host machine as seen from the Android emulator).

- Physical device on the same Wi-Fi: `./gradlew :consumer:installDebug -Pqabnah.apiBaseUrl=http://192.168.1.20:4000/v1`
- Cleartext HTTP is allowed **only in debug builds** (`src/debug/res/xml/network_security_config.xml`).
  Release builds are HTTPS-only, so set an `https://` URL for them, e.g. in `~/.gradle/gradle.properties`.
- The WebSocket URL is derived from it: `<base>/realtime?token=<accessToken>`.

### Signing in during development

Both apps sign in with `POST /auth/otp/request` → `POST /auth/otp/verify`. When the backend runs with
`OTP_DEV_ECHO=true`, the response contains `devCode`; the sign-in screen shows it in an amber debug banner so no SMS
provider is needed. Debug builds also show a banner with the API URL. A new account that skipped the optional name field
is asked for a name once (`PATCH /me`).

To try the captain app end to end, register in the app, upload documents, then approve the captain from the admin web
app (`captains:review`). Only `active` captains can go online.

### Payments

Online payment opens `checkoutUrl` from `POST /orders/{id}/checkout` in a Custom Tab (`returnUrl` is
`qabnah://payment-return?orderId=…`, handled by the consumer app). When the app resumes it polls `GET /orders/{id}`;
the result shown is always the server's. In development the mock provider's hosted page (`/v1/mock-pay/{id}`) lets you
choose paid / failed.

### Maps

osmdroid with OpenStreetMap tiles; no API key. The tile cache lives in the app cache directory. The public
`tile.openstreetmap.org` servers are fine for development but their usage policy does not allow production app traffic:
configure a commercial or self-hosted tile source before release (`OsmConfig` / `OsmMap` in `:android-common`).

### Push notifications (FCM) – optional

`com.google.firebase:firebase-messaging` (24.1.0, `:android-common`) is a dependency, but **without** the
google-services Gradle plugin and **without** a `google-services.json`. Each app initialises Firebase itself in
`Application.onCreate` (`Fcm.initialize`) from four BuildConfig fields; when any of them is empty (the default) Firebase
is never initialised and push is skipped entirely (no token, no `POST /me/devices`, no permission prompt).

Configure it per machine / CI, never in git. Put the values (from Firebase console → Project settings → Your apps →
the Android app) in `local.properties`, `~/.gradle/gradle.properties` or `-P…`:

```
qabnah.fcm.projectId=qabnah-prod            # FCM_PROJECT_ID  (project_id)
qabnah.fcm.senderId=123456789012            # FCM_SENDER_ID   (project_number)
qabnah.fcm.apiKey=AIza...                   # FCM_API_KEY     (current_key)
qabnah.consumer.fcm.appId=1:123456789012:android:abc...   # FCM_APP_ID of om.qabnah.consumer (mobilesdk_app_id)
qabnah.captain.fcm.appId=1:123456789012:android:def...    # FCM_APP_ID of om.qabnah.captain
```

Every key can also be given per app (`qabnah.<consumer|captain>.fcm.<field>`), which wins over the shared
`qabnah.fcm.<field>`. Register both application ids as Android apps in the same Firebase project.

What happens when configured:
- After sign-in (and on every start while signed in) the token is sent with `POST /me/devices`
  (`platform=android`, `app=consumer|captain`); `onNewToken` re-registers while signed in (`PushManager`).
- Sign-out calls `POST /me/devices/unregister {token}` before `POST /auth/logout`, then deletes the FCM token.
  On session expiry or account deletion the token is only forgotten locally (no session to unregister with).
- `ConsumerMessagingService` / `CaptainMessagingService` (subclasses of `QabnahMessagingService`) turn the contract's
  payload (`title`, `body`, data `{type, orderId?, deliveryId?, offerId?, ticketId?, number?}`) into a notification on
  channel `orders`, `support` or (captain) the high-importance `offers` channel, with a PendingIntent that opens the
  matching deep link. Mapping (pure Kotlin, tested): `:core` `PushRouting`.
- Captain `offer.created`: refreshes `GET /captain/offers`; while the app is visible the offer overlay shows it,
  otherwise a full-screen/heads-up alert (same notification id as the socket-driven alert, so they never stack).
- Notification messages that FCM displays itself while the app is in the background open the launcher activity with the
  data map as extras; `DeepLinkIntents.parse` routes those the same way. The default icon/channel for them are set in
  `android-common`'s manifest.
- Consumer (Android 13+) asks for `POST_NOTIFICATIONS` once after sign-in; the captain asks on its Permissions screen.

### Deep links

`qabnah://` intent filters in both manifests (`singleTask` activity, handled in `onCreate` and `onNewIntent`) feed a
`PendingDeepLink`, which the root composable routes once the NavHost exists:

| Link | Consumer | Captain |
|---|---|---|
| `qabnah://order/<orderId>` | order detail (`?track=1`, set for `delivery.assigned` / `delivery.picked_up` pushes, also opens live tracking) | – |
| `qabnah://offer/<offerId>` | – | Home + refreshes offers; the overlay shows it if it is still pending |
| `qabnah://delivery/<deliveryId>` | – | active delivery screen |
| `qabnah://ticket/<ticketId>` | support ticket | support ticket |
| `qabnah://payment-return?orderId=…` | ignored while on the payment screen (it polls on resume), else order detail | – |

Ids must match `[A-Za-z0-9_-]{1,64}`; anything else is ignored. Try with
`adb shell am start -a android.intent.action.VIEW -d "qabnah://order/<id>" om.qabnah.consumer`.
`ticket` is claimed by both apps, so with both installed Android may ask which one to use for a link typed by hand
(notification taps are explicit intents and never ask).

### Guest browsing (consumer)

Home, search and storefronts work signed out (`/stores`, `/stores/{slug}`, `/zones` are public), and the cart works
too. Checkout, the Send / Orders / Account tabs and every order / tracking / ticket / address screen render the OTP
sign-in in place (`RequireSignIn`); as soon as the user is signed in the same destination shows its content, so they
continue exactly where they were (e.g. checkout of the cart they built). Deep links into protected screens behave the
same way.

### Cart

The cart (single merchant) is saved to SharedPreferences as JSON (`CartCodec`) on every change, so it survives process
death and restarts (guest carts included). Carts older than 7 days, unreadable data or a different format version start
empty. Stored prices are only a display snapshot; checkout re-quotes with `POST /orders/quote`. Signing out clears it.

### Account: data export, deletion, invoices

Both apps (consumer Account tab, captain Profile tab) have a Privacy section:
- **Download my data**: `GET /me/export` → pretty-printed JSON → the system "create document" picker (Storage Access
  Framework, suggested name `qabnah-my-data-<date>.json`).
- **Delete account**: the user must type `DELETE`, then `POST /me/delete {confirm:"DELETE"}`. A 409 (active orders /
  deliveries, unsettled balance) shows the server's message in the dialog and keeps the user signed in; a 204 clears the
  local session (and push token, cart, captain tracking), which returns the app to signed-out mode.

Consumer order detail shows an **Invoice** button when `Order.invoiceUrl` is present; it opens the signed link in a
Custom Tab (no auth header; valid ~30 min from the last load, pull to refresh renews it).

### Maps and polling

Tracking (consumer) and the active delivery (captain) draw `Tracking.path` as a solid osmdroid `Polyline`, plus a dashed
line from the captain to the next stop (pickup until picked up / while returning, then drop-off), and re-fit the camera
to all markers and lines on first data, the first captain fix and every change of stop. The captain screen gets the path
from `GET /orders/{orderId}/tracking` (the backend allows the assigned captain) and appends this device's own fixes.
Polling and socket subscriptions run under `repeatOnLifecycle(STARTED)` (`WhileStarted`), i.e. only while the screen is
the visible destination and the app is in the foreground.

### Captain app permissions

| Permission | Why | When requested |
|---|---|---|
| `ACCESS_FINE_LOCATION` (+ coarse) | required to go online and stream location | Permissions screen, before going online |
| `POST_NOTIFICATIONS` (Android 13+) | offer alerts in the background, "online" notification | Permissions screen (recommended) |
| `ACCESS_BACKGROUND_LOCATION` (Android 10+) | optional; lets the OS restart tracking while online | Permissions screen (optional) |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` | `LocationService` (type `location`) while online | install time |
| `USE_FULL_SCREEN_INTENT` | offer over the lock screen (Android 14 restricts it; falls back to heads-up) | install time |

While online, `LocationService` sends a FusedLocation fix at most every 5 s over the WebSocket
(`{"type":"location",…}`), falling back to `POST /captain/location` when the socket is down. Offers arrive on
`captain:me` and are also polled from `GET /captain/offers` every 5 s.

### Release builds

`isMinifyEnabled = true` with keep rules for kotlinx.serialization in `android-common/consumer-rules.pro`. Signing is
not configured in the repo: add a `signingConfig` from a keystore kept outside git (CI secrets) before publishing.

## Tests

```
./gradlew :core:test
```

Runs without an Android SDK. Covers: decoding fixtures shaped like the contract (Order incl. `invoiceUrl`, Storefront,
Offer, CaptainProfile, CaptainDelivery, Tracking, Me, error envelope), lenient enums, request encoding, money formatting
(en/ar), OMR parsing, cart option validation and live price, phone/WhatsApp helpers, availability validation, date
presets, `ApiClient` against MockWebServer (Bearer header, 401 → refresh → retry, single-flight refresh under 8
concurrent requests, proactive refresh, failed refresh → session expired, error mapping, idempotency key, 204,
multipart upload), and `RealtimeClient` against a MockWebServer WebSocket (token, subscribe/unsubscribe, events,
reconnect with backoff and re-subscribe, location frames), `GET /me/export` (+ pretty JSON / file name),
`POST /me/delete` (body, 204 clears the session, 409 keeps it and carries the message), `POST /me/devices` and
`/me/devices/unregister` bodies, the DELETE confirmation rule, deep-link parsing/formatting (contract links, unsafe ids
rejected, round-trip), push payload decoding (data map and launch extras), push → channel / deep link / notification id
for both apps (fixtures `push_*.json`), cart persistence (round-trip, corrupt/future data, invalid lines, expiry,
unknown fields), map routing (next stop, dashed leg, breadcrumbs) and the earnings chart buckets (per day / per
4-hour block in Muscat time, earnings types only). 67 tests.

## What was verified (and what was not)

**Update — verified on GitHub Actions (ubuntu-latest with the Android SDK, runs 43973156920 and 43973216012, 2026-11-16):** `./gradlew :core:test` passed and **`:consumer:assembleDebug :captain:assembleDebug` built both
debug APKs successfully** (AGP configuration, resource linking and manifest merging included). The APKs are uploaded
as the `qabnah-android-debug-apks` workflow artifact. Not yet done: lint, R8 release build, device/emulator runs.

**Update 2026-11-17 (Design System v2 redesign of both apps):** written in the same SDK-less container.
`./gradlew :core:test` (67 tests) and `tools/typecheck/run.sh` pass (new stubs: `Font(resId)`, `SystemBarStyle`,
Coil's `AsyncImage` state callbacks; the generated `R` now includes `R.font` from `res/font` and rejects invalid
resource file names). **Not verified yet:** the AGP build with the new `res/font` files and theme parents, and how the
screens actually look on a device (no screenshots could be taken here): spacing, the storefront's pinned tabs, the
dark tile filter, Plex rendering and RTL mirroring need a visual pass on an emulator.

**Update 2026-11-17 (FCM, deep links, guest browsing, map polylines, privacy, cart persistence):** written in the same
SDK-less container. `./gradlew :core:test` (65 tests) and `tools/typecheck/run.sh` pass here (Firebase Messaging,
`repeatOnLifecycle`, `CreateDocument` and the extra NotificationCompat APIs are stubbed in `tools/typecheck/stubs`).
**Not verified yet:** the AGP build with the new `firebase-messaging:24.1.0` dependency and manifest entries (the
GitHub Actions Android job is the check), and any device run: push delivery with a real Firebase project, notification
taps, deep links via `adb`, the SAF save dialog, account deletion against the backend.

These modules were written in a container where `dl.google.com` (and therefore `maven.google.com`, which redirects
there) is blocked, so neither the Android SDK nor AGP/AndroidX could be downloaded.

- `./gradlew :core:test`: run here and passing.
- `tools/typecheck/run.sh`: run here and passing. It compiles **all** sources of `:core`, `:android-common`,
  `:consumer` and `:captain` together with the Kotlin 2.1.20 + Compose compiler against JetBrains Compose for Desktop
  1.8 (same API surface as Jetpack Compose 1.8 / Material3 1.3), Robolectric's `android-all` (API 35), osmdroid's
  real classes, and hand-written stubs for Google-Maven-only libraries (AppCompat, Activity, Core, Lifecycle,
  security-crypto, browser, exifinterface, Play services location, Coil, Firebase Messaging). It catches Kotlin/Compose errors, but the
  stubbed APIs are only as accurate as the stubs.
- **Not verified here:** an actual Gradle/AGP build of the app modules (AGP configuration, resource linking, manifest
  merging, R8, lint), and any run on a device or emulator. Expect to fix small issues on the first Android Studio sync.
  The resource XML was checked for well-formedness, and every `R.string`/`R.drawable` used in code was checked against
  the resource files (en and ar keys and format arguments match).

## Known gaps / TODO

- No offline cache: screens need the network (only the cart is persisted).
- The redesign has not been seen on a device yet (see "What was verified"); expect a round of visual fixes.
- Map tiles are still the public OSM raster tiles with a colour filter; a production provider with proper muted-light
  and dark styles is needed before release.
- The API has no category images, banners for the home page, product photos per order item or captain photos; the app
  uses store covers for category chips / the hero carousel and glyph avatars elsewhere.
- FCM has not been tested against a real Firebase project or device yet (see "What was verified"); without FCM_* values
  push is off and in-app notifications use `GET /me/notifications`.
- The data export is held in memory while the save picker is open; if the process is killed meanwhile, tap
  "Download my data" again.
- Captain map breadcrumbs come from `GET /orders/{id}/tracking` (tagged Consumer in the contract, but the backend
  allows the assigned captain); if that ever changes the captain map just shows the stops, live position and dashed leg.
- Proof-of-delivery and document photos are captured with the system camera app (no in-app camera / document cropping).
- Captain availability uses a two-step time input dialog; no visual week calendar.
- Real-time event payloads other than `delivery.location` and `offer.*` are treated as "something changed" and trigger
  a refetch, because the contract does not define their `data` shapes.
