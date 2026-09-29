# Orbit

Orbit is Saaqib's personal work command center: one place that tracks every enterprise client he runs as a product analyst in Abu Dhabi (phase, health, next step, people, dates, activity, tasks, meetings, documents) and builds his weekly Friday meeting pack. Single user, deployed on Vercel, data in Neon Postgres.

Read `docs/orbit-log.md` first. It holds decisions, infrastructure ids, phase status and open items so any session can pick up where the last one stopped.

## Golden rule

Never implement, change, or deploy anything without Saaqib's explicit confirmation. Plan, show, wait for "OK", then build. This applies to every phase and every change.

## Writing style for everything Orbit generates

No hyphens, en dashes or em dashes as punctuation. Colons are fine. Do not hyphenate compound words: write sign off, go live, follow up. Short, clean, action oriented. `cleanStyle()` in `src/lib/core/style.ts` enforces this on AI output; `WRITING_STYLE_RULES` goes into every prompt.

The same applies to UI copy. Saaqib rejected two passes as "AI vibe" (glass cards, glowing orbs, gradient blobs, pills, Inter and Manrope, chatty lines). The current design is paper and ink: warm paper background with ink text by default, a dark "ink" theme in reverse, hairline rules instead of boxes, no blur, no glow, no gradients, colour only where it carries meaning (health, issues, overdue). Fonts are Newsreader (display, serif), IBM Plex Sans (body) and IBM Plex Mono (dates, codes, numbers). Health is a word with a small square swatch, never a glowing dot. Clients are listed as a ledger table. Section headings are serif over a rule. No mono uppercase labels, no middle dot separators, no marketing copy, no greeting: the home masthead is one factual headline built from the data.

## Stack

- Next.js 16 (App Router, `src/proxy.ts` instead of middleware), TypeScript, Tailwind v4, Radix primitives restyled as the Aurora design system, Motion for animation.
- Drizzle ORM on Neon Postgres (`@neondatabase/serverless` HTTP driver). Local development and tests can run on PGlite by setting `DATABASE_URL=pglite://./.pglite-dev`.
- Anthropic SDK for Quick Log parsing (structured output with `zodOutputFormat`, model `claude-opus-5` by default, server side refusal fallbacks on). Rule based fallback when no key is set.
- Auth: password from `ORBIT_PASSWORD`, HS256 session cookie signed with `ORBIT_SESSION_SECRET` (jose). `src/proxy.ts` protects every page and API route. `/api/*` also accepts `Authorization: Bearer $ORBIT_API_TOKEN`. The ingest, status, process and vocabulary routes also accept `ORBIT_INGEST_TOKEN`, the Mac helper's own token.

## Commands

```bash
pnpm dev            # http://localhost:3000, uses .env.development.local (PGlite) if present
pnpm build && pnpm start
pnpm typecheck && pnpm lint && pnpm test
pnpm db:generate    # drizzle-kit generate after editing src/lib/db/schema.ts
pnpm db:migrate     # applies ./drizzle to DATABASE_URL over HTTP (needs network access to Neon)
pnpm db:seed        # loads demo data into a local PGlite database only, never production
node scripts/shots.mjs   # Playwright screenshots of every page into ./shots (needs a running dev server)
node scripts/shots-minutes.mjs   # walks the minutes flow: set a meeting, transcript, review, save, download the Word file
node scripts/shots-tracker.mjs   # tracker screenshots: hover card, pinned card, drag to move, add guide, client rail in dark and on a phone
node scripts/vtt-to-ingest.mjs file.vtt "Calendar title" 2026-09-29T09:00:00+04:00 > body.json   # a WebVTT transcript as an ingest body
tsx scripts/vocabulary-sql.ts clients.json people.json > out.json   # vocabulary seed SQL from client and people rows (Neon connector input)
```

When the sandbox cannot reach Neon directly, apply migration SQL through the Neon MCP connector (`run_sql_transaction`) and record the migration hash in `drizzle.__drizzle_migrations` exactly as `scripts/migrate.ts` would.

## Layout

