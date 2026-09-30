# Away report

Written for Saaqib while he is away. Everything here lives on the git branch `claude/phase2-preview` and the Neon branch `phase2-preview`. Production was not touched: no push to the production branch, no production env var, no migration on Neon main.

## 1. Summary

- Part A, Phase 2, is done and on Preview: auto updates from meetings with the evidence rule, a change log with Undo, tasks from action items, the Friday pack, a daily digest on home. 79 tests pass, typecheck and lint clean, every new page checked on desktop, dark and phone.
- Part B, Phase 4 BRD helper, is done and on Preview: requirements pulled from each client's meetings with the source quote and second, a thirteen section draft BRD where every line links back to its meeting, a gap check of an existing BRD, Word export. 99 tests pass.
- Part C, Phase 3 Mac helper, is written and documented, not tested: a Swift menu bar app in `mac-helper/` that notices Teams, Zoom and Meet calls, records mic and call audio as two tracks, transcribes on the Mac with WhisperKit and sends the text to Orbit. There is no Mac in the sandbox, so it has never been compiled or run. Expect small fixes on the first build.
- Nothing is live. Nothing was deleted. Migrations 0005 and 0006 exist only on the Neon branch `phase2-preview`.
- Claude was not reachable from the sandbox, so every Claude path was tested with the rule based fallback plus fixtures. The Preview is where the real Opus 5.5 output is judged.

## 2. Preview URL and test steps

Preview URL: https://orbit-git-claude-phase2-preview-saxqb777s-projects.vercel.app (Vercel login with Google, then the Orbit password). The Preview reads the Neon branch `phase2-preview`, a copy of your real data taken at 20:56 Dubai on 29 Sep. Anything you do there stays there.

### Part A: Phase 2

A1 and A2, auto updates and the change log

1. Open `/meetings`, Add a transcript, client on Auto, title `Agthia FMS UAT sign off review`, paste `tests/fixtures/agthia-uat-review.txt` from the repo (it is a made up meeting with fictional people). Wait about a minute.
2. How to know it worked: the meeting shows Processed with client AGTHIA. Open the Review tab. "Applied by Orbit" lists what was changed with a quote and a time each; "Held for you" lists what had no quote. Open `/changes`: the same rows with Before and After, the quote in italics, a time link that opens the transcript on that line, and Undo on each.
3. Press Undo on the health change. The client's health goes back, the row shows Undone, the client timeline shows "Undone: Health ...".
4. Change that client's health by hand on the client page, then Undo a different change of the same field from `/changes`: Orbit warns the field moved again and asks before forcing.
5. Upload `tests/fixtures/fero-product-sync.txt` with client Other Work. Nothing on any client changes; only the task "Prepare the BRD template draft" appears under Tasks with no client.

A3, tasks from action items

6. After step 1, open `/tasks`. Action items owned by Saaqib became tasks marked "From meeting" (link to the meeting, hover for the quote). Items owned by others sit under Waiting on others with the person's name. Upload the same transcript again with a different title: no duplicate tasks, the change log says "Task already open, linked to this meeting".
7. Quick add and the paste box still work as before; pasted email or WhatsApp threads give tasks the origin "From email".

A4, Friday pack

8. Open `/friday`, press Generate this week. One row per active client in the seven fixed columns. On Preview the three prose cells are written by Opus 5.5 (the description line says "written by Claude"); the dates come from the client record.
9. Click a cell, type, press Enter. A hairline mark appears on the left of the cell. Press Regenerate, keep my edits: your cell stays, the others refresh. Press Reset: everything is rebuilt.
10. Copy as table, paste into Teams or Outlook: seven columns, header first. Export Word: landscape table, navy header row, gold rules, no dashes.

A5, the digest

11. Open the home page after step 1. "Today from your meetings" shows the processed meeting, the changes applied (with Undo), the new tasks for you, and any meeting that needs a client or failed. On a quiet day the panel is not shown.

### Part B: BRD helper

12. Open a client, tab BRD (or `/brds` for all clients). Press Read meetings. How to know it worked: a list of requirements, business rules, exceptions, integrations and pain points appears, grouped by topic, each with the meeting, the time and the words it came from. The time opens the transcript on that line. Drop removes an item that does not belong (Show dropped brings it back).
13. Press Write the draft. The thirteen sections appear: purpose, in and out of scope, stakeholders, current and proposed process, functional, non functional, business rules, integrations, assumptions, dependencies, open questions. Every numbered line (FR1, BR2, INT1) shows its source meeting. Word downloads the same draft on the MOM paper with ID, Requirement and Source tables. Each version is also filed under the client's Docs tab as a BRD.
14. Gap check: paste a BRD or choose its Word file, press Check against the meetings. How to know it worked: three groups appear. Contradicts the meetings (red), Discussed, not in the BRD, Needs clarity (amber), each with what the client said and where. Mark them covered sets the items the BRD does cover.
15. Test file for the gap check: `tests/fixtures/adfh-brd-excerpt.txt` (made up, says four tiers where the meeting said three, and has vague lines).

