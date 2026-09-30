import Foundation

/// The JSON body for POST /api/meetings/ingest. Mirrors ingestBodySchema in src/lib/meetings/ingest.ts.
public struct IngestBody: Codable, Equatable, Sendable {
    public var source: String = "mac_helper"
    public var startedAt: String
    public var endedAt: String?
    public var calendarTitle: String?
    public var title: String?
    public var attendees: [String]
    public var language: String
    public var segments: [TimedSegment]
    public var clientCode: String?

    public init(startedAt: Date, endedAt: Date?, calendarTitle: String?, attendees: [String], language: String = "en", segments: [TimedSegment], clientCode: String? = nil) {
        self.startedAt = IngestBody.iso(startedAt)
        self.endedAt = endedAt.map(IngestBody.iso)
        self.calendarTitle = calendarTitle.map { String($0.prefix(300)) }
        self.title = nil
        // Orbit accepts at most 100 attendees of up to 120 characters each.
        self.attendees = Array(attendees.map { String($0.prefix(120)) }.filter { !$0.isEmpty }.prefix(100))
        self.language = language
        self.segments = Array(segments.prefix(20000)).map { TimedSegment(start: max(0, $0.start), end: max($0.start, $0.end), speaker: $0.speaker, text: String($0.text.prefix(5000))) }
        self.clientCode = clientCode
    }

    /// ISO 8601 with the local offset, for example 2026-09-29T09:03:00+04:00. Orbit requires the offset.
    public static func iso(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        f.timeZone = .current
        return f.string(from: date)
    }

    public func encoded() throws -> Data {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return try e.encode(self)
    }

    /// Orbit rejects bodies over 5 MB. Long meetings stay far below that, but check before sending.
    public static let maxBytes = 5 * 1024 * 1024
}
