import AppKit
import CastMetalCore
import CoreMedia
import Foundation
import Metal

// cast-metal: camera → Metal dither/distort shader → preview window.
// Flags: --probe (camera test) | --stills | (default) live preview.

if CommandLine.arguments.contains("--probe") {
    exit(runProbe())
}
if CommandLine.arguments.contains("--stills") {
    exit(runStills())
}
exit(runLive())
