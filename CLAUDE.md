# Sharath Content Engine — Claude Code Instructions

## Project Overview

The Sharath Content Engine (SCE) is a private, single-user AI-powered content creation and publishing platform for **Sharath Kumar R N** — an IIT-trained executive coach, former global banker, and founder of three businesses:

- **Coach Sharath** (`coachsharath.com`) — Executive and life coaching, India/UAE
- **5-Swans** (`5-swans.com`) — Algo-driven wealth management for HNIs and Family Offices
- **Bradford International Alliance** (`bradfordia.org`) — Professional upskilling institute, UAE

The system generates, edits, schedules, publishes, and learns from LinkedIn content across a 52-week annual narrative arc. It is not a generic content tool — every prompt, every database field, and every UI decision is built around Sharath's specific businesses, voice, and client acquisition goals.

**Live deployment:** `https://sharath-content-engine.vercel.app`
**Repository:** `https://github.com/krishnus/sharath-content-engine`

---

## Tech Stack

### Framework & Runtime
- **Next.js 14** (App Router, TypeScript) — framework
- **Node.js** — runtime (all API routes use `export const runtime = 'nodejs'`)
- **TypeScript** — strict mode throughout

### Backend & Database
- **Supabase** — PostgreSQL database, authentication (magic link), Row Level Security
  - `@supabase/supabase-js` — JS client
  - `@supabase/ssr` — server-side rendering helpers for Next.js App Router

### AI
- **Anthropic API** — model is read from `process.env.ANTHROPIC_MODEL`, falling back to `claude-sonnet-4-5-20250929`
  - `@anthropic-ai/sdk` — official SDK
  - `MODEL` constant exported from `lib/anthropic/client.ts` — use this everywhere; never hardcode the model string
  - `MAX_TOKENS` export = **2048** (used for main generation); excerpt call hardcodes `max_tokens: 1024` locally
  - Streaming enabled for draft generation (raw `ReadableStream`, `Content-Type: text/plain`)

### Publishing & Social
- **LinkedIn REST API** (`/rest/posts` endpoint) — post publishing
  - ⚠️ Use `/rest/posts`, NOT the deprecated `/v2/ugcPosts` (400 errors on >3000 chars)
  - LinkedIn-Version header: `202604`
  - Personal profile publishing only (not Company Pages yet)

### Frontend
- **Tailwind CSS** — styling with custom brand design tokens (navy/gold palette, pillar colours, status colours)
- **date-fns**, **lucide-react** — date utilities and icons
- React hooks and client components (`'use client'`) for interactive pages; no global state library

### Infrastructure
- **Vercel** — hosting, deployment, Cron jobs (requires Pro plan for cron)
- **Vercel Cron** — two jobs:
  - Scheduled publishing: `30 2 * * *` (2:30 AM UTC daily)
  - Analytics polling: `0 1 * * *` (1:00 AM UTC daily)

---

## Repository Structure

