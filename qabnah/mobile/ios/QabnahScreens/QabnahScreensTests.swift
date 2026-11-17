import XCTest

// Screenshot UI tests: drive the real Consumer and Captain apps on an iPhone simulator against
// the local backend (seeded sample data, OTP_DEV_ECHO=true) and photograph each screen.
//
//   xcodebuild test -project Qabnah.xcodeproj -scheme QabnahScreens \
//     -destination "platform=iOS Simulator,name=<iPhone>" CODE_SIGNING_ALLOWED=NO
//
// PNGs go to the directory in the QABNAH_SHOTS_DIR environment variable (pass it to xcodebuild
// as TEST_RUNNER_QABNAH_SHOTS_DIR) and are attached to the test report. Every step is best
// effort: a control that cannot be found is logged ("missing: <id>") and the flow carries on, so
// one broken step never stops the remaining screenshots.
//
// Accessibility identifiers the apps expose for these tests (keep them stable):
//   Sign-in (both apps) auth.phone, auth.sendCode, auth.devCode (label = the code), auth.code,
//                       auth.verify, auth.name, auth.saveName, auth.cancel
//   Consumer tabs       tab.home, tab.send, tab.orders, tab.account
//   Consumer home       home.search, store.<slug>, featured.<slug>, cart.bar, guest.signIn
//   Consumer store      store.back, product.<English name>, product.add, product.close,
//                       option.<English name>
//   Consumer cart       cart.checkout, cart.close, checkout.primary, checkout.back, send.primary
//   Captain tabs        tab.home, tab.deliveries, tab.earnings, tab.profile
//   Captain             captain.onlineToggle, offer.accept, offer.decline, offer.hide,
//                       delivery.primary
final class QabnahScreensTests: XCTestCase {
    private let consumerBundleId = "om.qabnah.consumer"
    private let captainBundleId = "om.qabnah.captain"
    private let consumerPhone = "90000001"
    private let captainPhone = "90001001"
    private let storeSlug = "qahwa-house"
    private let storeNameAr = "بيت القهوة"
    private let productNameEn = "Karak Tea"
    private let productNameAr = "شاي كرك"

    private let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")

    /// Button titles that grant a permission, in English and Arabic.
    private let allowTitles = [
        "Allow While Using App", "السماح أثناء استخدام التطبيق", "Allow", "السماح", "OK", "موافق",
    ]

    override func setUp() {
        super.setUp()
        continueAfterFailure = true
        _ = addUIInterruptionMonitor(withDescription: "System permission alerts") { alert in
            return self.tapAllow(in: alert)
        }
    }

    // MARK: - Consumer

    func testConsumerScreens() {
        let app = launch(consumerBundleId)
        dismissSystemAlerts()

        // Home as a guest.
        _ = find(app, "home.search").waitForExistence(timeout: 30)
        dismissSystemAlerts()
        pause(4)
        shot("consumer-01-home")

        app.swipeUp()
        pause(2)
        shot("consumer-02-home-stores")

        // Storefront.
        if openStore(app) {
            _ = find(app, "store.back").waitForExistence(timeout: 20)
            pause(4)
            shot("consumer-03-storefront")

            // Product sheet → add to cart.
            if openProduct(app) {
                let add = find(app, "product.add")
                _ = add.waitForExistence(timeout: 20)
                pause(3)
                shot("consumer-04-product")
                if add.exists && add.isEnabled {
                    press(add)
                } else {
                    print("missing: product.add is not enabled (store closed?)")
                    _ = tap(app, "product.close", timeout: 5)
                }
                pause(2)
                shot("consumer-05-storefront-cart-bar")
            }

            // Cart → sign in → checkout steps.
            if tap(app, "cart.bar", timeout: 10) {
                _ = find(app, "cart.checkout").waitForExistence(timeout: 20)
                pause(2)
                shot("consumer-06-cart")
                if tap(app, "cart.checkout", timeout: 10) {
                    signInIfAsked(app, phone: consumerPhone, shotPrefix: "consumer-07")
                    let primary = find(app, "checkout.primary")
                    if primary.waitForExistence(timeout: 30) {
                        pause(4)
                        shot("consumer-08-checkout-address")
                        if primary.isEnabled {
                            press(primary)
                            pause(2)
                            shot("consumer-09-checkout-payment")
                            if primary.isEnabled {
                                press(primary)
                                pause(4)
                                shot("consumer-10-checkout-review")
                            }
                        }
                    } else {
                        print("missing: checkout.primary")
                        shot("consumer-08-checkout-missing")
                    }
                }
            }
        }

        // Relaunch to leave the sheets (the session and the cart are kept) and visit the tabs.
        app.terminate()
        app.launch()
        dismissSystemAlerts()
        _ = find(app, "home.search").waitForExistence(timeout: 30)

        openTab(app, id: "tab.orders", titles: ["الطلبات", "Orders"], index: 2)
        signInIfAsked(app, phone: consumerPhone, shotPrefix: "consumer-11")
        pause(5)
        shot("consumer-12-orders")

        openTab(app, id: "tab.send", titles: ["أرسل", "Send"], index: 1)
        signInIfAsked(app, phone: consumerPhone, shotPrefix: "consumer-13")
        pause(3)
        shot("consumer-14-send")

        openTab(app, id: "tab.account", titles: ["حسابي", "Account"], index: 3)
        signInIfAsked(app, phone: consumerPhone, shotPrefix: "consumer-15")
        pause(3)
        shot("consumer-16-account")

        app.terminate()
    }

