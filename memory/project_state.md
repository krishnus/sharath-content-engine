---
name: project-state
description: Verified codebase state for the Sharath Content Engine — what's built, what's not, and key gotchas confirmed against the actual code (not inferred from docs)
metadata:
  type: project
---

All dashboard pages are fully wired to real Supabase data (docs previously said "mock data" — this was stale). Forward Plan, Draft Editor, Voice Rules, Arc, Analytics, Calendar, Settings all call real API routes.

**Why:** Docs were written from a README by an instance that didn't read the code. A full audit was done on 2026-06-12/13 to correct them.

**How to apply:** CLAUDE.md and all docs/ files are now accurate. Use them as ground truth. Do not re-infer from old "mock data" comments.

Key facts verified against the actual code:

- MODEL = `process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929'` (configurable via env var)
- MAX_TOKENS export = 2048; excerpt call uses hardcoded 1024
- Migration order: 001 (schema) → 002 (linkedin_tokens) → 003 (linkedin_excerpt on drafts)
- `system_settings` table is NOT in any migration file — must be created manually
- `posts.status` enum includes 'edited'; does NOT include 'planned'
- `weeks.status` is 'draft' | 'confirmed' (not 'planned' | 'in_progress' | 'complete')
- Cron routes authenticate via `Authorization: Bearer ${CRON_SECRET}` (not x-cron-secret)
- Cron schedules: publish = `30 2 * * *`, analytics = `0 1 * * *` (both daily, off-peak UTC)
- `/api/drafts/save` does an in-place UPDATE (not INSERT new version)
- `/api/learn` takes only `{ postId }` — fetches drafts itself; returns candidate rules for UI review, does NOT auto-insert voice rules
- `LINKEDIN_SERVICE_TOKEN` env var required for analytics cron but not in .env.example
- `countWords` exported from both `lib/anthropic/client.ts` and `lib/utils/helpers.ts`
- components/ directory is flat (no ui/, dashboard/, editor/ subdirs)