```
sharath-content-engine/
├── app/
│   ├── api/
│   │   ├── analytics/route.ts          # Analytics dashboard data (totals, trends, by-pillar)
│   │   ├── arc/route.ts                # 52-week story arc data
│   │   ├── calendar/route.ts           # Monthly calendar entries (?year=&month=)
│   │   ├── drafts/
│   │   │   ├── [draftId]/route.ts      # Fetch a single draft by ID
│   │   │   └── save/route.ts           # Auto-save draft (in-place UPDATE, not INSERT)
│   │   ├── fix-hook/route.ts           # AI rewrites opening to fit ≤210 chars
│   │   ├── generate/route.ts           # Content generation — Anthropic API, streaming
│   │   ├── learn/route.ts              # Approve post → story log + candidate voice rules
│   │   ├── linkedin/
│   │   │   ├── callback/route.ts       # LinkedIn OAuth callback (stores token)
│   │   │   ├── disconnect/route.ts     # Remove LinkedIn token
│   │   │   └── status/route.ts        # Check LinkedIn connection status
│   │   ├── plan/route.ts              # GET forward plan; POST theme proposals + week plans
│   │   ├── posts/[postId]/route.ts    # GET post+drafts for editor; PATCH status
│   │   ├── publish/
│   │   │   ├── route.ts               # LinkedIn publishing — /rest/posts API
│   │   │   └── delete/route.ts        # Delete preview post from LinkedIn
│   │   ├── rules/
│   │   │   ├── candidates/route.ts    # Save Sharath-approved candidate rules
│   │   │   └── route.ts               # Voice rules CRUD (GET/POST/PATCH/DELETE)
│   │   ├── settings/route.ts          # system_settings table read/write
│   │   ├── weeks/
│   │   │   ├── route.ts               # Create/upsert a week
│   │   │   └── status/route.ts        # Week approval progress (?weekNumber=&year=)
│   │   └── cron/
│   │       ├── publish/route.ts       # Scheduled post publisher (Vercel Cron, 2:30 AM UTC)
│   │       └── analytics/route.ts     # LinkedIn analytics poller (Vercel Cron, 1:00 AM UTC)
│   ├── auth/
│   │   ├── login/page.tsx             # Magic link login page
│   │   └── callback/route.ts          # Supabase OAuth callback handler
│   └── dashboard/
│       ├── page.tsx                   # Forward Plan — weekly post overview + planning session
│       ├── layout.tsx                 # Sidebar navigation shell
│       ├── calendar/page.tsx          # Monthly calendar view of all posts
│       ├── drafts/[postId]/page.tsx   # Inline draft editor with generate/approve/publish
│       ├── arc/page.tsx               # 52-week story arc timeline
│       ├── rules/page.tsx             # Voice Rules Library
│       ├── analytics/page.tsx         # Performance dashboard
│       └── settings/page.tsx          # LinkedIn connect + system settings
├── components/
│   ├── CandidateRulesModal.tsx        # Review + approve AI-extracted voice rules
│   ├── DiffView.tsx                   # Original vs. edited draft comparison
│   ├── PlanningSessionModal.tsx       # Sunday planning session flow (theme → week plan)
│   ├── PublishPanel.tsx               # Publish/schedule/preview controls in editor
│   └── SaturdayInsightsModal.tsx      # Saturday market data input + generation trigger
├── lib/
│   ├── anthropic/
│   │   ├── client.ts                  # Anthropic SDK wrapper, MODEL/MAX_TOKENS consts, parseGenerationMetadata(), countWords()
│   │   ├── prompts.ts                 # ALL generation prompts — the engine's brain
│   │   └── saturday-prompt.ts         # Dedicated Saturday market insights prompt
│   ├── supabase/
│   │   ├── client.ts                  # Browser client — exports createClient() (wraps createBrowserClient)
│   │   ├── server.ts                  # Server client (createClient) + service role (createServiceClient)
│   │   └── types.ts                   # Full TypeScript types mirroring DB schema
│   └── utils/
│       └── helpers.ts                 # cn(), countWords(), date helpers, label maps
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql     # Full schema — run this first
│       ├── 002_linkedin_tokens.sql    # Adds linkedin_tokens table — run second
│       └── 003_drafts_linkedin_excerpt.sql  # Adds linkedin_excerpt column to drafts — run third
├── middleware.ts                      # Auth guard — redirects /dashboard to /auth/login if no session
├── tailwind.config.js                 # Brand design tokens (navy/gold palette)
├── vercel.json                        # Cron job schedule configuration
├── next.config.mjs                    # Next.js config
├── tsconfig.json
├── .env.example                       # Environment variable template
└── package.json
```

---

## Database Schema

All tables live in the Supabase `public` schema with Row Level Security enabled.

### `annual_arcs`
One row per year. Holds the four quarterly arc themes and narrative state.
```sql
id           uuid  PK
year         int   UNIQUE
q1_theme     text  NOT NULL  default 'The Awakening'
q2_theme     text  NOT NULL  default 'The Turning'
q3_theme     text  NOT NULL  default 'The Becoming'
q4_theme     text  NOT NULL  default 'The Integration'
arc_state    jsonb NOT NULL  default '{"open_threads":[],"used_references":[],"chapter_summaries":{}}'
created_at   timestamptz
updated_at   timestamptz
```
Seeded with a 2026 row on schema creation. Used by `weeks` (FK) and `GET /api/arc`.

