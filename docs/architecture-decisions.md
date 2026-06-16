# Architecture Decisions

A record of significant architectural decisions made during development, including alternatives considered and trade-offs accepted.

---

## 1. Single-user app, not multi-tenant

**Decision:** The entire system is built for one user (Sharath). No `tenant_id` or `organisation_id` columns. `linkedin_tokens` is queried by `.limit(1).single()` for Cron calls rather than joining on a user.

**Alternatives considered:** Multi-tenant schema with organisation-level isolation, to allow other coaches to use the platform later.

**Trade-off accepted:** Faster to build, simpler RLS policies, no auth complexity for "which user's LinkedIn token do I use." If this ever needs to support other coaches, the schema will need a migration to add `user_id`/`tenant_id` columns across `weeks`, `posts`, `drafts`, `voice_rules`, and a proper join on `linkedin_tokens`.

---

## 2. Draft versioning — never delete, always append

**Decision:** Every generation or edit inserts a new row into `drafts` with an incremented `version`. The original AI-generated draft (`is_original: true`, `version: 1`) is preserved forever. The "current" draft is the highest-version row where `is_original = false`.

**Alternatives considered:** Overwrite the draft content in place (single row per post), with edit history stored separately as diffs.

**Trade-off accepted:** More storage used (acceptable — text rows are cheap), but this gives:
- A clean audit trail of every edit
- The `/api/learn` route can always diff "original AI output" vs. "Sharath's final edit," even if there were multiple intermediate edits
- Easy rollback to any previous version if needed

---

## 3. Voice rules fetched fresh on every generation call — no caching

**Decision:** `buildVoiceRulesBlock()` queries the `voice_rules` table on every single `/api/generate` call, with no in-memory or Redis caching layer.

**Alternatives considered:** Cache active voice rules in memory or edge config, invalidate on `/api/learn` writes.

**Trade-off accepted:** Slightly slower generation calls (one extra Supabase query — negligible latency vs. the multi-second Anthropic call), but guarantees that the moment Sharath approves a new voice rule, the very next generation uses it. This correctness guarantee was judged more valuable than the marginal latency saving, especially for a low-volume system (max ~6 generations/week).

---

## 4. Word counts computed programmatically, never trusted from the LLM

**Decision:** `countWords()` in `lib/anthropic/client.ts` is the single source of truth for word counts. The LLM is asked to report `WORD_COUNT:` as part of its structured output, but this value is **discarded** — `parseGenerationMetadata()` recomputes the count from the actual `content` string.

**Alternatives considered:** Trust the LLM's self-reported count (faster, one less computation).

**Trade-off accepted:** LLMs are unreliable at precise counting. The word count standards (900–1100, 180–250, etc.) are **non-negotiable** business requirements tied to LinkedIn algorithm performance and Sharath's brand consistency. A wrong count silently passing validation would undermine the entire content strategy. Programmatic verification is cheap and removes this risk entirely.

---

## 5. Narrative continuity via a dedicated `story_log` table, not derived from `posts`/`drafts`

**Decision:** A separate `story_log` table stores `core_insight`, `callback_used`, `thread_planted`, and `references_used` (as JSONB) for every approved post, extracted either automatically during generation or via `buildStoryLogExtractionPrompt()` after the fact.

**Alternatives considered:** Parse the previous week's `drafts.content` directly at generation time to derive narrative context (no separate table).

**Trade-off accepted:** Extra table and an extra extraction step, but:
- Structured `references_used` (Vedic/banking/coaching) enables the "do not repeat within 4 weeks" rule via simple JSONB queries, which would be very hard to do reliably by re-parsing raw post text
- `core_insight` and `thread_planted` are short, structured fields that are cheap to inject into the next prompt — far cheaper than re-sending the previous week's full 900-word article as context
- Keeps the narrative continuity logic decoupled from the editing/versioning logic in `drafts`

---

## 6. LinkedIn publishing — full-article PDF document post (not excerpt, not article API)

**Decision (revised 2026-06-16):** For Monday/Wednesday long-form articles (900–1100 words), publish the **full article formatted as a PDF** via LinkedIn's document post API (`/rest/documents`). The PDF is generated server-side with `@react-pdf/renderer` using Coach Sharath's brand template (navy/gold, Montserrat font), uploaded to Supabase Storage, downloaded at publish time, and uploaded to LinkedIn as a document post (which displays as a scrollable document viewer in the LinkedIn feed).

