// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "CastMetal",
    platforms: [.macOS(.v13)],
    targets: [
        .target(
            name: "CastMetalCore",
            linkerSettings: [
                .linkedFramework("Metal"),
                .linkedFramework("CoreVideo"),
                .linkedFramework("Network")
            ]
        ),
        .executableTarget(
            name: "castmetal",
            dependencies: ["CastMetalCore"],
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("MetalKit"),
                .linkedFramework("CoreMedia")
            ]
        ),
        // XCTest/Swift Testing don't ship with Command Line Tools,
        // so tests are a plain executable with assertion helpers.
        .executableTarget(
            name: "cast-tests",
            dependencies: ["CastMetalCore"],
            path: "Tests/cast-tests"
        )
    ]
)