### `weeks`
One row per planned week. Two weeks planned per Sunday planning session.
```sql
id           uuid  PK
arc_id       uuid  NOT NULL  FK → annual_arcs.id  ON DELETE CASCADE
year         int   NOT NULL
week_number  int   NOT NULL
week_start   date  NOT NULL
theme        text
quarter      text  CHECK ('Q1'|'Q2'|'Q3'|'Q4')
open_thread  text
plan         jsonb NOT NULL  default '[]'    -- PlanSlot[] from the week plan generation
status       text  NOT NULL  default 'draft' CHECK ('draft'|'confirmed')
created_at   timestamptz
updated_at   timestamptz
UNIQUE(year, week_number)
```

### `posts`
One row per post slot. 6 posts per week (Mon–Sat). All five type columns are PostgreSQL enums.
```sql
id                   uuid  PK
week_id              uuid  NOT NULL  FK → weeks.id  ON DELETE CASCADE
day                  post_day NOT NULL        -- 'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'
pillar               post_pillar NOT NULL     -- 'vedic_leadership'|'banker_coach'|'coaching_transformation'|'financial_intelligence'|'inner_work'
format               post_format NOT NULL    -- 'long_form_article'|'text_post'|'carousel'|'market_insights'
status               post_status NOT NULL default 'draft'
                                             -- 'awaiting_market_data'|'draft'|'edited'|'approved'|'scheduled'|'published'|'publish_failed'
narrative_position   narrative_position      -- 'chapter_opening'|'chapter_deepening'|'complication'|'resolution'|'bridge'
target_audience      text
target_word_count    int
hook_idea            text
scheduled_at         timestamptz
approved_at          timestamptz
created_at           timestamptz
updated_at           timestamptz
UNIQUE(week_id, day)
```

### `drafts`
Version-controlled draft content. Never deletes old versions.
```sql
id               uuid  PK
post_id          uuid  NOT NULL  FK → posts.id  ON DELETE CASCADE
version          int   NOT NULL  default 1
content          text  NOT NULL  default ''
word_count       int   NOT NULL  default 0
is_original      bool  NOT NULL  default false
linkedin_excerpt text  NULLABLE  -- AI-crafted excerpt (≤2700 chars) for Mon/Wed long-form; added in migration 003
created_at       timestamptz
UNIQUE(post_id, version)
```
**Key rule:** The draft with `is_original = false` and the highest `version` is the "current" draft. The `is_original = true` draft is always version 1 (never edited). On `/api/drafts/save`, the current draft is **updated in-place** (not versioned). A new `is_original = false` draft is only inserted when `/api/generate` runs again (regeneration).

### `story_log`
Narrative continuity tracker — one entry per approved post.
```sql
id               uuid  PK
post_id          uuid  NOT NULL  UNIQUE  FK → posts.id  ON DELETE CASCADE
core_insight     text
callback_used    text
thread_planted   text
references_used  jsonb NOT NULL  default '{"vedic":[],"banking":[],"coaching":[]}'
created_at       timestamptz
```
Written automatically by `POST /api/learn` when Sharath approves a post. Feeds `buildNarrativeContext()` on every generation call.

### `voice_rules`
Learned voice corrections extracted from Sharath's edits. Uses a `rule_category` enum.
```sql
id              uuid  PK
category        rule_category NOT NULL
                -- 'avoid_phrase'|'prefer_phrase'|'structural_pattern'|'cta_adjustment'|'tone_calibration'|'opening_style'|'closing_style'
rule_text       text  NOT NULL
example_before  text
example_after   text
source_post_id  uuid  NULLABLE  FK → posts.id  ON DELETE SET NULL
active          bool  NOT NULL  default true
approved_at     timestamptz
created_at      timestamptz
```
Fetched fresh on every generation call. Injected into system prompt via `buildVoiceRulesBlock()`. No caching.

### `linkedin_tokens`
OAuth tokens for LinkedIn publishing. Added in **migration 002**.
```sql
id             uuid  PK
user_id        uuid  NOT NULL  FK → auth.users.id  ON DELETE CASCADE
access_token   text  NOT NULL
refresh_token  text  NULLABLE
expires_at     timestamptz NOT NULL
linkedin_id    text  NULLABLE  -- LinkedIn member URN sub (e.g. "ACoAA...")
display_name   text  NULLABLE
connected_at   timestamptz  NOT NULL  default now()
updated_at     timestamptz  NOT NULL  default now()
UNIQUE(user_id)
```

