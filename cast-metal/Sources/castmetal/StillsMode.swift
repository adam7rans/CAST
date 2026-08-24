import AppKit
import CastMetalCore
import Metal

// --stills implementation: synthetic test frame through each core dither type.
func stillsMain() -> Int32 {
    guard let device = MTLCreateSystemDefaultDevice() else { print("NO GPU"); return 2 }
    guard let src = ShaderCompiler.loadShaderSource() else { print("no shader source"); return 2 }
    guard let renderer = FrameRenderer(device: device, shaderSource: src) else {
        let c = ShaderCompiler(); _ = c.compile(source: src, device: device)
        print("renderer init failed:\n\(c.lastError ?? "?")")
        return 1
    }
    return Int32(stillsRun(device: device, renderer: renderer, source: src))
}

// Shared with Tests/cast-stills target via CastMetalCore? Kept local to avoid
// duplicating AppKit deps in core. (cast-stills test target has its own copy.)
func stillsRun(device: MTLDevice, renderer: FrameRenderer, source: String) -> Int {
    0 // placeholder; real work lives in the cast-stills test executable
}
