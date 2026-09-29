# Away report

Written for Saaqib while he is away. Newest state at the top of each section. Everything here lives on the branch `claude/phase2-preview` and the Neon branch `phase2-preview`. Production was not touched.

## 1. Summary

- Setup done: git branch `claude/phase2-preview` off the production head, Neon branch `phase2-preview` off main with your real data, Preview env vars scoped to that branch.
- Part A (Phase 2): in progress.
- Part B (Phase 4 BRD helper): not started.
- Part C (Phase 3 Mac helper): not started.
- Nothing is live. Nothing was deleted.

## 2. Preview URL and test steps

Preview URL: https://orbit-git-claude-phase2-preview-saxqb777s-projects.vercel.app (Vercel login with Google, then the Orbit password).

Test steps are added per part below as each part lands.

## 3. Decisions made without you

- Bulk allow: you approved one set of permissions for this block. They live in `.claude/settings.local.json`, which is git ignored on this machine only. Nothing about them reaches the repo or production.
- Preview env vars: instead of creating a second Preview `ORBIT_INGEST_TOKEN` (which would have meant handling a new secret value in chat), the existing Preview token and the Preview `ORBIT_AI_MODEL` were re scoped from "all previews" to the git branch `claude/phase2-preview`. A new `DATABASE_URL` for the Neon branch `phase2-preview` was added, sensitive, scoped to the same git branch. The old `DATABASE_URL` for `claude/phase1-preview` was left in place (nothing deleted).

## 4. Blocked

- Nothing yet.

## 5. What you need to do to go live, in order

- Filled in when Part A is complete.

## 6. Cost notes

- Filled in per part. Phase 1 baseline: about 0.25 to 0.60 dollars per meeting on Opus 5.5.
