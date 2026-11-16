# Qabnah Android apps

Two native apps in Kotlin + Jetpack Compose (Material 3), Arabic (RTL) by default with an in-app language switch:

| App | applicationId | Bottom navigation |
|---|---|---|
| **Qabnah** (consumer) | `om.qabnah.consumer` | Home · Send · Orders · Account |
| **Qabnah Captain** (courier) | `om.qabnah.captain` | Home · Deliveries · Earnings · Profile |

The API contract (`../../API_CONTRACT.yaml`) is the source of truth for endpoints, field names and the WebSocket protocol.

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
    cart/                  option rules (variant radios / addon checkboxes, min/max), live price, single-merchant cart
    util/                  Omani phone normalisation, wa.me links, geo/ETA, brand colours, availability validation, date presets
    src/test/              JUnit tests (fixtures shaped like the contract, MockWebServer for HTTP + WebSocket)
  android-common/          shared Android library: theme (brand tokens), EncryptedSharedPreferences TokenStore, OTP sign-in,
                           osmdroid map + pin picker, location, intents (dial/WhatsApp/navigation/Custom Tabs), uploads,
                           support tickets + notifications screens, push-token registration stub
  consumer/                Qabnah app
  captain/                 Qabnah Captain app (foreground location service, offers, proof of delivery)
  tools/typecheck/         SDK-less compile check of all app sources (see "What was verified")
```

Each app has: ViewModels exposing `StateFlow`, repositories over `:core`'s `QabnahApi` (no networking in composables),
loading / empty / error states with pull-to-refresh, and content descriptions on actionable icons.

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

### Push notifications (FCM) – optional, not wired

No `google-services.json` is in the repo and Firebase is not a dependency. Both apps call
`PushRegistration.register(api, app, pushTokens)` after sign-in; the default `NoPushTokenProvider` returns null, so
nothing is registered. To enable FCM:

1. Add the Firebase project's `google-services.json` to `consumer/` and/or `captain/` (keep it out of git).
2. Apply `com.google.gms.google-services` and add `com.google.firebase:firebase-messaging` to that app module.
3. Implement `PushTokenProvider` with `FirebaseMessaging.getInstance().token.await()`, assign it to `pushTokens` in the
   app container, and call `PushRegistration.register` from `FirebaseMessagingService.onNewToken` as well
   (`POST /me/devices` with `platform=android`).

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

Runs without an Android SDK. Covers: decoding fixtures shaped like the contract (Order, Storefront, Offer,
CaptainProfile, CaptainDelivery, Tracking, Me, error envelope), lenient enums, request encoding, money formatting
(en/ar), OMR parsing, cart option validation and live price, phone/WhatsApp helpers, availability validation, date
presets, `ApiClient` against MockWebServer (Bearer header, 401 → refresh → retry, single-flight refresh under 8
concurrent requests, proactive refresh, failed refresh → session expired, error mapping, idempotency key, 204,
multipart upload), and `RealtimeClient` against a MockWebServer WebSocket (token, subscribe/unsubscribe, events,
reconnect with backoff and re-subscribe, location frames).

## What was verified (and what was not)

These modules were written in a container where `dl.google.com` (and therefore `maven.google.com`, which redirects
there) is blocked, so neither the Android SDK nor AGP/AndroidX could be downloaded.

- `./gradlew :core:test`: run here and passing.
- `tools/typecheck/run.sh`: run here and passing. It compiles **all** sources of `:core`, `:android-common`,
  `:consumer` and `:captain` together with the Kotlin 2.1.20 + Compose compiler against JetBrains Compose for Desktop
  1.8 (same API surface as Jetpack Compose 1.8 / Material3 1.3), Robolectric's `android-all` (API 35), osmdroid's
  real classes, and hand-written stubs for Google-Maven-only libraries (AppCompat, Activity, Core, Lifecycle,
  security-crypto, browser, exifinterface, Play services location, Coil). It catches Kotlin/Compose errors, but the
  stubbed APIs are only as accurate as the stubs.
- **Not verified here:** an actual Gradle/AGP build of the app modules (AGP configuration, resource linking, manifest
  merging, R8, lint), and any run on a device or emulator. Expect to fix small issues on the first Android Studio sync.
  The resource XML was checked for well-formedness, and every `R.string`/`R.drawable` used in code was checked against
  the resource files (en and ar keys and format arguments match).

## Known gaps / TODO

- No offline cache: screens need the network (the cart is kept in memory only).
- Fonts: system fonts are used; the brand fonts (Noto Kufi Arabic / Inter) are not bundled yet.
- FCM push is a stub (see above); in-app notifications use `GET /me/notifications`.
- Proof-of-delivery and document photos are captured with the system camera app (no in-app camera / document cropping).
- Consumer browsing requires sign-in (the whole app is behind OTP); browsing stores as a guest is not implemented.
- The tracking screen polls every 10 s while it is on the back stack, not only while visible.
- Captain availability uses a two-step time input dialog; no visual week calendar.
- Real-time event payloads other than `delivery.location` and `offer.*` are treated as "something changed" and trigger
  a refetch, because the contract does not define their `data` shapes.
