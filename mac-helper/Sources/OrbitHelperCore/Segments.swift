import Foundation

/// One timed line of the transcript, as Orbit's ingest route expects it. Speaker is "me" or "other".
public struct TimedSegment: Codable, Equatable, Sendable {
    public var start: Double
    public var end: Double
    public var speaker: String
    public var text: String

    public init(start: Double, end: Double, speaker: String, text: String) {
        self.start = start
        self.end = end
        self.speaker = speaker
        self.text = text
    }
}

/// Things Whisper writes for silence or music. They never reach Orbit.
let noiseLines: Set<String> = [
    "[blank_audio]", "(silence)", "[silence]", "[music]", "(music)", "[applause]", "(applause)",
    "[inaudible]", "(inaudible)", "[no speech]", "you", "thank you.", "thanks for watching!", "...",
]

/// Removes Whisper's noise lines and its habit of repeating the same short line over silence.
public func cleanSegments(_ segments: [TimedSegment]) -> [TimedSegment] {
    var out: [TimedSegment] = []
    for var s in segments {
        s.text = s.text
            .replacingOccurrences(of: #"<\|[^|]*\|>"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if s.text.isEmpty || noiseLines.contains(s.text.lowercased()) { continue }
        if let last = out.last, last.speaker == s.speaker, last.text == s.text, s.text.count < 40 { continue }
        out.append(s)
    }
    return out
}

/// Puts the two tracks on one timeline. `othersOffset` is how many seconds after the microphone the system audio
/// track started. Lines from the same speaker less than `gap` seconds apart become one line while it stays short.
public func mergeTracks(me: [TimedSegment], others: [TimedSegment], othersOffset: Double = 0, gap: Double = 1.5, maxChars: Int = 700) -> [TimedSegment] {
    let shifted = others.map { TimedSegment(start: $0.start + othersOffset, end: $0.end + othersOffset, speaker: $0.speaker, text: $0.text) }
    let all = (cleanSegments(me) + cleanSegments(shifted)).sorted { $0.start == $1.start ? $0.speaker < $1.speaker : $0.start < $1.start }
    var out: [TimedSegment] = []
    for s in all {
        if var last = out.last, last.speaker == s.speaker, s.start - last.end <= gap, last.text.count + s.text.count + 1 <= maxChars {
            last.end = max(last.end, s.end)
            last.text += " " + s.text
            out[out.count - 1] = last
        } else {
            out.append(s)
        }
    }
    return out
}

/// Seconds of speech in the merged transcript. A recording with almost none is not worth sending.
public func spokenSeconds(_ segments: [TimedSegment]) -> Double {
    segments.reduce(0) { $0 + max(0, $1.end - $1.start) }
}
