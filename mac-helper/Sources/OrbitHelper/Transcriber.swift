import Foundation
import OrbitHelperCore
import WhisperKit

/// Local speech to text with WhisperKit on the Apple Neural Engine. The audio never leaves the Mac; only text goes to Orbit.
/// The first prepare() downloads the model (several hundred MB) into ~/Documents/huggingface and keeps it.
actor Transcriber {
    private var pipe: WhisperKit?

    var isReady: Bool { pipe != nil }

    func prepare(model: String) async throws {
        guard pipe == nil else { return }
        let config = WhisperKitConfig(model: model, verbose: false, logLevel: .error, prewarm: true, load: true, download: true)
        pipe = try await WhisperKit(config)
    }

    /// One track to timed lines. `prompt` is Orbit's vocabulary (client names, people, acronyms) so they are spelled right.
    func transcribe(_ url: URL, speaker: String, prompt: String?, language: String) async throws -> [TimedSegment] {
        guard let pipe else { throw NSError(domain: "OrbitHelper", code: 1, userInfo: [NSLocalizedDescriptionKey: "Transcriber is not ready"]) }
        var options = DecodingOptions()
        options.task = .transcribe
        options.language = language
        options.temperature = 0
        options.usePrefillPrompt = true
        options.skipSpecialTokens = true
        options.withoutTimestamps = false
        options.chunkingStrategy = .vad
        if let prompt, !prompt.isEmpty, let tokenizer = pipe.tokenizer {
            // Whisper keeps at most about 224 prompt tokens; the most recent terms are kept.
            let tokens = tokenizer.encode(text: " " + prompt).filter { $0 < tokenizer.specialTokens.specialTokenBegin }
            options.promptTokens = Array(tokens.suffix(200))
        }
        let results = try await pipe.transcribe(audioPath: url.path, decodeOptions: options)
        return results
            .flatMap(\.segments)
            .map { TimedSegment(start: Double($0.start), end: Double($0.end), speaker: speaker, text: $0.text) }
    }
}
