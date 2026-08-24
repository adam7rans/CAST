import CoreVideo
import Metal

/// CVPixelBuffer → MTLTexture with a texture cache (no per-frame allocations).
public final class TextureUploader {
    private var textureCache: CVMetalTextureCache?
    private let device: MTLDevice

    public init(device: MTLDevice) {
        self.device = device
        CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, device, nil, &textureCache)
    }

    /// Wraps (not copies) the pixel buffer's plane 0 as a drawable MTLTexture.
    /// The returned CVMetalTexture must stay alive until GPU work using it is enqueued.
    public func texture(for pixelBuffer: CVPixelBuffer) -> (MTLTexture?, CVMetalTexture?) {
        guard let cache = textureCache else { return (nil, nil) }
        var cvTexture: CVMetalTexture?
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        let status = CVMetalTextureCacheCreateTextureFromImage(
            kCFAllocatorDefault, cache, pixelBuffer, nil, .bgra8Unorm,
            width, height, 0, &cvTexture)
        guard status == kCVReturnSuccess, let wrapped = cvTexture,
              let tex = CVMetalTextureGetTexture(wrapped) else { return (nil, nil) }
        return (tex, wrapped)
    }
}
