import AppKit
import CoreAudio
import CoreGraphics
import OrbitHelperCore

/// Is a call running right now, and in which app? Two signals:
/// 1. Which processes hold the microphone (Core Audio process objects, macOS 14.2 and later). Cheap, no permission.
/// 2. Which windows are open (window titles need Screen and System Audio Recording, which the recorder needs anyway).
/// Teams and Zoom count when their process holds the mic and, if titles are readable, a call window is open.
/// Google Meet counts only when a browser holds the mic and a Meet tab is the window title.
final class CallDetector {
    struct Observation {
        let app: CallApp?
        let windowTitle: String?
    }

    func observe() -> Observation {
        let micApps = Set(bundlesUsingMicrophone().compactMap(CallRules.app(forBundle:)))
        guard !micApps.isEmpty else { return Observation(app: nil, windowTitle: nil) }
        let windows = windowTitles()
        let titlesReadable = windows.contains { !$0.title.isEmpty }

        for app in [CallApp.teams, .zoom, .meet] where micApps.contains(app) {
            let owners = CallRules.owners[app] ?? []
            let mine = windows.filter { w in owners.contains { w.owner.hasPrefix($0) } }
            let call: String?
            switch app {
            case .teams: call = mine.first { CallRules.isTeamsCallWindow($0.title) }?.title
            case .zoom: call = mine.first { CallRules.isZoomCallWindow($0.title) }?.title
            case .meet: call = mine.first { CallRules.isMeetWindow($0.title) }?.title
            }
            // Only Teams puts the meeting subject in the window title; Zoom and Meet titles say nothing about the client.
            if let call { return Observation(app: app, windowTitle: app == .teams ? CallRules.callTitle(fromWindow: call) : nil) }
            // Without window titles, Teams and Zoom on the mic are taken as a call. Meet needs the tab title.
            if !titlesReadable && app != .meet { return Observation(app: app, windowTitle: nil) }
        }
        return Observation(app: nil, windowTitle: nil)
    }

    /// For the menu's Check detection: what the detector sees right now, to tune the rules on a real Mac.
    func diagnostics() -> String {
        let mic = bundlesUsingMicrophone()
        let seen = observe()
        let micLine = mic.isEmpty ? "Nothing is using the microphone." : "Using the microphone: \(mic.joined(separator: ", "))."
        var callLine = "No call seen."
        if let app = seen.app {
            callLine = "Call seen in \(app.label)" + (seen.windowTitle.map { title in ": " + title } ?? "") + "."
        }
        return micLine + " " + callLine
    }

    /// Every window, not only the ones on screen: a call window that is minimised or on another desktop still counts.
    private func windowTitles() -> [(owner: String, title: String)] {
        guard let list = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return [] }
        return list.compactMap { w in
            guard let owner = w[kCGWindowOwnerName as String] as? String else { return nil }
            return (owner, w[kCGWindowName as String] as? String ?? "")
        }
    }

    /// Bundle ids of the processes that are capturing audio input right now.
    private func bundlesUsingMicrophone() -> [String] {
        var address = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyProcessObjectList, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        var size: UInt32 = 0
        let system = AudioObjectID(kAudioObjectSystemObject)
        guard AudioObjectGetPropertyDataSize(system, &address, 0, nil, &size) == noErr, size > 0 else { return [] }
        var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
        guard AudioObjectGetPropertyData(system, &address, 0, nil, &size, &ids) == noErr else { return [] }
        return ids.compactMap { id in
            guard uint32(id, kAudioProcessPropertyIsRunningInput) == 1 else { return nil }
            return string(id, kAudioProcessPropertyBundleID)
        }
    }

    private func uint32(_ id: AudioObjectID, _ selector: AudioObjectPropertySelector) -> UInt32? {
        var address = AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        var value: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        return AudioObjectGetPropertyData(id, &address, 0, nil, &size, &value) == noErr ? value : nil
    }

    private func string(_ id: AudioObjectID, _ selector: AudioObjectPropertySelector) -> String? {
        var address = AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        var value: Unmanaged<CFString>?
        var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        let status = withUnsafeMutablePointer(to: &value) { AudioObjectGetPropertyData(id, &address, 0, nil, &size, $0) }
        guard status == noErr, let cf = value?.takeRetainedValue() else { return nil }
        let s = cf as String
        return s.isEmpty ? nil : s
    }
}