    // MARK: - Captain

    func testCaptainScreens() {
        let app = launch(captainBundleId)
        dismissSystemAlerts()

        if find(app, "auth.phone").waitForExistence(timeout: 30) {
            pause(2)
            shot("captain-01-sign-in")
            signInIfAsked(app, phone: captainPhone, shotPrefix: "captain-02")
        }
        dismissSystemAlerts()

        let toggle = find(app, "captain.onlineToggle")
        _ = toggle.waitForExistence(timeout: 40)
        dismissSystemAlerts()
        pause(4)
        shot("captain-03-home")

        if toggle.exists {
            press(toggle)
            dismissSystemAlerts()
            pause(6)
            dismissSystemAlerts()
            shot("captain-04-online")
            // An offer may arrive once online.
            if find(app, "offer.accept").waitForExistence(timeout: 8) {
                pause(1)
                shot("captain-05-offer")
                _ = tap(app, "offer.hide", timeout: 5)
                pause(1)
            }
        } else {
            print("missing: captain.onlineToggle")
        }

        openTab(app, id: "tab.deliveries", titles: ["التوصيلات", "Deliveries"], index: 1)
        pause(4)
        shot("captain-06-deliveries")

        openTab(app, id: "tab.earnings", titles: ["الأرباح", "Earnings"], index: 2)
        pause(4)
        shot("captain-07-earnings")

        openTab(app, id: "tab.profile", titles: ["حسابي", "Profile"], index: 3)
        pause(3)
        shot("captain-08-profile")

        app.terminate()
    }

    // MARK: - Flow helpers