### `linkedin_posts`
Record of published LinkedIn posts.
```sql
id               uuid  PK
post_id          uuid  NOT NULL  UNIQUE  FK → posts.id  ON DELETE CASCADE
linkedin_post_id text  NOT NULL  -- LinkedIn's URN (e.g. "urn:li:share:123456789")
linkedin_url     text  NULLABLE  -- https://www.linkedin.com/feed/update/{id}/
published_at     timestamptz NOT NULL  default now()
```

### `performance_data`
Time-series analytics per published post. New row written on each analytics poll.
```sql
id                uuid  PK
linkedin_post_id  uuid  NOT NULL  FK → linkedin_posts.id  ON DELETE CASCADE
impressions       int   NOT NULL  default 0
likes             int   NOT NULL  default 0
comments          int   NOT NULL  default 0
shares            int   NOT NULL  default 0
clicks            int   NOT NULL  default 0
fetched_at        timestamptz NOT NULL  default now()
```

### `system_settings`
Key-value store for system configuration. **Not in the migration files** — must be created separately and seeded with initial rows.
```
key (text PK): inception_date, training_period_weeks, live_date,
               arc_q1_theme, arc_q2_theme, arc_q3_theme, arc_q4_theme
value (text)
updated_at (timestamptz)
```
Used by `GET|PATCH /api/settings` and the Settings dashboard page. The arc quarter number and training-period status are derived from these values at request time.

---

## API Endpoints

### `POST /api/generate`
Generates draft content via Anthropic API.
- **Auth:** Supabase session
- **Streaming:** Yes by default (`stream: true`). Returns `ReadableStream` of text chunks (`Content-Type: text/plain`).
- **Body:**
  ```typescript
  {
    postId: string
    weekId: string
    day: PostDay
    pillar: PostPillar
    format: PostFormat
    theme: string
    targetAudience: string
    targetWordCount: number
    hookIdea?: string | null
    narrativePosition: NarrativePosition
    quarter: string
    marketContext?: string   // Saturday only — real Nifty/Sensex data from Sharath
    stream?: boolean         // default true
  }
  ```
- **Side effects:**
  - On first generation: inserts version 1 (`is_original: true`) + version 2 (`is_original: false`) into `drafts`
  - On regeneration: inserts a new version (max+1, `is_original: false`)
  - For Monday/Wednesday long-form: fires `generateAndSaveExcerpt()` — a second silent Anthropic call (`max_tokens: 1024`) that saves `linkedin_excerpt` to the draft row. In streaming mode this is async (non-blocking); in non-streaming mode it's awaited.
  - Updates `posts.status` to `'draft'`

### `GET /api/plan`
Returns the 2 (or 3) forward plan weeks with their posts.

### `POST /api/plan`
Theme proposals and week plan generation.
- **Body `action: 'propose_themes'`:** Returns 5 theme option objects as JSON.
- **Body `action: 'generate_plan'`:** Takes `weekId` + `theme`, generates 6-slot plan via `buildWeekPlanPrompt()`, saves plan to `weeks.plan`, sets `weeks.status = 'confirmed'`, upserts 6 `posts` rows (Saturday → `status: 'awaiting_market_data'`, others → `'draft'`).

### `POST /api/learn`
Called when Sharath approves an edited post. Takes `{ postId: string }`.
1. Fetches original and current drafts from DB
2. Always: extracts story log via `buildStoryLogExtractionPrompt()`, upserts into `story_log`, updates `weeks.open_thread`
3. Always: transitions `posts.status` to `'approved'`, sets `approved_at`
4. If content changed: diffs original vs. current via `buildEditDiffPrompt()`, returns candidate rules for UI review
- **Returns:** `{ candidateRules: VoiceRule[], storyLog: {...} }`
- Candidate rules are **not** saved automatically — user reviews them in `CandidateRulesModal`, then `POST /api/rules/candidates` saves the approved subset.

### `PUT /api/learn`
Saves a set of approved voice rules. Takes `{ rules: [...], sourcePostId: string }`. Alternative to `POST /api/rules/candidates`.

### `POST /api/drafts/save`
Auto-saves editor content. **Updates the current draft in-place** (does not insert a new version).
- `UPDATE drafts SET content, word_count WHERE post_id = $postId AND is_original = false`
- Sets `posts.status = 'edited'` if it was `'draft'`
- **Returns:** `{ saved: true, wordCount: number }`

### `GET /api/drafts/[draftId]`
Fetches a single draft by ID.

### `GET /api/posts/[postId]`
Returns full post + original content + current content + version list for the draft editor.

