# Orbit Helper setup

The Orbit Helper is a small menu bar app for your Mac. When a Teams, Zoom or Google Meet call starts it records your microphone and the call audio, turns both into text on the Mac, and sends the text to Orbit. Orbit then drafts the minutes as usual.

Honest status: this app was written without a Mac to build or run it on. It has not been compiled or tested yet. The first build will likely need small fixes. Go step by step and stop at the first step that does not do what "How to know it worked" says; send me the exact message.

Before you start

- An Apple Silicon Mac (M1 or later) on macOS 14.2 or later.
- About 3 GB free disk for the build tools and the speech model.
- Orbit's ingest token must exist on the Orbit you point the helper at. Production does not have it yet (see the away report, section 5).

## Step 1: install the build tools

Copy into Terminal:

```bash
xcode-select --install
```

A window asks to install the command line tools. Choose Install. If it says they are already installed, that is fine.

How to know it worked:

```bash
swift --version
```

prints a line starting with `swift-driver` or `Apple Swift version 5.10` or later. If it prints 5.9 or lower, install Xcode 16 from the App Store and run `sudo xcode-select -s /Applications/Xcode.app`.

## Step 2: get the code

```bash
git clone https://github.com/Saxqb777/my-client-system.git ~/orbit
cd ~/orbit/mac-helper
```

GitHub asks you to sign in because the repo is private. Use your GitHub account.

How to know it worked: `ls` shows `Package.swift`, `Sources`, `build-app.sh`.

## Step 3: run the tests of the pure logic

```bash
swift test
```

The first run downloads WhisperKit and its dependencies, a few minutes.

How to know it worked: the last line says `Executed 7 tests, with 0 failures`.

## Step 4: build the app

```bash
./build-app.sh
```

How to know it worked: the last line is `Built build/OrbitHelper.app`. If the build stops with errors, copy the first error message and send it to me.

Then move it where apps live:

```bash
cp -R build/OrbitHelper.app /Applications/
```

## Step 5: put the Orbit token in the Keychain

Get the token: vercel.com, sign in with Google, project orbit, Settings, Environment Variables, `ORBIT_INGEST_TOKEN`, click the eye icon, copy the value. Use the one for the environment you point the helper at in step 6.

Then:

```bash
security add-generic-password -U -s orbit-helper -a ingest-token -w
```

Terminal asks `password data for new item:`. Paste the token and press Enter. It asks again to retype: paste again. Nothing shows while you paste; that is normal.

How to know it worked:

```bash
security find-generic-password -s orbit-helper -a ingest-token >/dev/null && echo stored
```

prints `stored`.

## Step 6: tell the helper which Orbit to use

For production:

```bash
defaults write ai.fero.orbit-helper orbitURL https://orbit-eta-brown.vercel.app
```

A Preview URL does not work here: Preview sits behind the Vercel login, which the helper cannot pass.

How to know it worked: `defaults read ai.fero.orbit-helper orbitURL` prints the address.

## Step 7: open the app

```bash
open /Applications/OrbitHelper.app
```

How to know it worked: a small waveform icon appears in the menu bar, top right. There is no Dock icon, by design.

The first time, the helper downloads the speech model in the background (several hundred MB). The menu says "Transcriber loading" until it is done, then "Transcriber ready". Leave it a few minutes on a good connection.

## Step 8: give the three permissions

Click the menu bar icon, Permissions, Ask again. macOS asks, one at a time:

1. Microphone: choose Allow.
2. Calendar: choose Allow Full Access.
3. Screen and System Audio Recording: macOS opens System Settings, Privacy and Security. Turn on Orbit Helper. macOS asks to quit and reopen it: choose Quit and Reopen.

The first time the helper reads the token, macOS asks whether Orbit Helper may use the keychain item `orbit-helper`. Enter your Mac password and choose Always Allow.

How to know it worked: menu, Permissions, Check again shows `Microphone allowed. Calendar allowed. Screen and system audio allowed.`

Why the screen permission: macOS puts call audio and window titles behind the same switch. The helper records no picture; it asks for a 2 by 2 pixel frame once a second and throws it away.

## Step 9: a manual test

1. Menu, Start recording now. The icon turns into a record circle.
2. Talk for about a minute, and play a YouTube video with speech for the other side.
3. Menu, Stop and send.

How to know it worked: the icon moves to a speech bubble (transcribing, a minute or two), then an up arrow (sending), then a check mark. Menu shows "Sent". Open Orbit, Meetings: a new meeting "From the Mac helper" appears. With no calendar event it lands in Needs review; choose Other Work.

If the menu says "Waiting to send", Orbit was not reachable or refused the token. The transcript waits in `~/Library/Application Support/OrbitHelper/queue` and is retried: after 30 seconds, 2 minutes, 10 minutes, 30 minutes, then hourly, and at once when the network comes back. After you fix the token (step 5), menu, Send 1 waiting now sends it at once.

## Step 10: a real Teams test

Start a Teams meeting with yourself (Calendar, Meet now) and talk for two minutes. The helper starts listening by itself within a few seconds. Leave the meeting. After 90 seconds without the call (the grace period for a quick rejoin) it transcribes and sends. Calls shorter than a minute are not sent.

How to know it worked: as in step 9, and the meeting in Orbit carries the calendar title if one was on your calendar.

If it does not start by itself: while in the call, menu, Check detection, Check now. It lists the apps holding the microphone and whether it sees a call. Send me that line; the detection rules are tuned from it.

If you choose Stop and send during a call the helper found by itself, it waits for that call to end before it watches again, so it does not start a second recording of the same call.

## Step 11: start with your Mac

Menu, Open at login. How to know it worked: System Settings, General, Login Items lists Orbit Helper.

## Settings you can change

```bash
defaults write ai.fero.orbit-helper graceSeconds -float 120     # wait longer before ending a dropped call
defaults write ai.fero.orbit-helper minCallSeconds -float 120   # ignore calls under two minutes
defaults write ai.fero.orbit-helper whisperModel base            # a small quick model for testing
defaults write ai.fero.orbit-helper language ar                  # a meeting language other than English
```

Quit and reopen the helper after a change.

## Privacy

- Nothing joins your calls. The helper listens to your Mac only.
- Audio is written to `~/Library/Application Support/OrbitHelper/recordings` while a call runs and deleted as soon as the transcript exists. Menu, Keep audio after transcribing turns that off. If transcription fails, the audio is kept so nothing is lost.
- Only text goes to Orbit. The token never leaves the Keychain except in the request to Orbit.
- The helper's log (Console app, subsystem `ai.fero.orbit-helper`) holds states and errors, never what was said.

## Where things are

- The app: `/Applications/OrbitHelper.app`
- Waiting transcripts: `~/Library/Application Support/OrbitHelper/queue`
- Transcripts Orbit refused: `~/Library/Application Support/OrbitHelper/failed`
- The speech model: `~/Documents/huggingface`

## Known limits

- Untested on a real Mac, see the top.
- Google Meet counts only when a browser holds the microphone and a window title starts with "Meet". Safari holds the microphone in its WebKit process, which the helper maps to Meet, so it still needs the Meet title.
- Teams detection needs Teams to hold the microphone and a Teams window that is not Chat, Calendar or another section. If Microsoft renames its windows, the helper falls back to "Teams holds the microphone", which also fires on a Teams mic test.
- Back to back calls: the next call is recorded while the last one is still transcribing. Transcriptions run one after the other.
- Transcribing a one hour call takes a few minutes on an M series Mac with the default model. The fan may spin up during that time; the helper is quiet the rest of the day.
- The ad hoc signature changes with every build, so macOS may ask for the permissions again after you rebuild.
