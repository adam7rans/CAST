import AppKit
import CastMetalCore
import CoreMedia
import CoreVideo
import Foundation
import Metal

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
            dims = (CVPixelBufferGetWidth(pb), CVPixelBufferGetHeight(pb))
            print("first frame: \(dims.w)x\(dims.h)")
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

// --stills: parity harness (implementation in StillsMode.swift)
func runStills() -> Int32 { stillsMain() }

// default: live preview window
func runLive() -> Int32 {
    let app = NSApplication.shared
    app.setActivationPolicy(.regular)

    guard let device = MTLCreateSystemDefaultDevice() else {
        print("No Metal device"); return 2
    }
    guard let src = ShaderCompiler.loadShaderSource() else {
        print("Shaders.msl not found"); return 2
    }
    guard let renderer = FrameRenderer(device: device, shaderSource: src) else {
        let c = ShaderCompiler(); _ = c.compile(source: src, device: device)
        print("Shader compile failed:\n\(c.lastError ?? "?")")
        return 1
    }

    let window = PreviewWindow(device: device)
    let viewRenderer = ViewRenderer(device: device)
    window.metalView.delegate = viewRenderer

    // Offscreen render target sized to the view's drawable.
    var params = ShaderParams()
    let uploader = TextureUploader(device: device)

    func makeTarget(width: Int, height: Int) -> MTLTexture {
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: width, height: height, mipmapped: false)
        d.usage = [.shaderWrite, .shaderRead]
        return device.makeTexture(descriptor: d)!
    }

    var target = makeTarget(width: 960, height: 540)
    var startTime = CFAbsoluteTimeGetCurrent()
    var lastErrorPrinted = 0.0
    var frameCount = 0
    var lastStatsTime = CFAbsoluteTimeGetCurrent()

    let capture = CameraCapture()

    func ensurePermissionSync() {
        if !AuthorizationState.cameraAuthorized() {
            let sem = DispatchSemaphore(value: 0)
            AuthorizationState.requestCameraAccess { _ in sem.signal() }
            _ = sem.wait(timeout: .now() + 120)
        }
    }

    ensurePermissionSync()
    if let err = capture.start() {
        print("camera start failed: \(err)")
        return 1
    }

    capture.onFrame = { pixelBuffer, _ in
        autoreleasepool {
            let (srcTex, cvTex) = uploader.texture(for: pixelBuffer)
            guard let srcTex else { return }
            _ = cvTex // keep alive until enqueue completes (sync render)

            params.resolution = Vec2(x: Float(target.width), y: Float(target.height))
            let time = Float(CFAbsoluteTimeGetCurrent() - startTime)
            renderer.render(input: srcTex, output: target, params: params, time: time)

            viewRenderer.latestTexture = target
            frameCount += 1
        }
    }

    // Control server for the CAST web panel.
    var server: ControlServer?
    do {
        let s = try ControlServer(port: 4313, initialParams: params)
        s.onParamsChanged = { p in params = p }
        ControlServer.sharedRouter = { [weak s] method, path, box in s?.route(method: method, path: path, to: box) }
        ControlServer.sharedHandler = { [weak s] data, box in s?.handleWebSocketMessage(data, from: box) }
        s.start()
        server = s
        print("cast-metal: control server on http://127.0.0.1:\(s.port)")
    } catch {
        print("cast-metal: control server failed to start: \(error)")
    }

    // FPS reporter
    let statsTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
        let now = CFAbsoluteTimeGetCurrent()
        let fps = Double(frameCount) / max(now - lastStatsTime, 0.001)
        lastStatsTime = now
        frameCount = 0
        server?.updateStats(fps: fps, frames: frameCount, camera: capture.device?.localizedName ?? "")
    }
    _ = statsTimer

    window.makeKeyAndOrderFront(nil)
    app.activate(ignoringOtherApps: true)
    app.run()
    server?.stop()
    capture.stop()
    return 0
}
