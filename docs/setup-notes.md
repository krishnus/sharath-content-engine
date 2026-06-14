# Setup Notes

Complete record of every setup step performed to get the Sharath Content Engine running.

---

## 1. Project Initialisation

```bash
# Created with Next.js 14 App Router, TypeScript, Tailwind
npx create-next-app@latest sharath-content-engine \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*"

cd sharath-content-engine
```

### Core dependencies installed
```bash
# Supabase
npm install @supabase/supabase-js @supabase/ssr

# Anthropic
npm install @anthropic-ai/sdk

# UI (shadcn/ui setup)
npx shadcn-ui@latest init
# Selected: Default style, Slate base colour, CSS variables

# Utilities
npm install clsx tailwind-merge  # for cn() helper
```

---

## 2. Supabase Setup

### Project creation
1. Go to [supabase.com](https://supabase.com) → New project
2. Project name: `sharath-content-engine`
3. Database password: stored securely (not in repo)
4. Region: `Southeast Asia (Singapore)` — chosen for proximity to India/UAE users
5. Plan: Free tier (sufficient for single-user app)

### Keys to copy (from Settings → API)
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### Running migrations
In Supabase dashboard → **SQL Editor**, run in order:

```sql
-- 1. Initial schema (all core tables, enums, RLS, indexes, 2026 annual arc seed)
-- Copy/paste contents of: supabase/migrations/001_initial_schema.sql

-- 2. LinkedIn token storage
-- Copy/paste contents of: supabase/migrations/002_linkedin_tokens.sql

-- 3. LinkedIn excerpt column on drafts table
-- Copy/paste contents of: supabase/migrations/003_drafts_linkedin_excerpt.sql
```

Then create the `system_settings` table manually:
```sql
CREATE TABLE system_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access" ON system_settings FOR ALL USING (auth.role() = 'authenticated');

-- Seed initial values
INSERT INTO system_settings (key, value) VALUES
  ('inception_date',         '2026-01-01'),
  ('training_period_weeks',  '8'),
  ('live_date',              '2026-03-01'),
  ('arc_q1_theme',           'The Awakening — Recognition, discomfort, honest questioning'),
  ('arc_q2_theme',           'The Turning — Decision, courage, the moment of change'),
  ('arc_q3_theme',           'The Becoming — Identity shift, new strengths, unexpected losses'),
  ('arc_q4_theme',           'The Integration — Wisdom, legacy, what the whole journey means')
ON CONFLICT (key) DO NOTHING;
```

### Row Level Security
RLS is enabled on all tables. The policies ensure:
- Authenticated users can only see their own data
- Service role (Cron) can read/write all rows

### Authentication setup
In Supabase dashboard → **Authentication → Providers**:
1. **Email** provider: enabled, magic link mode (no passwords)
2. **Site URL**: set to production domain (`https://app.coachsharath.com`) or Vercel URL
3. **Redirect URLs** (add both):
   - `http://localhost:3000/auth/callback`
   - `https://app.coachsharath.com/auth/callback`
   - `https://sharath-content-engine.vercel.app/auth/callback`

### Creating the Supabase client files
`lib/supabase/server.ts` exports two clients:
- `createClient()` — uses `@supabase/ssr` `createServerClient()`, reads cookies from Next.js headers
- `createServiceClient()` — uses `SUPABASE_SERVICE_ROLE_KEY`, for Cron routes only

`lib/supabase/client.ts` exports:
- `createClient()` — for client-side components; wraps `createBrowserClient` from `@supabase/ssr`

---

## 3. LinkedIn Developer Setup

### Creating the LinkedIn App
1. Go to [LinkedIn Developer Portal](https://developer.linkedin.com/apps)
2. Create new app:
   - App name: `Sharath Content Engine`
   - LinkedIn Page: Link to Sharath's personal LinkedIn page
   - App logo: Upload Coach Sharath logo
3. Under **Products** tab, request access to:
   - **Share on LinkedIn** (for posting)
   - **Sign In with LinkedIn using OpenID Connect** (for auth)
4. Under **Auth** tab → **OAuth 2.0 settings**:
   - Add redirect URLs:
     - `http://localhost:3000/auth/callback`
     - `https://app.coachsharath.com/auth/callback`
     - `https://sharath-content-engine.vercel.app/auth/callback`
5. Copy **Client ID** → `LINKEDIN_CLIENT_ID`
6. Generate and copy **Client Secret** → `LINKEDIN_CLIENT_SECRET`

### LinkedIn API version
Using `/rest/posts` endpoint (current API). The deprecated `/v2/ugcPosts` was removed after encountering 400 errors from its 4000-character limit on long-form content.

**Required OAuth scopes:** `openid`, `profile`, `email`, `w_member_social`

### Token storage
LinkedIn OAuth tokens are stored in the `linkedin_tokens` Supabase table. The token flow:
1. User clicks "Connect LinkedIn" in Settings
2. OAuth redirect to LinkedIn → callback to `/auth/callback`
3. Exchange code for token → store in `linkedin_tokens`

---

## 4. Anthropic API Setup

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create new API key
3. Copy to `ANTHROPIC_API_KEY` in `.env.local`
4. Model: controlled by `ANTHROPIC_MODEL` env var; defaults to `claude-sonnet-4-5-20250929` if not set. Defined as `MODEL` constant in `lib/anthropic/client.ts`.
5. `MAX_TOKENS` constant = **2048** (used for main generation). Excerpt generation hardcodes `max_tokens: 1024` directly in `generateAndSaveExcerpt()`.

---

## 5. Vercel Deployment

### Initial deploy
```bash
# Push to GitHub first
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/krishnus/sharath-content-engine.git
git push -u origin main
```

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import `krishnus/sharath-content-engine` from GitHub
3. Framework preset: **Next.js** (auto-detected)
4. Add all environment variables (production values):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `LINKEDIN_CLIENT_ID`
   - `LINKEDIN_CLIENT_SECRET`
   - `LINKEDIN_REDIRECT_URI` (set to production URL)
   - `NEXT_PUBLIC_APP_URL` (set to Vercel URL or custom domain)
   - `CRON_SECRET` (generate a random string, e.g. `openssl rand -hex 32`)
5. Deploy

### Cron job activation
`vercel.json` configures cron jobs. These only execute on **Vercel Pro plan**.
```json
{
  "crons": [
    { "path": "/api/cron/publish",   "schedule": "30 2 * * *" },
    { "path": "/api/cron/analytics", "schedule": "0 1 * * *"  }
  ]
}
```
- Publish cron: 2:30 AM UTC daily
- Analytics cron: 1:00 AM UTC daily

Vercel automatically adds the `CRON_SECRET` to the `Authorization: Bearer` header when invoking these routes. The cron routes check `req.headers.get('authorization') === \`Bearer ${process.env.CRON_SECRET}\``.

### Custom domain (planned)
Target: `app.coachsharath.com`
1. Vercel project → Settings → Domains → Add `app.coachsharath.com`
2. Add DNS records as instructed by Vercel
3. Update `NEXT_PUBLIC_APP_URL` and `LINKEDIN_REDIRECT_URI` env vars
4. Update Supabase auth redirect URLs
5. Update LinkedIn app redirect URLs

---

## 6. Environment Configuration

### `.env.example` (committed to repo)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

ANTHROPIC_API_KEY=

LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=

NEXT_PUBLIC_APP_URL=
CRON_SECRET=
```

### `.env.local` (gitignored, local development only)
Fill in all values from their respective services.

---

## 7. Tailwind Brand Tokens

`tailwind.config.js` defines the brand design system:
- **Navy palette** — primary brand colour (deep navy, inspired by Coach Sharath's brand)
- **Gold palette** — accent colour (premium feel, used for CTAs and highlights)
- Custom font configuration

The `cn()` utility in `lib/utils/helpers.ts` combines `clsx` + `tailwind-merge` for conditional class application.

---

## 8. Middleware Setup

`middleware.ts` at project root:
- Uses `@supabase/ssr` to read the session from cookies
- Protects all `/dashboard/*` routes
- Redirects unauthenticated requests to `/auth/login`
- Passes through `/auth/*`, `/api/*`, and public assets

---

## 9. Git Repository

- Remote: `https://github.com/krishnus/sharath-content-engine` (public)
- Single branch: `main`
- No Git hooks configured (no Husky, no pre-commit linting)
- `.gitignore` includes: `.env.local`, `.env*.local`, `.next/`, `node_modules/`
- 15 commits as of initial documentation
