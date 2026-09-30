import AppKit
import SwiftUI

/// A menu bar app only: no Dock icon (LSUIElement in Info.plist), no window.
@main
struct OrbitHelperApp: App {
    @StateObject private var state = AppState()

    var body: some Scene {
        MenuBarExtra {
            MenuView().environmentObject(state)
        } label: {
            Image(systemName: state.symbol)
        }
        .menuBarExtraStyle(.menu)
    }
}

struct MenuView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        Text(state.statusLine)
        if !state.detail.isEmpty { Text(state.detail) }
        Divider()
        if state.isRecording {
            Button("Stop and send") { state.stopManually() }
        } else {
            Button("Start recording now") { state.startManually() }
        }
        Toggle("Detect calls by itself", isOn: $state.autoDetect)
        Toggle("Keep audio after transcribing", isOn: $state.keepAudio)
        Toggle("Open at login", isOn: Binding(get: { state.launchAtLogin }, set: { state.setLaunchAtLogin($0) }))
        Divider()
        if state.queued > 0 {
            Button("Send \(state.queued) waiting now") { Task { await state.flushQueue(force: true) } }
        }
        if let url = state.lastMeetingURL {
            Button("Open the last meeting in Orbit") { NSWorkspace.shared.open(url) }
        }
        Button("Open Orbit") { NSWorkspace.shared.open(Settings.orbitURL.appendingPathComponent("meetings")) }
        Divider()
        Text(state.transcriberReady ? "Transcriber ready" : "Transcriber loading. The first time downloads the model.")
        Menu("Check detection") {
            Text(state.diagnostics.isEmpty ? "Join a call, then choose Check now." : state.diagnostics)
            Button("Check now") { state.checkDetection() }
        }
        Menu("Permissions") {
            Text(state.permissions)
            Button("Ask again") { state.requestPermissions() }
            Button("Open Privacy settings") {
                NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy")!)
            }
            Button("Check again") { state.refreshPermissions() }
        }
        Divider()
        Button("Quit Orbit Helper") { NSApp.terminate(nil) }
    }
}
