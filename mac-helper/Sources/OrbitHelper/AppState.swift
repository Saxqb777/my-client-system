import AppKit
import AVFoundation
import EventKit
import Foundation
import Network
import OrbitHelperCore
import ServiceManagement
import os

/// The helper's brain: watches for calls, records, transcribes, queues and sends, then follows the meeting in Orbit.
/// States shown in the menu bar: idle, listening, transcribing, sending, sent, error.
@MainActor
final class AppState: ObservableObject {
    enum Phase: Equatable {
        case idle, listening, transcribing, sending, sent, error
    }

    struct Recording {
        let startedAt: Date
        let app: CallApp?
        let manual: Bool
        let calendarTitle: String?
        let attendees: [String]
        let windowTitle: String?
    }

    @Published var phase: Phase = .idle
    @Published var detail = "Watching for calls"
    @Published var queued = 0
    @Published var lastMeetingURL: URL?
    @Published var transcriberReady = false
    @Published var permissions = ""
    @Published var diagnostics = ""
    @Published var autoDetect = Settings.autoDetect { didSet { Settings.autoDetect = autoDetect } }
    @Published var keepAudio = Settings.keepAudio { didSet { Settings.keepAudio = keepAudio } }
    @Published var launchAtLogin = SMAppService.mainApp.status == .enabled

    private let log = Logger(subsystem: "ai.fero.orbit-helper", category: "app")
    private let detector = CallDetector()
    private let recorder = Recorder()
    private let transcriber = Transcriber()
    private let calendar = CalendarReader()
    private let queue = SendQueue()
    private let network = NWPathMonitor()
    private var tracker = CallTracker(grace: Settings.graceSeconds)
    private var recording: Recording?
    private var timer: Timer?
    /// True while the recorder opens or closes its files, so nothing starts a second recording on top of it.
    private var starting = false
    private var stopping = false
    /// After Stop on a call the helper found by itself, wait for that call to end before watching again.
    private var ignoreUntilCallEnds = false
    /// Transcriptions run one after another. A new call can be recorded while the last one is still transcribing.
    private var transcriptions: Task<Void, Never>?

    var symbol: String {
        switch phase {
        case .idle: "waveform"
        case .listening: "record.circle"
        case .transcribing: "text.bubble"
        case .sending: "arrow.up.circle"
        case .sent: "checkmark.circle"
        case .error: "exclamationmark.triangle"
        }
    }

    var isRecording: Bool { recording != nil }

    var statusLine: String {
        switch phase {
        case .idle: "Idle"
        case .listening: "Listening\(recording?.app.map { " to \($0.label)" } ?? "")"
        case .transcribing: "Transcribing"
        case .sending: "Sending to Orbit"
        case .sent: "Sent"
        case .error: "Needs attention"
        }
    }

    init() {
        Task { @MainActor in self.start() }
    }

