// swift-tools-version:5.9
// QabnahKit — networking, models and pure business logic shared by the Qabnah iOS apps.
// Foundation-only (no SwiftUI/UIKit/MapKit/CoreLocation) so it also builds and tests on Linux.
import PackageDescription

let package = Package(
    name: "QabnahKit",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
    ],
    products: [
        .library(name: "QabnahKit", targets: ["QabnahKit"]),
    ],
    targets: [
        .target(
            name: "QabnahKit",
            path: "Sources/QabnahKit"
        ),
        .testTarget(
            name: "QabnahKitTests",
            dependencies: ["QabnahKit"],
            path: "Tests/QabnahKitTests",
            resources: [.copy("Fixtures")]
        ),
    ]
)
