import Foundation
import Metal

/// Encodes ShaderParams into the flat float4 uniform array consumed by
/// Resources/Shaders.msl. The slot map lives in the MSL header comment and
/// MUST stay in sync with `encode()` below.
///
/// Slot map (index: x, y, z, w):
///  0: resolution.x, resolution.y, time, -
///  1: gradientEnabled, gradientType, gradientBlendMode, shaderEnabled
///  2: rezEnabled, ditherEnabled, ditherGradient, ditherType
///  3: gradientOpacity, gradientAngle, gradientScale, gradientOffsetX
///  4: gradientOffsetY, rezCellWidth, rezCellHeight, rezColorLevels
///  5: rezMix, rezJitter, ditherScale, contrast
///  6: brightness, blackPoint, whitePoint, gamma
///  7: shadows, midtones, highlights, saturation
///  8: exposure, clarity, errorDiffusion, threshold
///  9: alphaThreshold, distortionFrequency, distortionAmplitude, distortionSpeed
/// 10: distortionAngle, positionX, positionY, positionRotation
/// 11: positionScale, rotation, scale, uvScale.x
/// 12: uvScale.y, ditherGradientAngle, ditherGradientScale, ditherGradientOffsetX
/// 13: ditherColor.rgb, -
/// 14: ditherGradientColorA.rgb, -
/// 15: ditherGradientColorB.rgb, -
/// 16+i (0..5): gradient stop i: color.rgb, opacity
/// 22+i (0..5): stop i position in x
/// 28: ditherGradientOffsetY in x   (total 29 slots)
public enum UniformEncoder {
    public static let slotCount = 29

    public static func encode(params: ShaderParams, time: Float) -> [Float] {
        var f = [Float](repeating: 0, count: slotCount * 4)

        func put(_ slot: Int, _ x: Float, _ y: Float = 0, _ z: Float = 0, _ w: Float = 0) {
            f[slot * 4 + 0] = x; f[slot * 4 + 1] = y; f[slot * 4 + 2] = z; f[slot * 4 + 3] = w
        }
        func b(_ v: Bool) -> Float { v ? 1 : 0 }

        put(0, params.resolution.x, params.resolution.y, time)
        put(1, b(params.gradientEnabled), Float(params.gradientType), Float(params.gradientBlendMode.rawValue), b(params.shaderEnabled))
        put(2, b(params.rezEnabled), b(params.ditherEnabled), b(params.ditherGradient), Float(params.ditherType.rawValue))
        put(3, params.gradientOpacity, params.gradientAngle, params.gradientScale, params.gradientOffsetX)
        put(4, params.gradientOffsetY, params.rezCellWidth, params.rezCellHeight, params.rezColorLevels)
        put(5, params.rezMix, params.rezJitter, params.ditherScale, params.contrast)
        put(6, params.brightness, params.blackPoint, params.whitePoint, params.gamma)
        put(7, params.shadows, params.midtones, params.highlights, params.saturation)
        put(8, params.exposure, params.clarity, params.errorDiffusion, params.threshold)
        put(9, params.alphaThreshold, params.distortionFrequency, params.distortionAmplitude, params.distortionSpeed)
        put(10, params.distortionAngle, params.positionX, params.positionY, params.positionRotation)
        put(11, params.positionScale, params.rotation, params.scale, params.uvScale.x)
        put(12, params.uvScale.y, params.ditherGradientAngle, params.ditherGradientScale, params.ditherGradientOffsetX)
        put(13, params.ditherColor.r, params.ditherColor.g, params.ditherColor.b)
        put(14, params.ditherGradientColorA.r, params.ditherGradientColorA.g, params.ditherGradientColorA.b)
        put(15, params.ditherGradientColorB.r, params.ditherGradientColorB.g, params.ditherGradientColorB.b)

        // Pad/clip stops to exactly MAX_GRADIENT_STOPS (6), repeating the last real stop.
        var stops = params.gradientStops
        if stops.isEmpty {
            stops = [GradientStop(color: Vec3(r: 0, g: 0, b: 0), opacity: 1, position: 0)]
        }
        while stops.count < 6 { stops.append(stops[stops.count - 1]) }
        for i in 0..<6 {
            let s = stops[i]
            put(16 + i, s.color.r, s.color.g, s.color.b, s.opacity)
            put(22 + i, s.position)
        }
        put(28, params.ditherGradientOffsetY)
        return f
    }
}

// MARK: - FrameRenderer

/// Runs the castVideo kernel: input texture → filtered output texture.
public final class FrameRenderer {
    private let device: MTLDevice
    private let queue: MTLCommandQueue
    private let compiler: ShaderCompiler
    private var pipeline: MTLComputePipelineState?
    public private(set) var compileError: String?

    public init?(device: MTLDevice, shaderSource: String) {
        self.device = device
        guard let q = device.makeCommandQueue() else { return nil }
        self.queue = q
        self.compiler = ShaderCompiler()
        guard let lib = compiler.compile(source: shaderSource, device: device),
              let fn = lib.makeFunction(name: "castVideo"),
              let ps = try? device.makeComputePipelineState(function: fn) else {
            compileError = compiler.lastError ?? "unknown shader compile failure"
            return nil
        }
        self.pipeline = ps
    }

    /// Render one frame. Returns diagnostic string on failure, nil on success.
    @discardableResult
    public func render(input: MTLTexture, output: MTLTexture, params: ShaderParams, time: Float, debug: Int32 = 0) -> String? {
        guard let pipeline else { return "no pipeline" }
        guard let cb = queue.makeCommandBuffer() else { return "no command buffer" }
        guard let encoder = cb.makeComputeCommandEncoder() else { return "no encoder" }

        let floats = UniformEncoder.encode(params: params, time: time)
        let buffer = device.makeBuffer(bytes: floats, length: floats.count * MemoryLayout<Float>.stride)

        encoder.setComputePipelineState(pipeline)
        encoder.setTexture(input, index: 0)
        encoder.setTexture(output, index: 1)
        if let buffer { encoder.setBuffer(buffer, offset: 0, index: 0) }
        var debugMode = debug
        let dbg = device.makeBuffer(bytes: &debugMode, length: MemoryLayout<Int32>.size)
        if let dbg { encoder.setBuffer(dbg, offset: 0, index: 1) }

        let w = pipeline.threadExecutionWidth
        let maxThreads = pipeline.maxTotalThreadsPerThreadgroup
        var th = 1
        while th * 2 * w <= maxThreads { th *= 2 }
        encoder.dispatchThreads(MTLSize(width: output.width, height: output.height, depth: 1),
                                threadsPerThreadgroup: MTLSize(width: w, height: th, depth: 1))
        encoder.endEncoding()
        cb.commit()
        cb.waitUntilCompleted() // simple synchronous model; async in Task 2.3
        if let err = cb.error {
            return String(describing: err)
        }
        return nil
    }
}