    private func start() {
        // A cheap check every three seconds: two Core Audio reads, and a window list only when a call app holds the mic.
        timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        timer?.tolerance = 1
        network.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in await self?.flushQueue() }
        }
        network.start(queue: DispatchQueue(label: "ai.fero.orbit-helper.network"))
        refreshPermissions()
        Task {
            await refreshQueueCount()
            await prepareTranscriber()
            await flushQueue()
        }
        // Retry waiting transcripts on their backoff schedule even if the network never changes.
        Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.flushQueue() }
        }
    }

    // MARK: Calls

    private func tick() {
        guard !stopping else { return }
        if let r = recording, r.manual { return }
        guard autoDetect || recording != nil else { return }
        let seen = detector.observe()
        if ignoreUntilCallEnds {
            if seen.app == nil { ignoreUntilCallEnds = false }
            return
        }
        switch tracker.observe(seen.app, at: Date()) {
        case let .started(app):
            Task { await beginRecording(app: app, windowTitle: seen.windowTitle, manual: false) }
        case let .ended(_, ended):
            Task { await finishRecording(endedAt: ended) }
        case .none:
            break
        }
    }

    func startManually() {
        guard recording == nil, !starting else { return }
        Task { await beginRecording(app: nil, windowTitle: nil, manual: true) }
    }

    func stopManually() {
        guard let r = recording else { return }
        if !r.manual {
            _ = tracker.stop(at: Date())
            ignoreUntilCallEnds = true
        }
        Task { await finishRecording(endedAt: Date()) }
    }

    private func beginRecording(app: CallApp?, windowTitle: String?, manual: Bool) async {
        guard recording == nil, !starting, !stopping else { return }
        starting = true
        defer { starting = false }
        let now = Date()
        let event = calendar.event(at: now)
        do {
            try await recorder.start()
            recording = Recording(startedAt: now, app: app, manual: manual, calendarTitle: event?.title, attendees: event?.attendees ?? [], windowTitle: windowTitle)
            phase = .listening
            detail = event?.title ?? windowTitle ?? "Recording"
            log.info("recording started")
        } catch {
            fail("Could not start recording: \(error.localizedDescription)")
        }
    }

    private func finishRecording(endedAt: Date) async {
        guard let r = recording else { return }
        stopping = true
        recording = nil
        let files = await recorder.stop()
        stopping = false
        let duration = endedAt.timeIntervalSince(r.startedAt)
        guard duration >= Settings.minCallSeconds else {
            deleteAudio(files)
            show(.idle, "Call under a minute, not sent")
            return
        }
        show(.transcribing, r.calendarTitle ?? r.windowTitle ?? "Transcribing")
        let previous = transcriptions
        transcriptions = Task { @MainActor in
            await previous?.value
            await self.transcribeAndQueue(r, files: files, endedAt: endedAt)
        }
    }

    private func transcribeAndQueue(_ r: Recording, files: Recorder.Files, endedAt: Date) async {
        do {
            await prepareTranscriber()
            let prompt = await vocabularyPrompt()
            var me: [TimedSegment] = []
            var others: [TimedSegment] = []
            if let mic = files.mic { me = try await transcriber.transcribe(mic, speaker: "me", prompt: prompt, language: Settings.language) }
            if let sys = files.system { others = try await transcriber.transcribe(sys, speaker: "other", prompt: prompt, language: Settings.language) }
            let segments = mergeTracks(me: me, others: others, othersOffset: files.systemOffset)
            if !keepAudio { deleteAudio(files) }
            guard spokenSeconds(segments) >= 20 else {
                show(.idle, "Almost nothing was said, not sent")
                return
            }
            let body = IngestBody(startedAt: r.startedAt, endedAt: endedAt, calendarTitle: r.calendarTitle ?? r.windowTitle, attendees: r.attendees, language: Settings.language, segments: segments)
            _ = try await queue.enqueue(body)
            await refreshQueueCount()
            await flushQueue()
        } catch {
            // The audio stays on disk when transcription fails, so nothing is lost.
            fail("Transcription failed, audio kept: \(error.localizedDescription)")
        }
    }

    /// Updates the menu bar, but never hides a recording in progress: while listening, only the log gets the news.
    private func show(_ next: Phase, _ text: String) {
        guard recording == nil else {
            log.info("\(text, privacy: .public)")
            return
        }
        phase = next
        detail = text
    }

    private func deleteAudio(_ files: Recorder.Files) {
        for url in [files.mic, files.system].compactMap({ $0 }) { try? FileManager.default.removeItem(at: url) }
    }

    // MARK: Orbit

    func flushQueue(force: Bool = false) async {
        guard !(await queue.due(force: force)).isEmpty else { return }
        let client: OrbitClient
        do { client = try OrbitClient.fromKeychain() } catch {
            fail(error.localizedDescription)
            return
        }
        show(.sending, "Sending to Orbit")
        for outcome in await queue.flush(client: client, force: force) {
            switch outcome {
            case let .sent(title, meetingId):
                show(.sent, "Sent: \(title)")
                lastMeetingURL = client.meetingURL(meetingId)
                Task { await follow(meetingId, client: client) }
            case let .later(reason):
                show(.error, "Waiting to send, will retry: \(reason)")
            case let .failed(reason):
                fail("Orbit refused a transcript: \(reason)")
            }
        }
        await refreshQueueCount()
    }

    /// Polls the meeting until Orbit has processed it. If it sits in received or processing for five minutes, asks Orbit to run it again once.
    private func follow(_ id: String, client: OrbitClient) async {
        var nudged = false
        for round in 1 ... 40 {
            try? await Task.sleep(for: .seconds(15))
            guard let s = try? await client.status(id) else { continue }
            switch s.processing ?? "" {
            case "processed":
                show(.sent, "Minutes ready: \(s.title ?? "meeting")")
                return
            case "needs_review":
                show(.sent, "In Orbit, needs a client: \(s.title ?? "meeting")")
                return
            case "failed":
                fail("Orbit could not draft the minutes: \(s.errorMessage ?? "unknown")")
                return
            default:
                if round >= 20 && !nudged {
                    try? await client.process(id)
                    nudged = true
                }
            }
        }
    }

    private func vocabularyPrompt() async -> String? {
        if let client = try? OrbitClient.fromKeychain(), let prompt = try? await client.vocabularyPrompt() {
            try? prompt.write(to: Settings.vocabularyFile, atomically: true, encoding: .utf8)
            return prompt
        }
        return try? String(contentsOf: Settings.vocabularyFile, encoding: .utf8)
    }

    private func prepareTranscriber() async {
        guard !transcriberReady else { return }
        do {
            try await transcriber.prepare(model: Settings.whisperModel)
            transcriberReady = true
        } catch {
            log.error("transcriber not ready: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func refreshQueueCount() async {
        queued = await queue.jobs().count
    }

    private func fail(_ message: String) {
        log.error("\(message, privacy: .public)")
        show(.error, message)
    }

    // MARK: Settings

    func setLaunchAtLogin(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            launchAtLogin = SMAppService.mainApp.status == .enabled
        } catch {
            fail("Open at login: \(error.localizedDescription)")
        }
    }

    func requestPermissions() {
        Task {
            _ = await AVCaptureDevice.requestAccess(for: .audio)
            _ = await calendar.requestAccess()
            if !CGPreflightScreenCaptureAccess() { _ = CGRequestScreenCaptureAccess() }
            refreshPermissions()
        }
    }

    func checkDetection() {
        diagnostics = detector.diagnostics()
    }

    func refreshPermissions() {
        let mic = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized ? "allowed" : "not allowed"
        let cal = calendar.authorized ? "allowed" : "not allowed"
        let screen = CGPreflightScreenCaptureAccess() ? "allowed" : "not allowed"
        permissions = "Microphone \(mic). Calendar \(cal). Screen and system audio \(screen)."
    }
}
