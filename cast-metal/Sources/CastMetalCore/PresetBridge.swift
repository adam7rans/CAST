import Foundation

/// Maps CAST preset JSON (the `video` section of presets/*.json) onto
/// ShaderParams. Hex colors (#rrggbb) ↔ Vec3, gradient stops carry id/color
/// strings we normalize, unknown fields ignored.
public enum PresetBridge {
    // MARK: hex color helpers

    static func hexToVec3(_ hex: String) -> Vec3? {
        var s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard s.count == 6 || s.count == 3 else { return nil }
        if s.count == 3 {
            s = s.map { "\($0)\($0)" }.joined()
        }
        guard let v = UInt32(s, radix: 16) else { return nil }
        return Vec3(r: Float((v >> 16) & 0xFF) / 255,
                    g: Float((v >> 8) & 0xFF) / 255,
                    b: Float(v & 0xFF) / 255)
    }

    static func vec3ToHex(_ v: Vec3) -> String {
        func c(_ f: Float) -> String {
            String(format: "%02x", Int(round(max(0, min(1, f)) * 255)))
        }
        return "#" + c(v.r) + c(v.g) + c(v.b)
    }

    // MARK: preset → params

    /// Apply the `video` dict from a CAST preset file onto params.
    public static func apply(video: [String: Any], to params: inout ShaderParams) throws {
        let data = try JSONSerialization.data(withJSONObject: video)
        // First pass via merge for all identically-named scalar/vec fields.
        var renamed = video
        // Gradient stops need normalization: CAST stores [{id,color:#hex,opacity,position}]
        if let rawStops = video["gradientStops"] as? [[String: Any]] {
            let converted: [[String: Any]] = rawStops.compactMap { stop in
                guard let colorHex = stop["color"] as? String,
                      let color = hexToVec3(colorHex) else { return nil }
                let opacity = stop["opacity"] as? Double ?? 1
                let position = stop["position"] as? Double ?? 0
                return ["color": ["r": color.r, "g": color.g, "b": color.b],
                        "opacity": opacity, "position": position]
            }
            renamed["gradientStops"] = converted
        }
        for key in ["ditherColor", "ditherGradientColorA", "ditherGradientColorB"] {
            if let hex = video[key] as? String, let v = hexToVec3(hex) {
                renamed[key] = ["r": v.r, "g": v.g, "b": v.b]
            }
        }
        try params.merge(patchData: JSONSerialization.data(withJSONObject: renamed))
    }

    /// Load a CAST preset file and return updated params.
    public static func load(fileURL: URL, into params: ShaderParams) throws -> ShaderParams {
        let data = try Data(contentsOf: fileURL)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let video = root["video"] as? [String: Any] else {
            throw BridgeError.missingVideoSection
        }
        var p = params
        try apply(video: video, to: &p)
        return p
    }

    /// Export current params back into a `video` dict matching CAST's schema.
    public static func exportVideo(from params: ShaderParams) -> [String: Any] {
        var out: [String: Any] = [:]
        let scalars: [(String, Float)] = [
            ("blackPoint", params.blackPoint), ("whitePoint", params.whitePoint),
            ("brightness", params.brightness), ("contrast", params.contrast),
            ("shadows", params.shadows), ("midtones", params.midtones),
            ("highlights", params.highlights), ("exposure", params.exposure),
            ("gamma", params.gamma), ("saturation", params.saturation),
            ("clarity", params.clarity),
            ("rezCellWidth", params.rezCellWidth), ("rezCellHeight", params.rezCellHeight),
            ("rezColorLevels", params.rezColorLevels), ("rezMix", params.rezMix),
            ("rezJitter", params.rezJitter),
            ("positionX", params.positionX), ("positionY", params.positionY),
            ("positionRotation", params.positionRotation), ("positionScale", params.positionScale),
            ("rotation", params.rotation), ("scale", params.scale),
            ("distortionFrequency", params.distortionFrequency),
            ("distortionAmplitude", params.distortionAmplitude),
            ("distortionSpeed", params.distortionSpeed),
            ("distortionAngle", params.distortionAngle),
            ("ditherScale", params.ditherScale), ("threshold", params.threshold),
            ("alphaThreshold", params.alphaThreshold),
            ("ditherGradientAngle", params.ditherGradientAngle),
            ("ditherGradientScale", params.ditherGradientScale),
            ("ditherGradientOffsetX", params.ditherGradientOffsetX),
            ("ditherGradientOffsetY", params.ditherGradientOffsetY)
        ]
        for (k, v) in scalars { out[k] = v == v.rounded() ? Int(v) : v }
        out["gradientEnabled"] = params.gradientEnabled
        out["gradientType"] = params.gradientType
        out["gradientOpacity"] = params.gradientOpacity
        out["gradientBlendMode"] = params.gradientBlendMode.rawValue
        out["gradientAngle"] = params.gradientAngle
        out["gradientScale"] = params.gradientScale
        out["gradientOffsetX"] = params.gradientOffsetX
        out["gradientOffsetY"] = params.gradientOffsetY
        out["shaderEnabled"] = params.shaderEnabled
        out["rezEnabled"] = params.rezEnabled
        out["ditherEnabled"] = params.ditherEnabled
        out["ditherType"] = params.ditherType.rawValue
        out["ditherGradient"] = params.ditherGradient
        out["ditherColor"] = vec3ToHex(params.ditherColor)
        out["ditherGradientColorA"] = vec3ToHex(params.ditherGradientColorA)
        out["ditherGradientColorB"] = vec3ToHex(params.ditherGradientColorB)
        out["invertColors"] = false
        out["gradientGuideVisible"] = false
        out["gradientColorA"] = vec3ToHex(params.ditherGradientColorA)
        out["gradientOpacityA"] = 1
        out["gradientColorB"] = vec3ToHex(params.ditherGradientColorB)
        out["gradientOpacityB"] = 1
        out["gradientStops"] = params.gradientStops.enumerated().map { i, s in
            ["id": "stop-\(i + 1)", "color": vec3ToHex(s.color),
             "opacity": s.opacity, "position": s.position]
        }
        return out
    }

    public enum BridgeError: Error {
        case missingVideoSection
    }
}
