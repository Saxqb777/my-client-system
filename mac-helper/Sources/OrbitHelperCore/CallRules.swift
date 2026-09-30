import Foundation

/// Which call apps the helper watches, and how it tells a call window from the rest of the app.
public enum CallApp: String, Codable, Sendable, CaseIterable {
    case teams, zoom, meet

    public var label: String {
        switch self {
        case .teams: "Teams"
        case .zoom: "Zoom"
        case .meet: "Google Meet"
        }
    }
}

public enum CallRules {
    /// New Teams, classic Teams, Zoom, and the browsers Meet runs in.
    public static let teamsBundles: Set<String> = ["com.microsoft.teams2", "com.microsoft.teams"]
    public static let zoomBundles: Set<String> = ["us.zoom.xos"]
    public static let browserBundles: Set<String> = ["com.google.Chrome", "com.apple.Safari", "com.microsoft.edgemac", "company.thebrowser.Browser", "org.mozilla.firefox", "com.brave.Browser"]

    /// Which app a process holding the microphone belongs to. Helper processes carry the parent's bundle id as a
    /// prefix (com.microsoft.teams2.helper, com.google.Chrome.helper), so prefixes are matched. Browsers map to Meet
    /// only as a candidate: a Meet window must also be open.
    public static func app(forBundle bundle: String) -> CallApp? {
        let b = bundle.lowercased()
        if b.hasPrefix("com.microsoft.teams") { return .teams }
        if b.hasPrefix("us.zoom") { return .zoom }
        if browserBundles.contains(where: { b.hasPrefix($0.lowercased()) }) { return .meet }
        // Safari captures the microphone in WebKit's own process, not in Safari itself.
        if b.hasPrefix("com.apple.webkit") { return .meet }
        return nil
    }

    /// Window owner names as macOS reports them, per app.
    public static let owners: [CallApp: [String]] = [
        .teams: ["Microsoft Teams", "Microsoft Teams (work or school)", "Microsoft Teams classic"],
        .zoom: ["zoom.us"],
        .meet: ["Google Chrome", "Safari", "Microsoft Edge", "Arc", "Firefox", "Brave Browser"],
    ]

    /// Teams names its main window after the section you are in. A meeting window has the meeting subject instead.
    static let teamsSections = ["chat", "activity", "calendar", "teams", "calls", "onedrive", "files", "apps", "copilot", "communities", "people", "settings", "microsoft teams", "notifications"]

    /// True for a Teams window that looks like a call: not a section window, not empty.
    public static func isTeamsCallWindow(_ title: String) -> Bool {
        let t = title.trimmingCharacters(in: .whitespaces).lowercased()
        guard !t.isEmpty else { return false }
        let head = t.components(separatedBy: "|").first?.trimmingCharacters(in: .whitespaces) ?? t
        if teamsSections.contains(head) { return false }
        if head.hasPrefix("chat") || head.hasPrefix("calendar") { return false }
        return true
    }

    /// Zoom's meeting window is called "Zoom Meeting" or "Zoom Webinar".
    public static func isZoomCallWindow(_ title: String) -> Bool {
        let t = title.lowercased()
        return t.contains("zoom meeting") || t.contains("zoom webinar")
    }

    /// A browser tab on Google Meet shows "Meet - <code>" or "Meet: <name>" in the window title.
    public static func isMeetWindow(_ title: String) -> Bool {
        let t = title.lowercased()
        return t.hasPrefix("meet -") || t.hasPrefix("meet –") || t.hasPrefix("meet:") || t.contains("meet.google.com")
    }

    /// The subject Teams shows for the call, without the app suffix, used when the calendar has nothing.
    public static func callTitle(fromWindow title: String) -> String? {
        let head = title.components(separatedBy: "|").first?.trimmingCharacters(in: .whitespaces) ?? ""
        return head.isEmpty ? nil : head
    }
}

/// Decides when a call started and ended from repeated observations, with a grace period for a quick rejoin.
public struct CallTracker: Sendable {
    public private(set) var activeSince: Date?
    public private(set) var lastSeen: Date?
    public private(set) var app: CallApp?
    public let grace: TimeInterval

    public init(grace: TimeInterval = 90) {
        self.grace = grace
    }

    public enum Event: Equatable, Sendable {
        case none
        case started(CallApp)
        case ended(started: Date, ended: Date)
    }

    /// Feed one observation. `seen` is the app in a call right now, or nil.
    public mutating func observe(_ seen: CallApp?, at now: Date) -> Event {
        if let seen {
            lastSeen = now
            if activeSince == nil {
                activeSince = now
                app = seen
                return .started(seen)
            }
            return .none
        }
        guard let since = activeSince, let last = lastSeen else { return .none }
        if now.timeIntervalSince(last) >= grace {
            activeSince = nil
            lastSeen = nil
            app = nil
            return .ended(started: since, ended: last)
        }
        return .none
    }

    /// Manual stop from the menu: end now, whatever the signals say.
    public mutating func stop(at now: Date) -> Event {
        guard let since = activeSince else { return .none }
        activeSince = nil
        lastSeen = nil
        app = nil
        return .ended(started: since, ended: now)
    }
}

/// Seconds to wait before retry number `attempt` (1 based): 30 s, 2 min, 10 min, 30 min, then every hour.
public func retryDelay(attempt: Int) -> TimeInterval {
    switch attempt {
    case ...1: 30
    case 2: 120
    case 3: 600
    case 4: 1800
    default: 3600
    }
}
