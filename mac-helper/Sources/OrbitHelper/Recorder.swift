import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit
import os

/// Two tracks, kept apart so the transcript knows who spoke: "me" is the microphone (AVAudioEngine), "other" is the
/// Mac's audio output, which is everyone else on the call (ScreenCaptureKit, audio only, this app's own sound excluded).
///
/// Why ScreenCaptureKit and not Core Audio process taps: it has been stable since macOS 13, it captures whatever the call
/// app plays without knowing its process, and its permission (Screen and System Audio Recording) is the same one that
/// makes window titles readable for call detection, so one permission covers both. Process taps would avoid the screen
/// permission but tie the recording to one process id, which breaks when Teams moves audio to a helper process mid call.
/// Nothing joins the call: this only listens to the Mac.
final class Recorder: NSObject, SCStreamOutput, SCStreamDelegate {
    enum RecorderError: LocalizedError {
        case noDisplay, noMicrophone
        var errorDescription: String? {
            switch self {
            case .noDisplay: "No display to attach the system audio capture to"
            case .noMicrophone: "No microphone input. Check the microphone permission for Orbit Helper."
            }
        }
    }

    struct Files {
        let mic: URL?
        let system: URL?
        /// Seconds after the microphone started that the first system audio arrived.
        let systemOffset: Double
    }

    private let log = Logger(subsystem: "ai.fero.orbit-helper", category: "recorder")
    private let engine = AVAudioEngine()
    private let lock = NSLock()
    private let queue = DispatchQueue(label: "ai.fero.orbit-helper.audio")
    private var micFile: AVAudioFile?
    private var systemFile: AVAudioFile?
    private var stream: SCStream?
    private var micURL: URL?
    private var systemURL: URL?
    private var startedAt: Date?
    private var systemStartedAt: Date?
    /// Where the next system audio sample should start, in the stream's clock. A later sample means a gap.
    private var systemNextTime: Double?

    var isRecording: Bool { startedAt != nil }

    func start() async throws {
        let stamp = Int(Date().timeIntervalSince1970)
        let dir = Settings.recordingsDir
        micURL = dir.appendingPathComponent("mic-\(stamp).caf")
        systemURL = dir.appendingPathComponent("system-\(stamp).caf")
        startedAt = Date()
        systemStartedAt = nil
        systemNextTime = nil
        try startMicrophone()
        do {
            try await startSystemAudio()
        } catch {
            // Without the screen permission the call is still recorded from the mic; the other side will be missing.
            log.error("system audio did not start: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func startMicrophone() throws {
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        // Without the permission or a device, the input reports an empty format and installing a tap would crash.
        guard format.sampleRate > 0, format.channelCount > 0 else { throw RecorderError.noMicrophone }
        let file = try AVAudioFile(forWriting: micURL!, settings: format.settings, commonFormat: .pcmFormatFloat32, interleaved: false)
        lock.withLock { micFile = file }
        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            self.lock.withLock { try? self.micFile?.write(from: buffer) }
        }
        engine.prepare()
        try engine.start()
    }

    private func startSystemAudio() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first else { throw RecorderError.noDisplay }
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = 48_000
        config.channelCount = 1
        // Video cannot be switched off, so ask for the smallest, slowest picture there is and throw it away.
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        config.queueDepth = 3
        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
        try await stream.startCapture()
        self.stream = stream
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, sampleBuffer.isValid, let buffer = Self.pcmBuffer(from: sampleBuffer) else { return }
        let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds
        lock.withLock {
            if systemFile == nil, let url = systemURL {
                systemStartedAt = Date()
                systemFile = try? AVAudioFile(forWriting: url, settings: buffer.format.settings, commonFormat: buffer.format.commonFormat, interleaved: buffer.format.isInterleaved)
            }
            // If the capture skipped a quiet stretch, write silence for it so the file stays on the call's clock
            // and the two tracks still line up.
            if let next = systemNextTime, time.isFinite, time - next > 0.05 {
                writeSilence(seconds: min(time - next, 4 * 3600), format: buffer.format)
            }
            systemNextTime = time.isFinite ? time + Double(buffer.frameLength) / buffer.format.sampleRate : nil
            try? systemFile?.write(from: buffer)
        }
    }

    /// Call with the lock held.
    private func writeSilence(seconds: Double, format: AVAudioFormat) {
        guard let file = systemFile else { return }
        var remaining = AVAudioFrameCount(seconds * format.sampleRate)
        let chunk: AVAudioFrameCount = 48_000
        guard let silence = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: chunk) else { return }
        let list = UnsafeMutableAudioBufferListPointer(silence.mutableAudioBufferList)
        while remaining > 0 {
            let frames = min(chunk, remaining)
            silence.frameLength = frames
            for buffer in list { if let data = buffer.mData { memset(data, 0, Int(buffer.mDataByteSize)) } }
            try? file.write(from: silence)
            remaining -= frames
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        log.error("system audio stopped: \(error.localizedDescription, privacy: .public)")
    }

    /// Stops both tracks and closes the files. Returns what was written.
    func stop() async -> Files {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        if let stream { try? await stream.stopCapture() }
        stream = nil
        let offset: Double = lock.withLock {
            micFile = nil
            systemFile = nil
            guard let s = startedAt, let t = systemStartedAt else { return 0 }
            return max(0, t.timeIntervalSince(s))
        }
        let exists = { (u: URL?) in u.flatMap { FileManager.default.fileExists(atPath: $0.path) ? $0 : nil } }
        let files = Files(mic: exists(micURL), system: systemStartedAt == nil ? nil : exists(systemURL), systemOffset: offset)
        startedAt = nil
        return files
    }

    /// Copies a ScreenCaptureKit audio sample into a buffer AVAudioFile can write.
    private static func pcmBuffer(from sampleBuffer: CMSampleBuffer) -> AVAudioPCMBuffer? {
        guard let description = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(description),
              let format = AVAudioFormat(streamDescription: asbd) else { return nil }
        let frames = AVAudioFrameCount(CMSampleBufferGetNumSamples(sampleBuffer))
        guard frames > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return nil }
        buffer.frameLength = frames
        let status = CMSampleBufferCopyPCMDataIntoAudioBufferList(sampleBuffer, at: 0, frameCount: Int32(frames), into: buffer.mutableAudioBufferList)
        return status == noErr ? buffer : nil
    }
}
