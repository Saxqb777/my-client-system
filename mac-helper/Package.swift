// swift-tools-version: 5.10
// Orbit Helper: a menu bar app that records Teams, Zoom and Google Meet calls on this Mac, transcribes them
// locally with WhisperKit and sends the transcript to Orbit. Build with ./build-app.sh, see docs/mac-helper-setup.md.
import PackageDescription

let package = Package(
    name: "OrbitHelper",
    platforms: [.macOS("14.2")],
    products: [
        .executable(name: "OrbitHelper", targets: ["OrbitHelper"]),
    ],
    dependencies: [
        // Local speech to text on Apple Silicon (Core ML). Pin a release after the first successful build on your Mac.
        .package(url: "https://github.com/argmaxinc/WhisperKit.git", from: "0.9.0"),
    ],
    targets: [
        // Pure logic with no Apple framework beyond Foundation, so `swift test` covers it on any Mac.
        .target(name: "OrbitHelperCore"),
        .executableTarget(
            name: "OrbitHelper",
            dependencies: ["OrbitHelperCore", .product(name: "WhisperKit", package: "WhisperKit")]
        ),
        .testTarget(name: "OrbitHelperCoreTests", dependencies: ["OrbitHelperCore"]),
    ]
)