### Part C: Mac helper

16. Follow `docs/mac-helper-setup.md` step by step on your Mac. Each step ends with "How to know it worked". Stop at the first step that does not match and send me the exact message.
17. Before step 6 works, production needs `ORBIT_INGEST_TOKEN` (see section 5). A Preview URL cannot be used by the helper because Vercel's login sits in front of it.
18. Honest status: this code is untested on a real Mac. Only the pure logic has unit tests (`swift test`, 7 tests), and even those have not been run.

## 3. Decisions made without you

- Bulk allow: you approved one set of permissions for this block. They live in `.claude/settings.local.json`, git ignored on this machine only.
- Preview env vars: instead of a second Preview `ORBIT_INGEST_TOKEN` (a new secret value to handle), the existing Preview token and the Preview `ORBIT_AI_MODEL` were re scoped from all previews to the git branch `claude/phase2-preview`. A new `DATABASE_URL` for the Neon branch was added, sensitive, scoped to the same branch. The old `claude/phase1-preview` `DATABASE_URL` stays (nothing deleted).
- Evidence rule: a quote counts when it has at least four words and is found in the transcript ignoring case and punctuation, or when six of its words run together in the transcript (Claude sometimes tidies a quote). The timestamp must be present. Without both, the item is held for review with the reason shown.
- Tasks are always created automatically, even without a quote, because they only add. Undo cancels a created task, it never deletes it.
- Action items owned by "Fero" become Waiting on "Fero team" items, so you can chase the team from the Tasks page. If that is noise, say so and they will be dropped.
- The client notes rewrite is never applied automatically. It stays on the Review tab.
- Risks raised in a meeting go to the client's document "<Client>: risks and open questions" (the same one the session update pipeline uses) plus an Issue entry on the timeline. Undo restores the document text.
- Health, next step, phase start and target dates, milestone moves and milestone done are the client fields Orbit may change by itself. Name, code, contacts and phase are never touched.
- Meetings processed with the Phase 1 code have no evidence fields; their Review tab keeps working, everything simply stays held.
- Friday pack: the reporting week stays Friday to Thursday; opening `/friday` on a Friday shows the week that ended yesterday, as the existing helper does. Claude writes only the three prose cells; dates and owner come from the record. "Mark final" is a label, it locks nothing.
- The Friday pack Word file is landscape A4 with the same navy and gold as the MOM, header "Fero | Weekly client status".
- Long meetings (over 120 minutes) are condensed before Claude reads them, so their evidence markers can be missing; such changes land on the Review tab rather than applying.
- BRD helper: meetings are read on a button press, not automatically after every meeting, to keep Claude cost under your control. Up to eight meetings per press, three at a time, so one press stays inside the Vercel time limit. Other Work meetings are never read.
- BRD items that repeat an existing item (similarity 0.7, dropped items included) are skipped, so a dropped item does not come back on the next read.
- A quote Claude could not copy verbatim is kept as context but without a time, so no link points at the wrong second.
- The draft keeps every live requirement, rule, exception and integration item: if Claude leaves one out, Orbit appends it to its section in the item's own words. Pain points feed the current process and open questions, not the requirement tables.
- Each draft is a new numbered version; old versions stay downloadable. Each version is also saved as a BRD document for the client.
- The gap check does not change item status by itself; "Mark them covered" is a separate click.
- The Word reader for the gap check reads the document body only (paragraphs and tables, a table row becomes one line); headers, footers, comments and tracked changes are ignored.
- Mac helper, call audio: ScreenCaptureKit, not Core Audio process taps. It has been stable since macOS 13, captures whatever the call app plays without knowing its process, and its permission (Screen and System Audio Recording) is the same one that makes window titles readable for call detection, so one permission covers both. Process taps would avoid the screen permission but tie the recording to one process, which breaks when Teams moves audio to a helper process mid call. The helper records no picture: it takes a 2 by 2 pixel frame once a second and throws it away.
- Mac helper, your voice: AVAudioEngine on the microphone, kept as its own track, so the transcript says Me and Others without guessing speakers.
- Mac helper, call detection: every three seconds it asks Core Audio which processes hold the microphone (no permission needed, very cheap), and only then reads window titles. Teams and Zoom count when they hold the mic and a call window is open; Meet counts when a browser holds the mic and a window title starts with "Meet". Minimised windows and other desktops count too. A "Check detection" menu shows what it sees, to tune the rules on your Mac.
- Mac helper, timing: a call ends after 90 seconds without it (grace for a quick rejoin), calls under a minute and recordings with under 20 seconds of speech are not sent. If the system audio skips a quiet stretch, silence is written so both tracks stay on the same clock.
- Mac helper, speech model: WhisperKit `large-v3-v20240930_turbo`, Orbit's vocabulary (client names, people, acronyms) fed in as the prompt so names come out right. The vocabulary is cached on the Mac for offline calls.
- Mac helper, sending: every transcript is saved to a queue folder first, then sent. A network error, a server error, a rate limit or a wrong token keeps it waiting (retry after 30 s, 2 min, 10 min, 30 min, then hourly, and at once when the network returns). Only a body Orbit rejects as invalid moves to a failed folder. After sending, it polls the meeting status and asks Orbit to process it again once if it sits for five minutes.
- Mac helper, privacy: raw audio is deleted after transcription by default (menu toggle to keep it), kept only when transcription fails. The token lives in the Keychain. The log never holds what was said.
- Mac helper, build: Swift Package plus `build-app.sh` that assembles and ad hoc signs the .app, instead of an Xcode project, so it builds from Terminal with the command line tools. The downside: macOS may ask for the permissions again after a rebuild.
- Mac helper, default address: production (`orbit-eta-brown.vercel.app`), because Preview sits behind the Vercel login.

