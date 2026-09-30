import Foundation
import OrbitHelperCore
import os

/// Transcripts wait here until Orbit has them. Each is a JSON file in Application Support/OrbitHelper/queue, so a
/// transcript survives a lost connection, a quit or a restart. A file is removed only after Orbit answered 200 or 202.
actor SendQueue {
    struct Job: Codable {
        var id: String
        var title: String
        var createdAt: Date
        var attempts: Int
        var nextTry: Date
        var lastError: String?
    }

    enum Outcome {
        case sent(jobTitle: String, meetingId: String)
        case later(String)
        case failed(String)
    }

    private let log = Logger(subsystem: "ai.fero.orbit-helper", category: "queue")
    private let dir = Settings.queueDir
    /// The network monitor, the minute timer and a finished call can all ask for a flush; only one runs at a time.
    private var flushing = false

    private func bodyURL(_ id: String) -> URL { dir.appendingPathComponent("\(id).json") }
    private func jobURL(_ id: String) -> URL { dir.appendingPathComponent("\(id).job.json") }

    func enqueue(_ body: IngestBody) throws -> String {
        let data = try body.encoded()
        guard data.count <= IngestBody.maxBytes else { throw OrbitError.http(413, "Transcript over 5 MB") }
        let id = UUID().uuidString
        try data.write(to: bodyURL(id), options: .atomic)
        let job = Job(id: id, title: body.calendarTitle ?? "Untitled call", createdAt: Date(), attempts: 0, nextTry: Date(), lastError: nil)
        try JSONEncoder().encode(job).write(to: jobURL(id), options: .atomic)
        log.info("queued transcript \(id, privacy: .public)")
        return id
    }

    func jobs() -> [Job] {
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        return files
            .filter { $0.lastPathComponent.hasSuffix(".job.json") }
            .compactMap { try? JSONDecoder().decode(Job.self, from: Data(contentsOf: $0)) }
            .sorted { $0.createdAt < $1.createdAt }
    }

    /// Jobs to send now. `force` ignores the backoff, for the menu's Send now.
    func due(force: Bool = false) -> [Job] {
        jobs().filter { force || $0.nextTry <= Date() }
    }

    /// Sends every job that is due.
    func flush(client: OrbitClient, force: Bool = false) async -> [Outcome] {
        guard !flushing else { return [] }
        flushing = true
        defer { flushing = false }
        var outcomes: [Outcome] = []
        for var job in due(force: force) {
            do {
                let body = try Data(contentsOf: bodyURL(job.id))
                let res = try await client.ingest(body)
                try? FileManager.default.removeItem(at: bodyURL(job.id))
                try? FileManager.default.removeItem(at: jobURL(job.id))
                log.info("sent \(job.id, privacy: .public) as meeting \(res.meetingId, privacy: .public)")
                outcomes.append(.sent(jobTitle: job.title, meetingId: res.meetingId))
            } catch let error as OrbitError where !error.retryable {
                // Orbit refused the body itself. Keep it in failed/ for a look, do not retry forever.
                try? FileManager.default.moveItem(at: bodyURL(job.id), to: Settings.failedDir.appendingPathComponent("\(job.id).json"))
                try? FileManager.default.removeItem(at: jobURL(job.id))
                log.error("gave up on \(job.id, privacy: .public): \(error.localizedDescription, privacy: .public)")
                outcomes.append(.failed(error.localizedDescription))
            } catch {
                job.attempts += 1
                job.nextTry = Date().addingTimeInterval(retryDelay(attempt: job.attempts))
                job.lastError = error.localizedDescription
                try? JSONEncoder().encode(job).write(to: jobURL(job.id), options: .atomic)
                log.notice("will retry \(job.id, privacy: .public) in \(Int(retryDelay(attempt: job.attempts)))s")
                outcomes.append(.later(error.localizedDescription))
            }
        }
        return outcomes
    }
}