### `PATCH /api/posts/[postId]`
Allows safe status transitions (`approved | draft | edited` only).

### `POST /api/publish`
Publishes a post to LinkedIn, schedules it, or creates a preview.
- **Auth:** Supabase session OR Vercel Cron (`x-cron-secret` header = `CRON_SECRET`)
- **Body:**
  ```typescript
  {
    postId: string
    publishNow: boolean
    scheduledAt?: string      // ISO timestamp, for schedule-only mode
    preview?: boolean         // Posts as LOGGED_IN visibility
    promotePreview?: boolean  // Converts existing preview to PUBLIC
    linkedinPostId?: string   // Required for promotePreview
  }
  ```
- **Content resolution priority (`resolvePublishText()`):**
  1. `linkedin_excerpt` if it exists and fits ≤3000 chars
  2. Smart truncation at last `\n\n` before char 2900 + `[Full article on coachsharath.com — link in bio]`
  3. Last sentence break or hard ellipsis as final fallback
- **Returns:** `{ published, preview, url, linkedinPostId, wasExcerpt }`

### `DELETE /api/publish/delete`
Deletes a preview post from LinkedIn (uses `/v2/ugcPosts` endpoint) and resets `posts.status` to `'approved'`.

### `POST /api/fix-hook`
Rewrites a post's opening paragraph to fit within 210 characters using a targeted Anthropic call. Saves the fixed content to the current draft.

### `GET /api/rules`
Returns all voice rules ordered by `created_at DESC`.

### `POST /api/rules`
Manually add a new voice rule.

### `PATCH /api/rules`
Toggle `active` or update `rule_text` for a rule.

### `DELETE /api/rules`
Permanently delete a rule.

### `POST /api/rules/candidates`
Saves Sharath-approved candidate rules from the `CandidateRulesModal` after `/api/learn` review.

### `GET /api/analytics`
Returns analytics data: totals, 30-day trends, by-pillar breakdown, recent 10 posts. Joins `performance_data` (latest snapshot per post). Powers the Analytics dashboard page.

### `GET /api/arc`
Returns current year's `annual_arcs` record, all `weeks` with their posts and `story_log` entries, current week number, and latest open thread. Powers the Arc timeline page.

### `GET /api/calendar`
Returns calendar entries for a given month (`?year=&month=`). Builds a flat list of `{ date, weekId, weekTheme, post }` objects. Powers the Calendar dashboard page.

### `POST /api/weeks`
Create or upsert a week record (auto-creates `annual_arcs` row for the year if needed).

### `GET /api/weeks/status`
Returns week approval progress: `approvedCount`, `totalPosts`, `theme`, `status`.

### `GET /api/settings`
Returns all `system_settings` key-value pairs plus derived values: `isTrainingPeriod`, `arcWeekNumber`, `arcQuarter`, `arcQuarterTheme`, `arcYearNumber`.

### `PATCH /api/settings`
Update a single setting by key.

### `GET /api/linkedin/status`
Returns `{ connected: boolean, tokenInfo: { display_name, expires_at, connected_at } }`.

### `GET /api/linkedin/callback`
LinkedIn OAuth callback. Exchanges code for token, fetches LinkedIn profile, upserts into `linkedin_tokens`. Redirects to `/dashboard/settings?linkedin=connected`.

### `DELETE /api/linkedin/disconnect`
Deletes the LinkedIn token row for the current user.

### `GET /api/cron/publish`
Vercel Cron — runs at **2:30 AM UTC** (`30 2 * * *`).
- **Auth:** `Authorization: Bearer ${CRON_SECRET}` header
- Fetches `posts WHERE status='scheduled' AND scheduled_at <= now()` (limit 10)
- Calls `/api/publish` for each with `x-cron-secret` header

### `GET /api/cron/analytics`
Vercel Cron — runs at **1:00 AM UTC** (`0 1 * * *`).
- **Auth:** `Authorization: Bearer ${CRON_SECRET}` header
- Fetches `linkedin_posts` published in last 90 days (limit 50)
- Requires `LINKEDIN_SERVICE_TOKEN` env var (separate from user OAuth token) — currently a TODO if this var is not set

---

## Authentication & Authorization