## 4. Blocked

- Nothing blocked. Claude cannot be called from the sandbox, so Opus output quality for Phase 2 (evidence quotes, Friday cells) is only judged on Preview.
- The Mac helper cannot be built or run here (no Mac, no Swift). It needs your Mac for its first build and test.
- The helper needs `ORBIT_INGEST_TOKEN` on Production. The go live session was not allowed to read a generated token, so this step is yours (section 5, step 4).

## 5. What you need to do to go live, in order

1. Review the Preview with the steps above and say go.
2. Apply migration 0005 to Neon main (`drizzle/0005_hard_namorita.sql`, 12 statements, additive: table change_log, two enums, three task columns) and record it in `drizzle.__drizzle_migrations` with hash `3d8da5ee0a374035b0368b017f448be805d03ae614cebb8d0f9ec8c29b33bc9a` and created_at `1790701497108`. Then migration 0006 (`drizzle/0006_cloudy_maximus.sql`, 14 statements, additive: brd_items, brd_drafts, brd_gap_checks, two enums, meetings.brd_extracted_at), hash `9d38c83c67cc8acb13a6897e538709a64a6ed97f499482b67d3ee25c30ec7d37`, created_at `1790703224663`. A session with the Neon connector does both in one call.
3. Merge `claude/phase2-preview` into `claude/zen-volta-b254gb` and push. Vercel deploys production.
4. Open the home page and `/changes` on production.
5. For the Mac helper: vercel.com, project orbit, Settings, Environment Variables, add `ORBIT_INGEST_TOKEN` for Production only with a long random value (in Terminal: `openssl rand -hex 32`), mark it Sensitive, then Redeploy production once. Put the same value in the Keychain (setup guide step 5).
6. Build and test the helper with `docs/mac-helper-setup.md`.
7. Optional tidy: delete the Neon branch `phase2-preview` and the Preview env vars for that branch.

## 6. Cost notes

- Each processed meeting now asks Claude for evidence fields inside the same MOM call: no extra call, roughly 10 to 15 percent more output tokens. Estimate 0.30 to 0.70 dollars per meeting on Opus 5.5.
- Friday pack: one Claude call per generation, all clients in one request, low effort. Roughly 0.05 to 0.15 dollars per pack. Regenerate costs the same again; editing cells costs nothing.
- The digest, the change log and Undo make no Claude calls.
- Mac helper: transcription runs on your Mac, so it costs nothing. Each meeting it sends is processed by Orbit exactly like an upload (the MOM cost above). The rate limit stays at 30 meetings an hour.
- BRD helper: one Claude call per meeting read (about 0.10 to 0.30 dollars each on Opus 5.5, depending on length), one call per draft (about 0.20 to 0.60 dollars), one per gap check (about 0.15 to 0.40 dollars). Nothing runs unless you press the button.
