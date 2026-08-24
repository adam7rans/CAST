import CastMetalCore
import CoreMedia
import Foundation

// --probe: start capture for 2 seconds, print frame stats, exit.
func runProbe() -> Int32 {
    let capture = CameraCapture()
    var frameCount = 0
    var dims = (w: 0, h: 0)
    let lock = NSLock()
    capture.onFrame = { pb, _ in
        lock.lock()
        frameCount += 1
        if frameCount == 1 {
            let w = CVPixelBufferGetWidth(pb)
            let h = CVPixelBufferGetHeight(pb)
            dims = (w, h)
            print("first frame: \(w)x\(h)")
        }
        lock.unlock()
    }

    if !AuthorizationState.cameraAuthorized() {
        print("requesting camera permission… (approve the macOS dialog)")
        let sem = DispatchSemaphore(value: 0)
        AuthorizationState.requestCameraAccess { granted in
            if !granted { print("probe: camera permission denied") }
            sem.signal()
        }
        _ = sem.wait(timeout: .now() + 120)
        guard AuthorizationState.cameraAuthorized() else {
            print("probe: permission still not granted. Reset with: tccutil reset Camera")
            return 2
        }
    }
    if let err = capture.start() {
        print("probe failed: \(err)")
        return 1
    }
    Thread.sleep(forTimeInterval: 2.0)
    capture.stop()
    print("received \(frameCount) frames @ \(dims.w)x\(dims.h) in 2s (\(frameCount / 2) fps avg)")
    return frameCount > 30 ? 0 : 3
}

var exitCode: Int32 = 0
let args = CommandLine.arguments
if args.contains("--probe") {
    exitCode = runProbe()
} else {
    print("cast-metal: scaffold OK (live window arrives in Task 2.3; try --probe to test camera)")
}
exit(exitCode)
