import AppKit
import CoreGraphics
import Metal
@testable import CastMetalCore

// --stills <preset.json?> : render a synthetic test frame through each core dither
// type and write PNGs to out/ for visual comparison against CAST's WebGL output.

func makeSyntheticTexture(device: MTLDevice, width: Int, height: Int) -> MTLTexture {
    let desc = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: width, height: height, mipmapped: false)
    desc.usage = [.shaderRead]
    let tex = device.makeTexture(descriptor: desc)!
    var pixels = [UInt8]()
    pixels.reserveCapacity(width * height * 4)
    for y in 0..<height {
        for x in 0..<width {
            let u = Float(x) / Float(width), v = Float(y) / Float(height)
            // Color ramps + soft blob: exercises gradients, luminance spread, edges.
            var r = u
            var g = v
            var b = 0.5 + 0.5 * sin(u * 6.283)
            let dx = u - 0.55, dy = v - 0.45
            let blob = exp(-(dx * dx + dy * dy) * 40.0)
            r = min(1, r * 0.6 + blob)
            g = min(1, g * 0.7 + blob * 0.8)
            b = min(1, b * 0.5 + blob)
            pixels.append(UInt8(min(max(b, 0), 1) * 255))
            pixels.append(UInt8(min(max(g, 0), 1) * 255))
            pixels.append(UInt8(min(max(r, 0), 1) * 255))
            pixels.append(255)
        }
    }
    tex.replace(region: MTLRegionMake2D(0, 0, width, height), mipmapLevel: 0,
                withBytes: pixels, bytesPerRow: width * 4)
    return tex
}

func savePNG(_ texture: MTLTexture, path: String) {
    let w = texture.width, h = texture.height
    var bytes = [UInt8](repeating: 0, count: w * h * 4)
    texture.getBytes(&bytes, bytesPerRow: w * 4, from: MTLRegionMake2D(0, 0, w, h), mipmapLevel: 0)
    // Output texture is rgba8Unorm — CG expects RGBA, no channel swap needed.
    // Alpha-keyed pixels (a=0) are written opaque white so they're visible in the PNG.
    for i in stride(from: 0, to: bytes.count, by: 4) {
        if bytes[i + 3] < 128 { bytes[i] = 255; bytes[i+1] = 255; bytes[i+2] = 255 }
        bytes[i + 3] = 255
    }
    let cs = CGColorSpaceCreateDeviceRGB()
    let ctx = CGContext(data: &bytes, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                        space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let img = ctx.makeImage()!
    let rep = NSBitmapImageRep(cgImage: img)
    let png = rep.representation(using: .png, properties: [:])!
    try! png.write(to: URL(fileURLWithPath: path))
}

let ditherCases: [(String, ShaderParams)] = [
    ("bayer2x2", { var p = ShaderParams(); p.ditherType = .bayer2x2; return p }()),
    ("bayer4x4", { var p = ShaderParams(); p.ditherType = .bayer4x4; return p }()),
    ("bayer8x8", { var p = ShaderParams(); p.ditherType = .bayer8x8; return p }()),
    ("blueNoise", { var p = ShaderParams(); p.ditherType = .blueNoise; return p }()),
    ("floydSteinberg", { var p = ShaderParams(); p.ditherType = .floydSteinberg; return p }()),
    ("atkinson", { var p = ShaderParams(); p.ditherType = .atkinson; return p }()),
]

func compilerLastError(src: String, device: MTLDevice) -> String {
    let c = ShaderCompiler()
    _ = c.compile(source: src, device: device)
    return c.lastError ?? "unknown"
}

guard let device = MTLCreateSystemDefaultDevice() else { print("NO GPU"); exit(2) }
guard let src = ShaderCompiler.loadShaderSource() else { print("no shader source"); exit(2) }
guard let renderer = FrameRenderer(device: device, shaderSource: src) else {
    print("renderer init failed: \(String(describing: compilerLastError(src: src, device: device)))")
    exit(1)
}

let outDir = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("out")
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let W = 960, H = 540
let input = makeSyntheticTexture(device: device, width: W, height: H)

for (name, params) in ditherCases {
    var p = params
    p.resolution = Vec2(x: Float(W), y: Float(H))
    let outDesc = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: W, height: H, mipmapped: false)
    outDesc.usage = [.shaderWrite]
    let output = device.makeTexture(descriptor: outDesc)!
    renderer.render(input: input, output: output, params: p, time: 1.0)
    savePNG(output, path: outDir.appendingPathComponent("still-\(name).png").path)
    print("wrote still-\(name).png")
}
print("OK — \(ditherCases.count) stills in cast-metal/out/")