- **Method:** Supabase magic link (email OTP — no passwords)
- **Single-user app:** Only Sharath's email should have access.
- **Middleware (`middleware.ts`):** Protects all `/dashboard/*` routes. Checks for Supabase auth cookie first (fast path), then calls `getUser()`. Redirects to `/auth/login` if not authenticated. Redirects `/auth/login` → `/dashboard` if already authenticated.
- **Two Supabase clients:**
  - `createClient()` in `lib/supabase/server.ts` — standard server client, respects RLS, uses session cookies
  - `createServiceClient()` in `lib/supabase/server.ts` — uses `SUPABASE_SERVICE_ROLE_KEY`, bypasses RLS, used by Cron jobs only
  - `createClient()` in `lib/supabase/client.ts` — browser client wrapping `createBrowserClient` from `@supabase/ssr`
- **LinkedIn OAuth:** Handled via Supabase OAuth (`signInWithOAuth({ provider: 'linkedin_oidc' })`). After callback, `provider_token` is extracted and stored in `linkedin_tokens` table. Separate from Supabase session auth.
- **Cron authentication:** Cron routes check `Authorization: Bearer ${CRON_SECRET}`. `/api/publish` (called by cron) checks `x-cron-secret` header.

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in all values. Never commit real values.

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=           # Project URL from Supabase dashboard → Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # anon/public key
SUPABASE_SERVICE_ROLE_KEY=          # service_role key (server-only, never expose to client)

# Anthropic
ANTHROPIC_API_KEY=                  # sk-ant-... from console.anthropic.com
ANTHROPIC_MODEL=                    # Optional override; defaults to claude-sonnet-4-5-20250929

# LinkedIn OAuth
LINKEDIN_CLIENT_ID=                 # From LinkedIn Developer Portal app
LINKEDIN_CLIENT_SECRET=             # From LinkedIn Developer Portal app
LINKEDIN_REDIRECT_URI=              # http://localhost:3000/auth/callback (local) or production URL

# App
NEXT_PUBLIC_APP_URL=                # http://localhost:3000 (local) or https://app.coachsharath.com
CRON_SECRET=                        # Any random string — must match Vercel environment variable

# Optional — required for cron analytics to fetch LinkedIn engagement data
LINKEDIN_SERVICE_TOKEN=             # Service-level LinkedIn access token for cron analytics polling
```

---

## Running Locally

```bash
# 1. Clone and install
git clone https://github.com/krishnus/sharath-content-engine.git
cd sharath-content-engine
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in all values in .env.local

# 3. Set up Supabase database
# Go to Supabase dashboard → SQL Editor, run in order:
# supabase/migrations/001_initial_schema.sql
# supabase/migrations/002_linkedin_tokens.sql
# supabase/migrations/003_drafts_linkedin_excerpt.sql
# Also create system_settings table and seed it (see docs/setup-notes.md)

# 4. Start development server
npm run dev
# Open http://localhost:3000
```

### npm Scripts
```json
"dev":       "next dev"      // Development server with hot reload
"build":     "next build"    // Production build (runs on Vercel deploy)
"start":     "next start"    // Serve production build locally
"lint":      "next lint"     // ESLint check
"typecheck": "tsc --noEmit"  // TypeScript type check without emitting files
```

---

## Deployment (Vercel)

### Configuration (`vercel.json`)
```json
{
  "crons": [
    { "path": "/api/cron/publish",   "schedule": "30 2 * * *" },
    { "path": "/api/cron/analytics", "schedule": "0 1 * * *"  }
  ]
}
```

### Deploy steps
1. Push to `main` branch → Vercel auto-deploys
2. Required Vercel environment variables: all `.env.local` values (production values)
3. `NEXT_PUBLIC_APP_URL` must be set to the actual Vercel/custom domain
4. Cron jobs require **Vercel Pro plan** ($20/month)

### Build settings (Vercel defaults)
- Build command: `npm run build`
- Output directory: `.next`
- Node.js version: 18.x or 20.x

### Custom domain
Target: `app.coachsharath.com`. DNS configured via Vercel dashboard.

---

## Code Style and Conventions

### TypeScript
- Strict mode enabled (`tsconfig.json`)
- No `any` without `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment
- All Supabase query results typed against `lib/supabase/types.ts`
- `PostDay`, `PostPillar`, `PostFormat`, `PostStatus`, `NarrativePosition`, `RuleCategory` are string union types in `types.ts`