**Previous approach (removed):** A second Anthropic call generated a 1800–2700 char `linkedin_excerpt` saved to `drafts.linkedin_excerpt`, which was then published as a text post with a smart truncation fallback. This was removed because: (1) excerpts of long-form pieces rarely read as complete; (2) the AI excerpt call added latency; (3) excerpts cannot carry the same engagement signals as document posts.

**Alternatives considered:**
1. **LinkedIn Article API** — investigated `/v2/articles`. **Does not exist** for third-party API publishing. LinkedIn long-form articles can only be created through the web UI.
2. **Manual publish (Sharath uploads manually)** — rejected because Mon/Wed are the highest-value posts and removing automation there defeats the system's purpose.
3. **Text post with smart truncation** — technically valid (fits 3000-char limit with paragraph-break truncation) but produces incomplete-feeling posts that undermine Category A/B conversion.
4. **Link card to coachsharath.com** — rejected because coachsharath.com is on Wix, dormant 2+ years, near-zero SEO authority, and has no publishing API.

**Trade-off accepted:** Generating PDFs adds ~2–5 seconds to the publish flow (one-time, before LinkedIn upload). The `post_media` table and Supabase Storage add operational overhead (bucket must be created manually). In exchange: full articles reach the audience with no truncation, LinkedIn document posts have higher engagement than text posts, and metrics are fully trackable via the analytics cron.

**Implementation:** `lib/templates/article-pdf.tsx` + `lib/templates/carousel-pdf.tsx` (react-pdf), `lib/templates/quote-image.ts` (satori + resvg-js), `app/api/media/generate/route.ts`, `app/api/media/[id]/route.ts`, `post_media` DB table.

---

## 7. Streaming generation via raw `ReadableStream`, not a streaming library

**Decision:** `/api/generate` returns a raw `ReadableStream` of UTF-8 text chunks with `Content-Type: text/plain` and `Transfer-Encoding: chunked`. The frontend reads this stream directly and appends to the editor in real time.

**Alternatives considered:** Use a library like `ai` (Vercel AI SDK) which provides hooks (`useChat`, `useCompletion`) for streaming.

**Trade-off accepted:** More manual plumbing (manually parsing chunks, manually triggering `saveDrafts()` after `controller.close()`), but avoids adding a dependency whose abstractions (chat-message paradigm) don't map cleanly onto "stream one long-form document into an editor and then run post-processing."

---

## 8. Media attached to posts, not to drafts

**Decision:** The `post_media` table links to `posts.id`, not `drafts.id`. One media file per media type per post (`UNIQUE(post_id, media_type)`). When content is regenerated, the media is regenerated and the record is upserted — the new file replaces the old one at the same storage path.

**Alternatives considered:** Attach media to a specific draft version (link to `drafts.id`). This would preserve media history across regenerations.

**Trade-off accepted:** We don't need a versioned media history — media is derived from content, and content versioning is already handled by the `drafts` table. Attaching to the post (not the draft) keeps the media model simple: there is always at most one current PDF/image per post, which is what the publish route needs.

---

## 9. Day-based business logic encoded as data (posts.day), not as separate route/table per day

**Decision:** A single `posts` table with a `day` column (`'monday'` … `'saturday'`) and a single `/api/generate` route handles all post types. Day-specific behaviour (format, pillar, audience, prompt selection) is derived via lookup objects (`formatInstructions`, `audienceContext`) inside `buildGeneratePostPrompt()`, plus the `LONG_FORM_DAYS` array and the Saturday-specific branch.

**Alternatives considered:** Separate Next.js routes per day (`/api/generate/monday`, `/api/generate/saturday`, etc.) or separate tables per content type.

**Trade-off accepted:** A few conditional branches in shared code (e.g. `isLongForm = LONG_FORM_DAYS.includes(body.day) && body.format === 'long_form_article'`), but this keeps the weekly calendar logic centralised and easy to change in one place (`buildWeekPlanPrompt()`) if the calendar itself changes — which the master playbook explicitly anticipates (themes rotate quarterly, calendar structure is described as a "logic" not a hardcoded constant).

---

## 10. Prompts centralised in `lib/anthropic/prompts.ts` (+ `saturday-prompt.ts`), never inline in routes

**Decision:** Every prompt-building function (`MASTER_SYSTEM_PROMPT`, `buildNarrativeContext`, `buildVoiceRulesBlock`, `buildGeneratePostPrompt`, `buildLinkedInExcerptPrompt`, `buildStoryLogExtractionPrompt`, `buildEditDiffPrompt`, `buildThemeProposalPrompt`, `buildWeekPlanPrompt`) lives in `lib/anthropic/prompts.ts`. Saturday's market-data prompt lives in a sibling file `saturday-prompt.ts` for separation of the "needs external real-time data" case.

