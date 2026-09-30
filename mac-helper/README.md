# Orbit Helper

A macOS menu bar app for Apple Silicon. It notices when a Teams, Zoom or Google Meet call starts, records your microphone and the call audio as two tracks, transcribes both on the Mac with WhisperKit, and sends the transcript to Orbit's ingest route. Orbit then drafts the minutes.

- Nothing joins the call. It only listens to this Mac.
- Audio stays on the Mac and is deleted after transcription unless you turn on Keep audio.
- The Orbit token is read from the Keychain, never from a file.
- Transcripts wait in `~/Library/Application Support/OrbitHelper/queue` until Orbit has them.

Status: written without a Mac to build or run it on. It has not been compiled or tested. Expect small fixes on the first build.

Setup, one step at a time: `docs/mac-helper-setup.md` in the Orbit repo.

Layout

- `Sources/OrbitHelperCore`: pure logic (merging the two tracks, the ingest body, call rules, retry timing). `swift test` runs its tests.
- `Sources/OrbitHelper`: the app. `AppState` runs the show; `CallDetector`, `Recorder`, `Transcriber`, `CalendarReader`, `SendQueue`, `OrbitClient`, `Keychain`.
- `Resources`: Info.plist and entitlements. `build-app.sh` makes the .app.