- `src/app/(app)/*` pages behind auth: home (Orbit view, Today, Meetings, Coming up, clients ledger, recent activity), tasks, clients, clients/[id] (timeline, dates, meetings, tasks, people, notes, docs), activity, settings. Phase 2 still adds dates and inbox. Phase 3 adds friday and `/api/v1`. Phase 4 adds documents and ask.
- Meetings: `src/lib/data/meetings.ts` and `src/lib/ai/mom.ts`. A planned meeting whose time has passed asks for the transcript. `buildMinutes` drafts a `MinutesPlan` (title, location, objective, discussion points with a bold topic each, action points, plus decisions, tasks, date moves, health, next step, notes rewrite). Every client uses the same MOM layout, `STANDARD_MOM_FORMAT` in `src/lib/core/minutes.ts`, taken from Saaqib's ADFH x Fero Maqta Pay example; `clients.mom_format` holds only extra rules for that client. `saveMinutes` stores the structured minutes in `meetings.minutes`, the text twin from `renderMinutesText` in `meetings.mom` and a mom document, action items, tasks linked to the meeting, a decision activity and the rewritten client notes. `GET /api/meetings/[id]/docx` returns the Word file built by `src/lib/docs/momDocx.ts` (docx package, Times New Roman, navy headings, gold rules, action table). Nothing is saved before Saaqib reviews it.
- Meetings library (meeting intelligence Phase 1, live since 2026-09-29): `/meetings` (Ask Orbit, review inbox, library with search, Add a transcript) and `/meetings/[id]` (Minutes, Additional details, Notes, Transcript, Review). Transcripts arrive by `POST /api/meetings/ingest` (contract in `docs/ingest.md`, token `ORBIT_INGEST_TOKEN`, 5 MB, 30 per hour, idempotent) or by upload; `src/lib/meetings/process.ts` runs in `after()`: `match.ts` picks the client by rules, `src/lib/ai/mom.ts` drafts the standard MOM plus the details sheet and a proposal, `src/lib/ai/notes.ts` drafts the understanding notes, `condense.ts` shortens long meetings first. States: received, processing, processed, needs_review (pick a client, Other Work or a new client), failed (Retry). A meeting may have no client (`other_work`); heading `Fero | <title>`. Transcripts in `meeting_transcripts` (full text search), details and notes in `meeting_outputs`, terms for matching and the transcriber in `vocabulary`. `src/lib/ai/ask.ts` answers questions from the transcripts and minutes with sources. Nothing in the proposal touches a client until it is accepted on the Review tab.
- Dates: `/dates` opens with the tracker, every client on one shared time axis (`src/components/dates/Tracker.tsx`), then the open dates by window. Each client page shows its own journey rail under the header (`JourneyTrack`, variant solo). Rail maths in `src/lib/core/journey.ts`. Hover reads, click pins with actions, drag moves (confirmed in the Move dialog with a reason), click on empty line adds a date there.
- Tasks: `/tasks` groups open tasks into Today (drag to order), Overdue, This week, Later, No date, Waiting on others, Done today. `parseTaskLine` in `src/lib/ai/taskline.ts` reads client, date, waiting on and priority from one typed line without a network call.
- `src/lib/db/schema.ts` full schema for all phases. `src/lib/data/*` data access. `src/actions/*` server actions (validate with zod, call data layer, `revalidatePath`).
- `src/lib/ai/*` Claude client and Quick Log parser. `src/lib/core/*` constants, Dubai date helpers, writing style, text matching.
- `src/components/aurora/*` design system pieces (glass cards, health orbs, countdown rings, aurora background). `src/components/ui/*` restyled primitives.
- `src/lib/import/*` project export import: zod schema, pure mapper with the data sense rules (see `docs/orbit-log.md`), and `scripts/import-project-sql.ts` which emits statement batches for the Neon connector. Session updates (a delta JSON after a meeting) go through `updateSchema.ts`, `mapUpdate.ts` and `scripts/import-update-sql.ts <update.json> <context.json> <out.json>`, where the context is a snapshot of the client's current rows. Client export JSON lives in `data/imports/` and is git ignored.
- `src/lib/demo/seed.ts` demo data for local development. It never touches a client whose `demo_status` is false. Production holds real clients only.

## Conventions

- Every change to a client's health, phase, next step, owner or phase dates writes an activity row automatically (`source = system` or the caller's source). The log never misses a small update.
- Milestones keep `original_date` and `date_history`. `delayText(original, current)` produces the Friday table wording ("1 week", "3 days").
- Dates are stored as `yyyy-MM-dd` strings, timestamps as timestamptz. All display uses Asia/Dubai.
- Reporting week is Friday 00:00 to Thursday 23:59 Dubai time. The Friday pack is generated Thursday evening.
- Keep messages to Saaqib short and in bullets. Explain in depth only when asked.

## API and Claude Code commands

Already there: `/api/meetings/ingest`, `/api/meetings/[id]/status`, `/api/meetings/[id]/process`, `/api/meetings/search`, `/api/meetings/ask`, `/api/v1/vocabulary` (Phase 1 of meeting intelligence). Phase 3 adds the rest of `/api/v1` secured with `ORBIT_API_TOKEN`, the Mac helper in a `mac-helper/` folder of this repo, and slash commands in `.claude/commands` (/log, /mom, /status, /followups, /friday, /brd, /email, /qa, /screens).
