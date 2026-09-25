# Orbit

Orbit is Saaqib's personal work command center: one place that tracks every enterprise client he runs as a product analyst in Abu Dhabi (phase, health, next step, people, dates, activity, tasks, meetings, documents) and builds his weekly Friday meeting pack. Single user, deployed on Vercel, data in Neon Postgres.

Read `docs/orbit-log.md` first. It holds decisions, infrastructure ids, phase status and open items so any session can pick up where the last one stopped.

## Golden rule

Never implement, change, or deploy anything without Saaqib's explicit confirmation. Plan, show, wait for "OK", then build. This applies to every phase and every change.

## Writing style for everything Orbit generates

No hyphens, en dashes or em dashes as punctuation. Colons are fine. Do not hyphenate compound words: write sign off, go live, follow up. Short, clean, action oriented. `cleanStyle()` in `src/lib/core/style.ts` enforces this on AI output; `WRITING_STYLE_RULES` goes into every prompt.

The same applies to UI copy. Saaqib rejected the first pass as "AI vibe", so: no mono uppercase section labels, no middle dot separators, no chatty lines ("Nothing overdue. Good."), no marketing intros under page titles. Plain factual sentences and counts. Fonts are Manrope (headings), Inter (body), JetBrains Mono (dates and numbers). Background is aurora curtains along the top edge only, never round glow blobs.

## Stack

- Next.js 16 (App Router, `src/proxy.ts` instead of middleware), TypeScript, Tailwind v4, Radix primitives restyled as the Aurora design system, Motion for animation.
- Drizzle ORM on Neon Postgres (`@neondatabase/serverless` HTTP driver). Local development and tests can run on PGlite by setting `DATABASE_URL=pglite://./.pglite-dev`.
- Anthropic SDK for Quick Log parsing (structured output with `zodOutputFormat`, model `claude-opus-5` by default, server side refusal fallbacks on). Rule based fallback when no key is set.
- Auth: password from `ORBIT_PASSWORD`, HS256 session cookie signed with `ORBIT_SESSION_SECRET` (jose). `src/proxy.ts` protects every page and API route. `/api/*` also accepts `Authorization: Bearer $ORBIT_API_TOKEN`.

## Commands

```bash
pnpm dev            # http://localhost:3000, uses .env.development.local (PGlite) if present
pnpm build && pnpm start
pnpm typecheck && pnpm lint && pnpm test
pnpm db:generate    # drizzle-kit generate after editing src/lib/db/schema.ts
pnpm db:migrate     # applies ./drizzle to DATABASE_URL over HTTP (needs network access to Neon)
pnpm db:seed        # loads demo data into DATABASE_URL
node scripts/shots.mjs   # Playwright screenshots of every page into ./shots (needs a running dev server)
```

When the sandbox cannot reach Neon directly, apply migration SQL through the Neon MCP connector (`run_sql_transaction`) and record the migration hash in `drizzle.__drizzle_migrations` exactly as `scripts/migrate.ts` would.

## Layout

- `src/app/(app)/*` pages behind auth: home (Orbit view), clients, clients/[id], activity, settings. Phase 2 adds tasks, dates, meetings, inbox. Phase 3 adds friday and `/api/v1`. Phase 4 adds documents and ask.
- `src/lib/db/schema.ts` full schema for all phases. `src/lib/data/*` data access. `src/actions/*` server actions (validate with zod, call data layer, `revalidatePath`).
- `src/lib/ai/*` Claude client and Quick Log parser. `src/lib/core/*` constants, Dubai date helpers, writing style, text matching.
- `src/components/aurora/*` design system pieces (glass cards, health orbs, countdown rings, aurora background). `src/components/ui/*` restyled primitives.
- `src/lib/demo/seed.ts` demo data. Every demo row has `is_demo = true`; the eight clients carry `demo_status = true` so Clear demo data resets their status fields without deleting them.

## Conventions

- Every change to a client's health, phase, next step, owner or phase dates writes an activity row automatically (`source = system` or the caller's source). The log never misses a small update.
- Milestones keep `original_date` and `date_history`. `delayText(original, current)` produces the Friday table wording ("1 week", "3 days").
- Dates are stored as `yyyy-MM-dd` strings, timestamps as timestamptz. All display uses Asia/Dubai.
- Reporting week is Friday 00:00 to Thursday 23:59 Dubai time. The Friday pack is generated Thursday evening.
- Keep messages to Saaqib short and in bullets. Explain in depth only when asked.

## API and Claude Code commands

Arrive in Phase 3: REST API under `/api/v1` secured with `ORBIT_API_TOKEN`, and slash commands in `.claude/commands` (/log, /mom, /status, /followups, /friday, /brd, /email, /qa, /screens).