### API Routes
- All routes: `export const runtime = 'nodejs'` at the top
- Long-running routes (generate): `export const maxDuration = 60`
- Auth check pattern:
  ```typescript
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  ```
- Error responses always include a human-readable `error` string

### Supabase
- Use `createClient()` from `lib/supabase/server.ts` for all user-facing routes
- Use `createServiceClient()` only in Cron routes
- RLS policies must be set for all tables — no bypassing except in Cron
- Never use `.single()` without handling the error case

### Anthropic / LLM
- **Always use:** `MODEL` constant from `lib/anthropic/client.ts`
- **Never hardcode** the model string anywhere else
- Generation metadata extracted by `parseGenerationMetadata()` — parses `WORD_COUNT:`, `CORE_INSIGHT:`, `CALLBACK_USED:`, `THREAD_PLANTED:`, `REFERENCES:`, `HASHTAGS:` from end of generated text. Returns `referencesUsed` (not `references`) in its shape.
- Word counts are **always computed programmatically** via `countWords()` — never trust LLM-reported counts. `countWords` is exported from both `lib/anthropic/client.ts` (used by route files) and `lib/utils/helpers.ts` (used by UI components).
- All prompts live in `lib/anthropic/prompts.ts` (or `saturday-prompt.ts` for Saturday). Never put prompt text in route files.

### LinkedIn API
- **Use `/rest/posts`** — not the deprecated `/v2/ugcPosts`
- Always include `LinkedIn-Version: 202604` and `X-Restli-Protocol-Version: 2.0.0` headers
- Character limit: 3000 chars for personal profiles
- The `resolvePublishText()` function in `publish/route.ts` handles all truncation logic
- Post ID is extracted from the `Location` response header

### Naming
- Files: `kebab-case.ts`
- Components: `PascalCase.tsx`
- Functions: `camelCase`
- Database columns: `snake_case`
- TypeScript types/interfaces: `PascalCase`

### Git
- Branch: `main` (single branch — solo project)

---

## Content Engine Logic (Critical Context)

### The Weekly Calendar
| Day | Format | Pillar | Audience | Word Count |
|-----|--------|--------|----------|------------|
| Monday | Long-form article | Coaching Transformation (P3) | Category B | 900–1100 |
| Tuesday | Text post | Wealth Management (P4A) | 5-Swans HNI | 180–250 |
| Wednesday | Long-form article | Vedic-Leadership (P1) or Banker-Coach (P2) | Category A/B | 900–1100 |
| Thursday | Carousel | Vedic-Leadership (P1) or Inner Work (P5) | Category A/B | 8–10 slides |
| Friday | Text post | Financial Wellness (P4B) | Bradford/Cat C | 180–250 |
| Saturday | Market insights | Financial Intelligence (P4C) | 5-Swans + general | 180–250 |

### Long-form Publishing Flow (Monday/Wednesday)
1. Generate full article (900–1100 words, ~5000–7000 chars)
2. After stream closes: fire async second Anthropic call (`max_tokens: 1024`) generating `linkedin_excerpt` (1800–2700 chars)
3. `linkedin_excerpt` saved to `drafts.linkedin_excerpt` (added by migration 003)
4. On publish: excerpt posted to LinkedIn; full article stays in editor for copy-paste to website

### Saturday Special Flow
Saturday posts have `status = 'awaiting_market_data'` after week planning. On Saturday morning, Sharath opens the `SaturdayInsightsModal` (banner shown on the Forward Plan dashboard), inputs current Nifty/Sensex data, which is passed as `marketContext` to `/api/generate`. Uses `buildSaturdayMarketInsightsPrompt()`.

### Voice Learning Loop
1. Sharath generates a draft
2. Sharath edits the draft in the inline editor (auto-saved via `/api/drafts/save` every ~800ms)
3. When ready, Sharath clicks Approve → `POST /api/learn` runs:
   - Extracts story log metadata and upserts to `story_log`
   - Updates `weeks.open_thread`
   - Sets `posts.status = 'approved'`
   - If content changed: runs diff via `buildEditDiffPrompt()`, returns `candidateRules`
4. `CandidateRulesModal` shows candidate rules for Sharath to review
5. Approved rules saved via `POST /api/rules/candidates`
6. Active rules injected into every subsequent generation via `buildVoiceRulesBlock()`

