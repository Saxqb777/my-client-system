# Away report

Written for Saaqib while he is away. Everything here lives on the git branch `claude/phase2-preview` and the Neon branch `phase2-preview`. Production was not touched: no push to the production branch, no production env var, no migration on Neon main.

## 1. Summary

- Part A, Phase 2, is done and on Preview: auto updates from meetings with the evidence rule, a change log with Undo, tasks from action items, the Friday pack, a daily digest on home. 79 tests pass, typecheck and lint clean, every new page checked on desktop, dark and phone.
- Part B, Phase 4 BRD helper: in progress.
- Part C, Phase 3 Mac helper: not started.
- Nothing is live. Nothing was deleted. Migration 0005 exists only on the Neon branch `phase2-preview`.
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

## 4. Blocked

- Nothing blocked. Claude cannot be called from the sandbox, so Opus output quality for Phase 2 (evidence quotes, Friday cells) is only judged on Preview.

## 5. What you need to do to go live, in order

1. Review the Preview with the steps above and say go.
2. Apply migration 0005 to Neon main (`drizzle/0005_hard_namorita.sql`, 12 statements, additive: table change_log, two enums, three task columns) and record it in `drizzle.__drizzle_migrations` with hash `3d8da5ee0a374035b0368b017f448be805d03ae614cebb8d0f9ec8c29b33bc9a` and created_at `1790701497108`. A session with the Neon connector does this in one call.
3. Merge `claude/phase2-preview` into `claude/zen-volta-b254gb` and push. Vercel deploys production.
4. Open the home page and `/changes` on production.
5. Optional tidy: delete the Neon branch `phase2-preview` and the Preview env vars for that branch.

## 6. Cost notes

- Each processed meeting now asks Claude for evidence fields inside the same MOM call: no extra call, roughly 10 to 15 percent more output tokens. Estimate 0.30 to 0.70 dollars per meeting on Opus 5.5.
- Friday pack: one Claude call per generation, all clients in one request, low effort. Roughly 0.05 to 0.15 dollars per pack. Regenerate costs the same again; editing cells costs nothing.
- The digest, the change log and Undo make no Claude calls.
