import AVFoundation
import CoreVideo
import Foundation

/// AVCaptureSession wrapper delivering BGRA frames on a private queue.
public final class CameraCapture: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    public var onFrame: ((CVPixelBuffer, CMTime) -> Void)?
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "cast-metal.capture")
    private(set) public var device: AVCaptureDevice?

    public static func listCameras() -> [AVCaptureDevice] {
        if #available(macOS 14.0, *) {
            return AVCaptureDevice.DiscoverySession(
                deviceTypes: [.builtInWideAngleCamera, .external, .continuityCamera],
                mediaType: .video,
                position: .unspecified
            ).devices
        }
        return AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera],
            mediaType: .video,
            position: .unspecified
        ).devices
    }

    /// Returns nil on failure with reason in `errorOut`.
    public func start(device: AVCaptureDevice? = nil, width: Int = 1920, height: Int = 1080, fps: Int = 30) -> String? {
        let target = device ?? Self.listCameras().first
        guard let camera = target else { return "No camera found" }
        guard AuthorizationState.cameraAuthorized() else { return "Camera permission not granted" }

        session.beginConfiguration()
        session.sessionPreset = .high
        do {
            let input = try AVCaptureDeviceInput(device: camera)
            if session.canAddInput(input) { session.addInput(input) } else { return "Cannot add camera input" }
            let output = AVCaptureVideoDataOutput()
            output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
            output.alwaysDiscardsLateVideoFrames = true
            output.setSampleBufferDelegate(self, queue: queue)
            if session.canAddOutput(output) { session.addOutput(output) } else { return "Cannot add video output" }
        } catch {
            return "Capture setup failed: \(error.localizedDescription)"
        }
        session.commitConfiguration()

        // Prefer requested dimensions/fps when the device supports them.
        do { try camera.lockForConfiguration() } catch { return "lockForConfiguration failed" }
        if let format = bestFormat(for: camera, width: width, height: height, fps: Double(fps)) {
            camera.activeFormat = format.format
            camera.activeVideoMinFrameDuration = format.frameDuration
            camera.activeVideoMaxFrameDuration = format.frameDuration
        }
        if camera.isFocusModeSupported(.continuousAutoFocus) { camera.focusMode = .continuousAutoFocus }
        camera.unlockForConfiguration()

        self.device = camera
        session.startRunning()
        return nil // success
    }

    private struct FormatPick { let format: AVCaptureDevice.Format; let frameDuration: CMTime }

    private func bestFormat(for device: AVCaptureDevice, width: Int, height: Int, fps: Double) -> FormatPick? {
        var fallback: FormatPick?
        for f in device.formats {
            let dims = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            for range in f.videoSupportedFrameRateRanges where Double(range.maxFrameRate) >= fps {
                let pick = FormatPick(format: f, frameDuration: CMTime(value: 1, timescale: CMTimeScale(fps)))
                if dims.width == width && dims.height == height { return pick }
                if fallback == nil { fallback = pick }
            }
        }
        return fallback
    }

    public func stop() {
        session.stopRunning()
    }

    public func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pb = sampleBuffer.imageBuffer else { return }
        onFrame?(pb, sampleBuffer.presentationTimeStamp)
    }

    /// Mirror the front camera horizontally (FaceTime convention).
    public static func isMirrored(connection: AVCaptureConnection) -> Bool {
        connection.isVideoMirrored
    }
}

public enum AuthorizationState {
    public static func cameraAuthorized() -> Bool {
        AVCaptureDevice.authorizationStatus(for: .video) == .authorized
    }

    public static func requestCameraAccess(_ completion: @escaping (Bool) -> Void) {
        AVCaptureDevice.requestAccess(for: .video, completionHandler: completion)
    }
}
