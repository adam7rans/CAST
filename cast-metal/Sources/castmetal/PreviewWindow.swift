import AppKit
import Metal
import MetalKit

/// Borderless, resizable preview window rendering processed frames via CAMetalLayer.
final class PreviewWindow: NSWindow, NSWindowDelegate {
    let metalView: MTKView

    init(device: MTLDevice) {
        metalView = MTKView(frame: NSRect(x: 0, y: 0, width: 960, height: 540), device: device)
        metalView.enableSetNeedsDisplay = false
        metalView.isPaused = false // driven manually; we draw on each camera frame
        metalView.autoresizingMask = [.width, .height]
        metalView.colorPixelFormat = .bgra8Unorm
        metalView.framebufferOnly = true

        super.init(contentRect: metalView.frame,
                   styleMask: [.resizable],
                   backing: .buffered, defer: false)
        contentView = metalView
        // Borderless: OBS window capture sees pure video pixels, no chrome.
        title = "CAST Metal"
        isMovableByWindowBackground = true
        isReleasedWhenClosed = false
        level = .floating
        delegate = self
        center()
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        // Hide instead of quit: the shader engine must stay alive while
        // OBS captures this window. Quit with Cmd+Q or the menu.
        sender.orderOut(nil)
        return false
    }
}

/// Converts a rendered offscreen texture into the MTKView drawable each frame.
final class ViewRenderer: NSObject, MTKViewDelegate {
    private let device: MTLDevice
    private let commandQueue: MTLCommandQueue
    weak var view: MTKView?
    var latestTexture: MTLTexture?

    init(device: MTLDevice) {
        self.device = device
        self.commandQueue = device.makeCommandQueue()!
        super.init()
    }

    func draw(in view: MTKView) {
        guard let tex = latestTexture,
              let drawable = view.currentDrawable,
              let pass = view.currentRenderPassDescriptor,
              let cb = commandQueue.makeCommandBuffer() else { return }
        // Blit when drawable matches render-target size; else clear (rare).
        if tex.width == Int(view.drawableSize.width) && tex.height == Int(view.drawableSize.height) {
            guard let blit: MTLBlitCommandEncoder = cb.makeBlitCommandEncoder() else { return }
            blit.copy(from: tex, sourceSlice: 0, sourceLevel: 0,
                      sourceOrigin: MTLOrigin(x: 0, y: 0, z: 0),
                      sourceSize: MTLSize(width: tex.width, height: tex.height, depth: 1),
                      to: drawable.texture, destinationSlice: 0, destinationLevel: 0,
                      destinationOrigin: MTLOrigin(x: 0, y: 0, z: 0))
            blit.endEncoding()
        } else {
            pass.colorAttachments[0].clearColor = MTLClearColor(red: 0.05, green: 0.05, blue: 0.07, alpha: 1)
            guard let encoder = cb.makeRenderCommandEncoder(descriptor: pass) else { return }
            encoder.endEncoding()
        }
        cb.present(drawable)
        cb.commit()
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}
}