### Narrative Continuity
Every generation call receives a `NARRATIVE CONTEXT PACKET` built from:
- `story_log` — previous post's `core_insight`, `thread_planted`, `referencesUsed`
- `weeks.open_thread` — forward seed carried from the previous week
- `narrativePosition` — where this post sits in the week's narrative arc

This creates a serialised "book-like" content stream across 52 weeks.

### Planning Session Flow
The `PlanningSessionModal` component drives the full Sunday planning session:
1. Fetches 2 (or 3, if week 1 Mon–Fri all approved) forward weeks via `GET /api/plan`
2. For each unplanned week: calls `POST /api/plan { action: 'propose_themes', ... }` → 5 theme options
3. Sharath selects a theme → calls `POST /api/plan { action: 'generate_plan', weekId, theme }` → 6-slot plan
4. Plan saved, posts upserted, week confirmed

---

## Current Project Status

| Feature | Status |
|---------|--------|
| Database schema | ✅ Complete |
| Authentication (magic link) | ✅ Complete |
| Anthropic generation (streaming) | ✅ Complete |
| Prompts / voice engine | ✅ Complete |
| LinkedIn publishing (`/rest/posts`) | ✅ Complete |
| LinkedIn excerpt generation | ✅ Complete |
| Draft editor with versioning | ✅ Complete |
| Voice rule learning (edit diff + candidate review) | ✅ Complete |
| Week planning / theme proposal | ✅ Complete |
| Story arc timeline (52-week view) | ✅ Complete (wired to real data via `/api/arc`) |
| Saturday market insights flow | ✅ Complete (`SaturdayInsightsModal`) |
| Forward Plan dashboard | ✅ Complete (wired to real data via `/api/plan`) |
| Voice Rules Library UI | ✅ Complete (wired to real data via `/api/rules`) |
| Analytics dashboard UI | ✅ Complete (wired to real data via `/api/analytics`) |
| Calendar view | ✅ Complete (`/dashboard/calendar` via `/api/calendar`) |
| System settings page | ✅ Complete (system_settings table + `/api/settings`) |
| Scheduled publishing (Vercel Cron) | ✅ Configured (runs 2:30 AM UTC) |
| LinkedIn analytics polling (cron) | ⚠️ Configured; requires `LINKEDIN_SERVICE_TOKEN` env var to activate |
| Multi-business LinkedIn (Company Pages) | ❌ Not started |
| Book/manuscript export (Phase 4) | ❌ Not started |

---

## Known Issues and Technical Debt

1. **`LINKEDIN_SERVICE_TOKEN` not configured** — The analytics cron (`/api/cron/analytics`) requires a service-level LinkedIn access token stored as `LINKEDIN_SERVICE_TOKEN` env var. Without it, the cron logs a warning and exits without fetching data. The user-level OAuth token stored in `linkedin_tokens` is not used here (no live session in cron context).
2. **`system_settings` table not in migrations** — This table is queried by `/api/settings` but its `CREATE TABLE` statement is not in any of the three migration files. Must be created and seeded manually.
3. **LinkedIn Article API unavailable** — Long-form content cannot be published as LinkedIn native articles via API. The current approach (excerpt + full article in editor) is the correct workaround.
4. **No test suite** — Zero automated tests. All validation is manual.
5. **Vercel Pro required** — Cron jobs only work on Vercel Pro.
6. **Token refresh** — LinkedIn tokens expire in ~60 days. There is expiry checking but no automatic refresh. Sharath must reconnect LinkedIn in Settings when the token expires.
7. **`saturday-prompt.ts` separation** — Saturday market insights prompt lives in a separate file. Consider consolidating into `prompts.ts` in a future refactor once the pattern is stable.
8. **Spurious `.DS_Store`-adjacent paths in file tree** — Some shell glob expansion artifacts exist in the repo root (paths starting with `{supabase/migrations,...}`). These are benign but should be cleaned up.

---

## Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — never expose to client, never log it
- `ANTHROPIC_API_KEY` is server-only — never prefix with `NEXT_PUBLIC_`
- `LINKEDIN_CLIENT_SECRET` is server-only
- `CRON_SECRET` must be set in Vercel environment variables for cron authentication to work
- All `/api/*` routes check Supabase session before processing
- Cron routes check `Authorization: Bearer ${CRON_SECRET}` header
- `/api/publish` additionally accepts `x-cron-secret` header (set by the cron route when it calls publish)
