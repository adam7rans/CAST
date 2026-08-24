import Foundation
import Metal
@testable import CastMetalCore

let W = 128, H = 32
guard let device = MTLCreateSystemDefaultDevice() else { print("NO GPU"); exit(2) }
guard let src = ShaderCompiler.loadShaderSource() else { print("no src"); exit(2) }
guard let renderer = FrameRenderer(device: device, shaderSource: src) else {
    let c = ShaderCompiler(); _ = c.compile(source: src, device: device)
    print("RENDERER FAILED:\n\(c.lastError ?? "?")"); exit(1)
}

// gray ramp input
var inp = [UInt8]()
for _ in 0..<H { for x in 0..<W { let v = UInt8((x * 255) / (W - 1)); inp += [v, v, v, 255] } }
let inDesc = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: W, height: H, mipmapped: false)
inDesc.usage = [.shaderRead]
let inTex = device.makeTexture(descriptor: inDesc)!
inTex.replace(region: MTLRegionMake2D(0, 0, W, H), mipmapLevel: 0, withBytes: inp, bytesPerRow: W * 4)

let outDesc = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba16Float, width: W, height: H, mipmapped: false)
outDesc.usage = [.shaderWrite]
let outTex = device.makeTexture(descriptor: outDesc)!

func half(_ v: UInt16) -> Float {
    let s: Float = (v >> 15) == 1 ? -1 : 1
    let e = Int((v >> 10) & 0x1F); let m = Float(v & 0x3FF)
    if e == 0 { return s * m * 5.9604645e-8 }
    return s * (1 + m / 1024) * pow(2, Float(e - 15))
}

var p = ShaderParams()
p.resolution = Vec2(x: Float(W), y: Float(H))

func readback() -> [UInt16] {
    var px = [UInt16](repeating: 0, count: W * H * 4)
    outTex.getBytes(&px, bytesPerRow: W * 8, from: MTLRegionMake2D(0, 0, W, H), mipmapLevel: 0)
    return px
}

renderer.render(input: inTex, output: outTex, params: p, time: 0)
var px = readback()
print("--- lit-fraction per column bucket & lit colors ---")
var firstLitColor = ""
var lastLitColor = ""
var totalLit = 0
for xb in stride(from: 0, to: W, by: 16) {
    var lit = 0, total = 0
    for x in xb..<(xb + 16) {
        for y in 0..<H {
            let i = (y * W + x) * 4
            total += 1
            if half(px[i + 3]) > 0.05 {
                lit += 1; totalLit += 1
                if firstLitColor.isEmpty {
                    firstLitColor = "rgb(\(String(format: "%.2f", half(px[i]))),\(String(format: "%.2f", half(px[i+1]))),\(String(format: "%.2f", half(px[i+2]))))"
                }
                lastLitColor = "rgb(\(String(format: "%.2f", half(px[i]))),\(String(format: "%.2f", half(px[i+1]))),\(String(format: "%.2f", half(px[i+2]))))"
            }
        }
    }
    print("x\(xb)-\(xb+15): \(lit)/\(total) lit")
}
print("totalLit=\(totalLit)/\(W*H)")
print("firstLit=\(firstLitColor) lastLit=\(lastLitColor)")

// ---- GPU-side uniform introspection via dumpUniforms ----
let lib = try device.makeLibrary(source: src, options: nil)
if let dumpFn = lib.makeFunction(name: "dumpUniforms") {
    let dumpPs = try device.makeComputePipelineState(function: dumpFn)
    let udata = UniformEncoder.encode(params: p, time: 0.5)
    let ubuf = device.makeBuffer(bytes: udata, length: udata.count * MemoryLayout<Float>.stride)!
    let obuf = device.makeBuffer(length: 30 * 16, options: .storageModeShared)!
    let cb = device.makeCommandQueue()!.makeCommandBuffer()!
    let enc = cb.makeComputeCommandEncoder()!
    enc.setComputePipelineState(dumpPs)
    enc.setBuffer(ubuf, offset: 0, index: 0)
    enc.setBuffer(obuf, offset: 0, index: 1)
    enc.dispatchThreads(MTLSize(width: 30, height: 1, depth: 1),
                        threadsPerThreadgroup: MTLSize(width: 32, height: 1, depth: 1))
    enc.endEncoding()
    cb.commit()
    cb.waitUntilCompleted()
    let o = obuf.contents().bindMemory(to: Float.self, capacity: 120)
    print("--- key slots as GPU sees them ---")
    print("[0] res/time = \(o[0]),\(o[1]),\(o[2])")
    print("[2] rezEn/dithEn/dithGrad/ditherType = \(o[8]),\(o[9]),\(o[10]),\(o[11])")
    print("[9] alphaThresh/distFreq/distAmp/distSpeed = \(o[36]),\(o[37]),\(o[38]),\(o[39])")
}
