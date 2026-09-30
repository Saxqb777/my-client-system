import Foundation

/// Everything the helper can be told, stored in the app's user defaults (domain ai.fero.orbit-helper).
/// Change from Terminal, for example: defaults write ai.fero.orbit-helper orbitURL https://orbit-eta-brown.vercel.app
enum Settings {
    private static let d = UserDefaults.standard

    static var orbitURL: URL {
        URL(string: d.string(forKey: "orbitURL") ?? "") ?? URL(string: "https://orbit-eta-brown.vercel.app")!
    }

    /// WhisperKit model. The turbo model is a good balance on Apple Silicon; "base" is small and quick for a first test.
    static var whisperModel: String { d.string(forKey: "whisperModel") ?? "large-v3-v20240930_turbo" }
    static var language: String { d.string(forKey: "language") ?? "en" }

    static var autoDetect: Bool {
        get { d.object(forKey: "autoDetect") as? Bool ?? true }
        set { d.set(newValue, forKey: "autoDetect") }
    }

    /// Raw audio is deleted as soon as the transcript exists, unless this is on.
    static var keepAudio: Bool {
        get { d.object(forKey: "keepAudio") as? Bool ?? false }
        set { d.set(newValue, forKey: "keepAudio") }
    }

    /// Seconds a call may drop before the recording ends, so a quick rejoin stays one meeting.
    static var graceSeconds: Double { d.object(forKey: "graceSeconds") as? Double ?? 90 }
    /// Calls shorter than this are not sent.
    static var minCallSeconds: Double { d.object(forKey: "minCallSeconds") as? Double ?? 60 }

    static var supportDir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("OrbitHelper", isDirectory: true)
    }
    static var recordingsDir: URL { folder("recordings") }
    static var queueDir: URL { folder("queue") }
    static var failedDir: URL { folder("failed") }
    static var vocabularyFile: URL { supportDir.appendingPathComponent("vocabulary.txt") }

    private static func folder(_ name: String) -> URL {
        let url = supportDir.appendingPathComponent(name, isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
}