**Alternatives considered:** Inline prompt strings within each API route file.

**Trade-off accepted:** Slightly more indirection (routes import prompt builders rather than containing the text directly), but this file is explicitly called out in the README as "the most important file in the codebase — any changes to Sharath's voice or content rules should be made here." Centralisation means voice/content strategy changes never require touching route logic, and vice versa — route logic changes (like the LinkedIn excerpt fix) never require touching the voice playbook.

---

## 11. Data flow summary

```
Sunday Planning Session (PlanningSessionModal)
  └─> GET /api/plan → fetch 2–3 forward weeks
  └─> POST /api/plan { action: 'propose_themes' } → buildThemeProposalPrompt() → 5 theme options (JSON)
       └─> Sharath selects theme
            └─> POST /api/plan { action: 'generate_plan', weekId, theme }
                 └─> buildWeekPlanPrompt() → 6 post slots
                      └─> UPSERT INTO posts (status: 'draft' or 'awaiting_market_data' for Saturday)
                      └─> UPDATE weeks SET theme, plan, status='confirmed'

Per-post generation (Mon–Sat)
  └─> /api/generate
       ├─> fetch active voice_rules → buildVoiceRulesBlock()
       ├─> fetch story_log (latest) + weeks.open_thread → buildNarrativeContext()
       ├─> buildGeneratePostPrompt() (or buildSaturdayMarketInsightsPrompt() for Saturday)
       │    └─> output includes LINKEDIN_CAPTION: (long-form/carousel) or QUOTE: (text/market) fields
       ├─> Anthropic streaming call → ReadableStream → editor
       └─> on stream close: saveDrafts() → INSERT INTO drafts

Sharath edits draft in editor
  └─> /api/drafts/save → UPDATE drafts SET content, word_count (in-place, no new version)
                       → UPDATE posts SET status = 'edited' if was 'draft'

Sharath approves post
  └─> POST /api/learn { postId }
       ├─> buildStoryLogExtractionPrompt() → UPSERT INTO story_log
       ├─> UPDATE weeks SET open_thread = $thread_planted
       ├─> UPDATE posts SET status = 'approved', approved_at = now()
       └─> if content changed: buildEditDiffPrompt() → return candidateRules (not auto-saved)
            └─> CandidateRulesModal → Sharath reviews
                 └─> POST /api/rules/candidates → INSERT INTO voice_rules (approved subset only)

Media generation (editor sidebar, optional before publish)
  └─> POST /api/media/generate { postId, mediaType }
       ├─> fetch post + current draft
       ├─> generate PDF (react-pdf) or PNG (satori + resvg-js) from draft content
       ├─> upload to Supabase Storage (bucket: post-media, path: posts/{id}/{type}/{file})
       ├─> UPSERT INTO post_media
       └─> return signed URL for preview

Publishing
  └─> POST /api/publish { postId, publishNow: true }
       ├─> fetch post + current draft + post_media record (if any)
       ├─> resolve caption: post_media.linkedin_caption → fallback smart truncation
       ├─> if media exists:
       │    ├─> download file from Supabase Storage
       │    ├─> if PDF: POST /rest/documents (init) → PUT binary → POST /rest/posts with content.media.id
       │    └─> if PNG: POST /rest/images (init) → PUT binary → POST /rest/posts with content.media.id
       └─> if no media: POST /rest/posts with text commentary only
       └─> INSERT INTO linkedin_posts, UPDATE posts.status = 'published'

Scheduled publishing
  └─> Vercel Cron (/api/cron/publish, 2:30 AM UTC daily)
       └─> SELECT posts WHERE status='scheduled' AND scheduled_at <= now() LIMIT 10
            └─> POST /api/publish for each

Analytics polling
  └─> Vercel Cron (/api/cron/analytics, 1:00 AM UTC daily)
       └─> SELECT linkedin_posts published in last 90 days
            └─> GET LinkedIn socialActions API → INSERT INTO performance_data
```

---

## 12. State management — no global client state library

**Decision:** No Redux/Zustand/Jotai. Server components fetch data directly from Supabase; client components (editor, streaming view) use local `useState`/`useRef`. Auto-save uses debounced calls to `/api/drafts/save`.

**Trade-off accepted:** Some prop-drilling in nested dashboard components, but the app's interaction model (one post edited at a time, server-rendered lists) doesn't need cross-page shared state. Revisit if the dashboard grows significantly more interactive (e.g. real-time collaborative editing — not currently a requirement for a single-user app).
