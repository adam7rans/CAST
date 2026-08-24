import Foundation

// MARK: - Vector helpers

public struct Vec2: Codable, Equatable {
    public var x: Float
    public var y: Float
    public init(x: Float = 0, y: Float = 0) { self.x = x; self.y = y }
}

public struct Vec3: Codable, Equatable {
    public var r: Float
    public var g: Float
    public var b: Float
    public init(r: Float = 0, g: Float = 0, b: Float = 0) { self.r = r; self.g = g; self.b = b }
}

/// One gradient stop. Mirrors uGradientStopColors/Opacities/Positions arrays.
public struct GradientStop: Codable, Equatable {
    public var color: Vec3
    public var opacity: Float
    public var position: Float
    public init(color: Vec3, opacity: Float, position: Float) {
        self.color = color; self.opacity = opacity; self.position = position
    }
}

public enum DitherType: Int, Codable, CaseIterable, Sendable {
    case bayer2x2 = 0, bayer4x4 = 1, bayer8x8 = 2, random = 3, blueNoise = 4
    case pattern = 5, threshold = 6, floydSteinberg = 7, atkinson = 8, burkes = 9
    case jarvis = 10, sierra2 = 11, stucki = 12, diffusionRow = 13, diffusionColumn = 14
    case diffusion2D = 15

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let name = try? c.decode(String.self),
           let v = Self.allCases.first(where: { "\($0)" == name }) { self = v }
        else if let raw = try? c.decode(Int.self), let v = Self(rawValue: raw) { self = v }
        else { throw DecodingError.dataCorruptedError(in: c, debugDescription: "unknown dither type") }
    }
}

public enum GradientBlendMode: Int, Codable, CaseIterable, Sendable {
    case normal = 0, multiply = 1, screen = 2, overlay = 3

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let name = try? c.decode(String.self),
           let v = Self.allCases.first(where: { "\($0)" == name }) { self = v }
        else if let raw = try? c.decode(Int.self), let v = Self(rawValue: raw) { self = v }
        else { throw DecodingError.dataCorruptedError(in: c, debugDescription: "unknown blend mode") }
    }
}

// MARK: - ShaderParams

/// Mirrors every uniform of CAST's `dancingVideoFragmentShader`
/// (src/shaders/videoShader.ts) plus the runtime state the Metal port needs.
/// Defaults are copied verbatim from dancingVideoShaderUniforms.
public struct ShaderParams: Codable, Equatable {
    // Resolution (set by renderer, not user-controlled)
    public var resolution: Vec2

    // Pre-shader gradient overlay
    public var gradientEnabled: Bool
    public var gradientType: Int                 // 0 linear, 1 radial
    public var gradientStops: [GradientStop]     // max 6
    public var gradientOpacity: Float
    public var gradientBlendMode: GradientBlendMode
    public var gradientAngle: Float
    public var gradientScale: Float
    public var gradientOffsetX: Float
    public var gradientOffsetY: Float

    public var shaderEnabled: Bool

    // Rez pixelation
    public var rezEnabled: Bool
    public var rezCellWidth: Float
    public var rezCellHeight: Float
    public var rezColorLevels: Float
    public var rezMix: Float
    public var rezJitter: Float

    // Tone / levels
    public var ditherScale: Float
    public var contrast: Float
    public var brightness: Float
    public var blackPoint: Float
    public var whitePoint: Float
    public var gamma: Float
    public var shadows: Float
    public var midtones: Float
    public var highlights: Float
    public var saturation: Float
    public var exposure: Float
    public var clarity: Float

    // Dither engine
    public var ditherType: DitherType
    public var errorDiffusion: Float
    public var threshold: Float
    public var alphaThreshold: Float
    public var ditherEnabled: Bool
    public var ditherGradient: Bool              // false flat color, true spatial gradient
    public var ditherColor: Vec3
    public var ditherGradientColorA: Vec3
    public var ditherGradientColorB: Vec3
    public var ditherGradientAngle: Float
    public var ditherGradientScale: Float
    public var ditherGradientOffsetX: Float
    public var ditherGradientOffsetY: Float

    // Sine-wave distortion
    public var distortionFrequency: Float
    public var distortionAmplitude: Float
    public var distortionSpeed: Float
    public var distortionAngle: Float

    // Position / transform
    public var positionX: Float
    public var positionY: Float
    public var positionRotation: Float
    public var positionScale: Float
    public var rotation: Float
    public var scale: Float
    public var uvScale: Vec2

    public init() {
        resolution = Vec2(x: 1920, y: 1080)

        gradientEnabled = false
        gradientType = 0
        gradientStops = [
            GradientStop(color: Vec3(r: 0, g: 0, b: 0), opacity: 1, position: 0),
            GradientStop(color: Vec3(r: 1, g: 1, b: 1), opacity: 1, position: 1)
        ]
        gradientOpacity = 1.0
        gradientBlendMode = .multiply
        gradientAngle = 0.0
        gradientScale = 1.0
        gradientOffsetX = 0.0
        gradientOffsetY = 0.0

        shaderEnabled = true

        rezEnabled = false
        rezCellWidth = 8.0
        rezCellHeight = 8.0
        rezColorLevels = 24.0
        rezMix = 1.0
        rezJitter = 0.0

        ditherScale = 1.0
        contrast = 1.5
        brightness = 1.0
        blackPoint = 0.0
        whitePoint = 1.0
        gamma = 1.0
        shadows = 0.0
        midtones = 0.0
        highlights = 0.0
        saturation = 1.0
        exposure = 0.0
        clarity = 0.0

        ditherType = .bayer4x4
        errorDiffusion = 1.0
        threshold = 0.5
        alphaThreshold = 0.7
        ditherEnabled = true
        ditherGradient = true
        ditherColor = Vec3(r: 1, g: 1, b: 1)
        ditherGradientColorA = Vec3(r: 0.34, g: 0.33, b: 1.0)
        ditherGradientColorB = Vec3(r: 0.40, g: 0.43, b: 0.68)
        ditherGradientAngle = 0.0
        ditherGradientScale = 1.0
        ditherGradientOffsetX = 0.0
        ditherGradientOffsetY = 0.0

        distortionFrequency = 20.0
        distortionAmplitude = 0.02
        distortionSpeed = 2.0
        distortionAngle = 0.0

        positionX = 0.0
        positionY = 0.0
        positionRotation = 0.0
        positionScale = 1.0
        rotation = 0.0
        scale = 1.0
        uvScale = Vec2(x: 1, y: 1)
    }

    /// Deep-merge a partial JSON patch onto current params.
    /// Unknown keys are ignored; known keys replace the whole value.
    public mutating func merge(patchData: Data) throws {
        guard let patch = try JSONSerialization.jsonObject(with: patchData) as? [String: Any] else {
            throw MergeError.invalidPatch
        }
        try merge(patch: patch)
    }

    public enum MergeError: Error { case invalidPatch, invalidMerged }

    public mutating func merge(patch: [String: Any]) throws {
        let selfJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(self))
        guard var dict = selfJSON as? [String: Any] else { throw MergeError.invalidMerged }
        for (key, value) in patch where dict.keys.contains(key) {
            dict[key] = value
        }
        let merged = try JSONSerialization.data(withJSONObject: dict)
        self = try JSONDecoder().decode(ShaderParams.self, from: merged)
    }
}