    private func launch(_ bundleId: String) -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: bundleId)
        app.launchArguments += ["-AppleLanguages", "(ar)", "-AppleLocale", "ar_OM"]
        app.launch()
        return app
    }

    /// Scrolls Home until the store card is on screen and opens it.
    private func openStore(_ app: XCUIApplication) -> Bool {
        let card = find(app, "store.\(storeSlug)")
        if scrollTo(card, in: app, maxSwipes: 10) {
            press(card)
            return true
        }
        let byName = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", storeNameAr)).firstMatch
        if byName.waitForExistence(timeout: 5) {
            press(byName)
            return true
        }
        let featured = find(app, "featured.\(storeSlug)")
        if featured.exists {
            press(featured)
            return true
        }
        print("missing: store.\(storeSlug)")
        shot("consumer-03-store-missing")
        return false
    }

    private func openProduct(_ app: XCUIApplication) -> Bool {
        let row = find(app, "product.\(productNameEn)")
        if scrollTo(row, in: app, maxSwipes: 8) {
            press(row)
            return true
        }
        let byName = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", productNameAr)).firstMatch
        if byName.exists {
            press(byName)
            return true
        }
        print("missing: product.\(productNameEn)")
        shot("consumer-04-product-missing")
        return false
    }

    /// If the OTP sign-in is on screen: phone → send code → read the dev banner → verify.
    private func signInIfAsked(_ app: XCUIApplication, phone: String, shotPrefix: String) {
        let phoneField = find(app, "auth.phone")
        guard phoneField.waitForExistence(timeout: 6) else { return }
        pause(1)
        shot("\(shotPrefix)-sign-in-phone")
        phoneField.tap()
        pause(1)
        phoneField.typeText(phone)
        guard tap(app, "auth.sendCode", timeout: 10) else { return }

        let code = readDevCode(app)
        pause(1)
        shot("\(shotPrefix)-sign-in-code")
        guard !code.isEmpty else {
            print("missing: auth.devCode (is OTP_DEV_ECHO on?)")
            return
        }
        let codeField = find(app, "auth.code")
        guard codeField.waitForExistence(timeout: 10) else { return }
        codeField.tap()
        pause(1)
        codeField.typeText(code)
        _ = tap(app, "auth.verify", timeout: 3) // a complete code is submitted automatically; this covers shorter codes
        pause(3)
        dismissSystemAlerts() // notifications prompt after sign-in

        // A brand-new account is asked for a name.
        let nameField = find(app, "auth.name")
        if nameField.waitForExistence(timeout: 3) {
            nameField.tap()
            pause(1)
            nameField.typeText("Test User")
            _ = tap(app, "auth.saveName", timeout: 5)
            pause(3)
            dismissSystemAlerts()
        }
    }

    /// The development server echoes the OTP; the app shows it in a banner (`auth.devCode`).
    private func readDevCode(_ app: XCUIApplication) -> String {
        let banner = find(app, "auth.devCode")
        if banner.waitForExistence(timeout: 20) {
            let digits = banner.label.filter { $0.isNumber }
            if digits.count >= 4 { return String(digits) }
        }
        let numeric = app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "^[0-9]{4,8}$")).firstMatch
        if numeric.waitForExistence(timeout: 3) {
            return numeric.label
        }
        return ""
    }

    /// Tab by identifier, then by its Arabic / English title, then by position.
    private func openTab(_ app: XCUIApplication, id: String, titles: [String], index: Int) {
        let tabBar = app.tabBars.firstMatch
        guard tabBar.waitForExistence(timeout: 20) else {
            print("missing: tab bar for \(id)")
            return
        }
        let byId = tabBar.buttons[id]
        if byId.exists {
            byId.tap()
            return
        }
        for title in titles {
            let byTitle = tabBar.buttons[title]
            if byTitle.exists {
                byTitle.tap()
                return
            }
        }
        let byIndex = tabBar.buttons.element(boundBy: index)
        if byIndex.exists {
            byIndex.tap()
            return
        }
        print("missing: \(id)")
    }

    // MARK: - Element helpers

    private func find(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    private func press(_ element: XCUIElement) {
        if element.isHittable {
            element.tap()
        } else {
            element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
    }

    private func tap(_ app: XCUIApplication, _ id: String, timeout: TimeInterval) -> Bool {
        let element = find(app, id)
        guard element.waitForExistence(timeout: timeout) else {
            print("missing: \(id)")
            return false
        }
        press(element)
        return true
    }

    private func scrollTo(_ element: XCUIElement, in app: XCUIApplication, maxSwipes: Int) -> Bool {
        var swipes = 0
        while swipes <= maxSwipes {
            if element.exists && element.isHittable { return true }
            app.swipeUp()
            pause(1)
            swipes += 1
        }
        return element.exists && element.isHittable
    }

    private func pause(_ seconds: TimeInterval) {
        Thread.sleep(forTimeInterval: seconds)
    }

    // MARK: - System alerts

    private func tapAllow(in alert: XCUIElement) -> Bool {
        for title in allowTitles {
            let button = alert.buttons[title]
            if button.exists {
                button.tap()
                return true
            }
        }
        // Location: [Allow Once, Allow While Using App, Don't Allow]; notifications: [Don't Allow, Allow].
        let buttons = alert.buttons
        if buttons.count > 1 {
            buttons.element(boundBy: 1).tap()
            return true
        }
        return false
    }

    /// Permission alerts belong to SpringBoard, not to the app under test.
    private func dismissSystemAlerts() {
        var attempts = 0
        while attempts < 4 {
            let alert = springboard.alerts.firstMatch
            guard alert.waitForExistence(timeout: 2) else { return }
            _ = tapAllow(in: alert)
            pause(1)
            attempts += 1
        }
    }

    // MARK: - Screenshots

    private func shot(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let directory = ProcessInfo.processInfo.environment["QABNAH_SHOTS_DIR"], !directory.isEmpty {
            let folder = URL(fileURLWithPath: directory, isDirectory: true)
            try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let file = folder.appendingPathComponent("\(name).png")
            do {
                try screenshot.pngRepresentation.write(to: file)
            } catch {
                print("shot write failed: \(name): \(error)")
            }
        }
        print("shot: \(name)")
    }
}
