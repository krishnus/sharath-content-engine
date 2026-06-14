# Next Steps

What should be built or fixed next, in rough priority order, based on current project status and known issues.

---

## High Priority — Unblocks daily use

### ~~1. Wire up dashboard pages to real Supabase data~~ ✅ DONE
All dashboard pages are now wired to real APIs:
- **Forward Plan** (`/dashboard/page.tsx`) → `GET/POST /api/plan`
- **Draft editor** (`/dashboard/drafts/[postId]/page.tsx`) → `GET /api/posts/[postId]`, `POST /api/generate` (streaming), `POST /api/drafts/save` (auto-save ~800ms), `POST /api/learn` (approve), `POST /api/fix-hook`
- **Voice Rules Library** (`/dashboard/rules/page.tsx`) → `GET|POST|PATCH|DELETE /api/rules`, `POST /api/rules/candidates` via `CandidateRulesModal`
- **Story Arc** (`/dashboard/arc/page.tsx`) → `GET /api/arc`
- **Analytics** (`/dashboard/analytics/page.tsx`) → `GET /api/analytics`
- **Calendar** (`/dashboard/calendar/page.tsx`) → `GET /api/calendar` _(new page, not in original docs)_
- **Settings** (`/dashboard/settings/page.tsx`) → `GET|PATCH /api/settings`, `GET /api/linkedin/status`

### 2. Activate LinkedIn analytics cron
`/api/cron/analytics` is configured and the `performance_data` table and `GET /api/analytics` UI are complete. The remaining gap:

- Set `LINKEDIN_SERVICE_TOKEN` env var on Vercel — without it the cron logs a warning and skips. This requires a LinkedIn access token stored at service level (the user's OAuth token is not available in cron context).
- Verify the `GET /v2/socialActions/{postId}` API response shape matches the fields the code expects (`impressionCount`, `likeCount`, `commentCount`, `shareCount`, `clickCount`) — may need the `r_organization_social` scope or similar.

### ~~3. Verify the LinkedIn `/rest/posts` fix end-to-end~~ (carried forward)
The publish route was migrated from `/v2/ugcPosts` to `/rest/posts`. Still needs real-world verification:

- Test publishing a Tuesday text post (should work unchanged — under 3000 chars)
- Test publishing a Monday/Wednesday long-form post — verify `linkedin_excerpt` is generated, saved, and used
- Test the preview flow (`preview: true` → `LOGGED_IN` visibility) and `promotePreview` flow
- Confirm the `LinkedIn-Version: 202501` header doesn't need bumping
- Confirm the `Location` header format from `/rest/posts` matches what `callLinkedInAPI()` expects

### ~~5. Saturday market-data input flow~~ ✅ DONE
`SaturdayInsightsModal.tsx` implements the full flow. The Forward Plan dashboard shows a banner on Saturdays when a post with `status = 'awaiting_market_data'` exists.

### ~~6. Story log extraction automation~~ ✅ DONE
`POST /api/learn` always runs `buildStoryLogExtractionPrompt()` on approval, upserts into `story_log`, and updates `weeks.open_thread`.

### 3. Verify the LinkedIn `/rest/posts` fix end-to-end
The publish route was just migrated from `/v2/ugcPosts` to `/rest/posts`. This needs real-world verification:

- Test publishing a Tuesday text post (should work unchanged — under 3000 chars)
- Test publishing a Monday/Wednesday long-form post — verify `linkedin_excerpt` is generated, saved, and used
- Test the preview flow (`preview: true` → `LOGGED_IN` visibility) and `promotePreview` flow
- Confirm the `LinkedIn-Version: 202501` header doesn't need bumping (LinkedIn versions are monthly — check if `202501` is still valid or needs updating to a more recent month)
- Test `deleteLinkedInPost()` fallback path with an old `/v2/ugcPosts`-created post ID, if any exist from before the fix
- Confirm the response `Location` header format matches what `callLinkedInAPI()` expects (`urn:li:share:XXXXXXXXX`)

### 4. LinkedIn token refresh
Currently tokens just expire with a 402 error prompting manual reconnection. Consider:
- Implement refresh token flow if LinkedIn's OAuth supports it for the granted scopes
- At minimum, surface a clear UI warning in Settings when the token is close to expiry (not just after it expires)

---

## Medium Priority — Strengthens the core loop

### 5. Saturday market-data input flow
Saturday posts have `status = 'awaiting_market_data'` after week planning. Need a UI flow for Sharath to:
- See which post is awaiting market data (likely on the Forward Plan / dashboard)
- Input current Nifty/Sensex data and any other market context as free text
- Trigger `/api/generate` with `marketContext` populated, transitioning status to `'draft'`

### 6. Story log extraction automation
`buildStoryLogExtractionPrompt()` exists but the calling logic isn't fully described. Decide:
- Does this run automatically when `posts.status` transitions to `'approved'` or `'published'`?
- Or is it a manual "Extract narrative metadata" button in the editor?
- Either way, this is critical — without it, `buildNarrativeContext()` has nothing to work with for the next post, breaking the "serialised book" narrative continuity that's central to the content strategy.

### 7. Cross-platform repurposing (per the playbook's "ONE deep idea → 7 pieces" flow)
The content playbook describes a full repurposing chain: LinkedIn article → YouTube script → Twitter thread → Instagram carousel → Facebook post → Google Business post → YouTube Short. Currently the system only generates LinkedIn content.

- Decide which platforms to build first (Twitter thread and Instagram carousel are likely highest value given Category B and Bradford audiences)
- Each platform needs its own prompt builder (following the `buildGeneratePostPrompt` pattern) with its own word/character count standards (documented in the master playbook)
- Each platform may need its own publishing integration (separate OAuth, separate API)
- Consider whether these should be separate `posts` rows (same week, different `day`+`platform` combination) or a new `platform_drafts` table linked to the parent LinkedIn post

### 8. Hashtag and CTA validation
`buildGeneratePostPrompt()` instructs the LLM to output `HASHTAGS:` with mandatory tags (`#CoachSharath #5Swans #BradfordInternationalAlliance` + pillar-specific). Add programmatic validation (similar to `countWords()`) to confirm:
- The 3 mandatory hashtags are always present
- Hashtag count is within the 5-8 range specified by the playbook
- CTA matches the target audience's CTA guide (Category A/B vs 5-Swans vs Bradford vs general)

---

## Lower Priority — Polish, scale, future phases

### 9. Test suite
Zero automated tests currently exist. Given the business-critical nature of:
- Word count validation
- LinkedIn character limit handling (`resolvePublishText()`)
- Draft versioning logic (never lose Sharath's edits)
- Voice rule injection

...these are good first candidates for unit tests. Consider:
- `countWords()` and `parseGenerationMetadata()` — pure functions, easy to unit test
- `resolvePublishText()` — pure function, test all three branches (full content, excerpt, truncation)
- Integration test for the draft versioning insert logic (`saveDrafts()`)

### 10. Multi-business LinkedIn presence
Currently all publishing is to Sharath's personal LinkedIn profile. The playbook references content for 5-Swans and Bradford International Alliance specifically. Open question (flagged in original README):
- Should 5-Swans and Bradford have their own LinkedIn Company Pages with separate publishing?
- This would require `w_organization_social` / `r_organization_social` scopes and a more complex token model (one set of tokens per LinkedIn entity, not just per Sharath's personal profile)

### 11. Phase 4 — Book/manuscript export
Long-term goal from the README roadmap: export the 52-week story arc as a manuscript/book draft. This depends on:
- All 52 weeks having complete `story_log` entries
- A new export route that assembles posts in narrative order, possibly with a dedicated "manuscript assembly" prompt that smooths transitions between weekly posts into book chapters

### 12. Consolidate `saturday-prompt.ts` into `prompts.ts`
Minor refactor flagged as technical debt — currently the Saturday market insights prompt lives in a separate file for "needs external data" reasons, but this creates two places to look for prompt logic. Consider merging once the Saturday data-input flow (item 5) is finalised and the pattern is stable.

### 13. Custom domain finalisation
`app.coachsharath.com` is the target domain but DNS/OAuth redirect updates across Supabase, LinkedIn, and Vercel are still pending (per README's "Key Open Questions"). Needed before:
- LinkedIn OAuth redirect URIs can be finalised for production
- Production magic-link emails point to the right domain

---

## Open Questions Carried Over From README

- [ ] **Vercel Pro plan** — confirm subscription is active for Cron job support (publish scheduling and analytics depend on this)
- [ ] **Custom domain** — `app.coachsharath.com` DNS + redirect URI updates across all three services (Supabase, LinkedIn, Vercel)
- [ ] **Multi-business LinkedIn** — personal profile vs. Company Pages for 5-Swans / Bradford content (see item 10)

---

## Suggested First Sprint for Claude Code

If picking up this project fresh, a sensible order:

1. Run all three migrations (001, 002, 003) and create `system_settings` table (see `docs/setup-notes.md`)
2. Set `LINKEDIN_SERVICE_TOKEN` env var to activate analytics cron (item 2)
3. Verify the LinkedIn `/rest/posts` publish flow end-to-end with a real test post (item 3)
4. Set up `ANTHROPIC_MODEL` env var if you want to pin a specific Claude version
5. Confirm `CRON_SECRET` is set in Vercel and the cron schedules match expectations
