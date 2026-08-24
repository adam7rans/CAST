import Foundation
import Metal

/// Loads and runtime-compiles Shaders.msl; surfaces compile errors verbatim.
public final class ShaderCompiler {
    public private(set) var library: MTLLibrary?
    public private(set) var lastError: String?

    public init() {}

    /// Compile MSL source. Returns nil on failure (see lastError).
    @discardableResult
    public func compile(source: String, device: MTLDevice) -> MTLLibrary? {
        do {
            let lib = try device.makeLibrary(source: source, options: nil)
            library = lib
            lastError = nil
            return lib
        } catch {
            // makeLibrary puts the full compiler diagnostics in NSError.debugDescription
            lastError = String(describing: error)
            library = nil
            return nil
        }
    }

    /// Locate Shaders.msl in app bundle or alongside sources (dev mode).
    public static func loadShaderSource() -> String? {
        if let url = Bundle.main.url(forResource: "Shaders", withExtension: "msl") {
            return try? String(contentsOf: url, encoding: .utf8)
        }
        let candidates = [
            "Resources/Shaders.msl",
            "../Resources/Shaders.msl",
            "../../Resources/Shaders.msl"
        ]
        for rel in candidates {
            let url = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(rel)
            if FileManager.default.fileExists(atPath: url.path) {
                return try? String(contentsOf: url, encoding: .utf8)
            }
        }
        return nil
    }

    public func makeFunction(_ name: String) -> MTLFunction? {
        library?.makeFunction(name: name)
    }
}
