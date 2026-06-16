# Next Steps

What should be built or fixed next, in rough priority order, based on current project status and known issues.

---

## High Priority — Unblocks daily use

### ~~1. Wire up dashboard pages to real Supabase data~~ ✅ DONE

### ~~2. Saturday market-data input flow~~ ✅ DONE
`SaturdayInsightsModal.tsx` implements the full flow.

### ~~3. Verify the LinkedIn `/rest/posts` fix end-to-end~~ ✅ DONE
- Migrated from `/v2/ugcPosts` to `/rest/posts`
- Fixed double URL-encoding bug in preview delete flow (`urn%253Ali` → `urn%3Ali`)
- `LinkedIn-Version` header corrected to `202604`
- Normalize pattern: `encodeURIComponent(decodeURIComponent(id))` in both publish and delete routes

### ~~4. Long-form article publishing approach~~ ✅ DONE
Replaced excerpt truncation with full PDF document post approach (see Architecture Decisions #6).
`generateAndSaveExcerpt()` removed. `linkedin_excerpt` column deprecated (still in DB, harmless).

### 5. Run migration 004 + create Storage bucket
Before media features work in production:
1. Run `supabase/migrations/004_post_media.sql` in Supabase → SQL Editor
2. Create a **private** Storage bucket named `post-media` in Supabase Dashboard → Storage → New Bucket
3. Verify RLS policy allows authenticated users to upload/download

### 6. Test media generation end-to-end
- Generate a text post, open editor, confirm `MediaPanel` appears in sidebar with "Generate Quote Image" button
- Click Generate — confirm PNG is generated, stored, signed URL returned, preview shows in sidebar
- Generate a carousel post — confirm carousel PDF generates with correct slides
- Generate a long-form article — confirm article PDF generates with correct multi-page layout
- Click Publish — confirm LinkedIn document/image upload API calls succeed
- Check LinkedIn post appears correctly

### 7. Activate LinkedIn analytics cron
`/api/cron/analytics` is configured. The remaining gap:
- Set `LINKEDIN_SERVICE_TOKEN` env var on Vercel — without it the cron logs a warning and skips
- This requires a LinkedIn access token at service level (user's OAuth token is not available in cron context)

---

## Medium Priority — Strengthens the core loop

### 8. MediaPanel caption save persistence
Currently the "Save caption" button in `MediaPanel` updates local state only. If a user edits the AI-generated caption, it should persist to `post_media.linkedin_caption`. Add `PATCH /api/media/[id]` endpoint or reuse the generate endpoint with an update-only mode.

### 9. LinkedIn token expiry warning
Currently tokens just expire with a 402 error prompting manual reconnection.
- Surface a clear warning in the Settings page when the token is within 7 days of expiry (not just after it expires)
- Check `tokenRow.expires_at` on the settings API response and show a banner

### 10. Remove deprecated `buildLinkedInExcerptPrompt`
The function still exists in `lib/anthropic/prompts.ts` but is no longer called. Remove it along with the stale `LONG_FORM_DAYS` comment reference in generate route.

### 11. Clean up `linkedin_excerpt` column
`drafts.linkedin_excerpt` was added in migration 003 and is now deprecated (never written, never read). Can be dropped in a future migration `005_drop_linkedin_excerpt.sql` once confirmed nothing depends on it.

### 12. Cross-platform repurposing
The content playbook describes a "ONE deep idea → 7 pieces" repurposing chain. Currently LinkedIn only.
- Decide which platforms to build first (Twitter thread and Instagram carousel are likely highest value)
- Each platform needs its own prompt builder + publishing integration

---

## Lower Priority — Polish, scale, future phases

### 13. Test suite
Zero automated tests. Good first candidates:
- `countWords()` and `parseGenerationMetadata()` — pure functions
- `resolvePublishText()` — pure function, test all branches
- Draft versioning insert logic

### 14. Multi-business LinkedIn presence
All publishing is to Sharath's personal profile. 5-Swans and Bradford content could go to Company Pages.
Requires `w_organization_social` scope and a more complex token model.

### 15. Phase 4 — Book/manuscript export
Long-term: export the 52-week story arc as a manuscript draft.
Depends on all 52 weeks having complete `story_log` entries.

### 16. Consolidate `saturday-prompt.ts` into `prompts.ts`
Minor refactor — consider merging once the Saturday pattern is stable.

### 17. Custom domain finalisation
`app.coachsharath.com` DNS + redirect URI updates across Supabase, LinkedIn, and Vercel.

---

## Open Questions

- [ ] **Vercel Pro plan** — required for Cron job support (scheduling and analytics)
- [ ] **Custom domain** — `app.coachsharath.com` DNS + redirect URI updates
- [ ] **Multi-business LinkedIn** — personal profile vs. Company Pages for 5-Swans / Bradford

---

## Suggested Startup Checklist (fresh environment)

1. Run migrations 001–004 in Supabase SQL Editor (in order)
2. Create `system_settings` table and seed it (see `docs/setup-notes.md`)
3. Create `post-media` Storage bucket (private) in Supabase Dashboard
4. Set all env vars in `.env.local` (see `.env.example`)
5. Set `LINKEDIN_SERVICE_TOKEN` env var to activate analytics cron
6. Confirm `CRON_SECRET` is set in Vercel
