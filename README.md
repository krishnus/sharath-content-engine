# Sharath Content Engine

AI-powered content creation and management system for Coach Sharath Kumar R N.

**Stack:** Next.js 14 · Supabase (PostgreSQL) · Anthropic API · LinkedIn API · Vercel

---

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd sharath-content-engine
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. In the Supabase dashboard, go to **SQL Editor**
3. Run the migration file: `supabase/migrations/001_initial_schema.sql`
4. Go to **Settings → API** and copy your Project URL and anon/service role keys

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

ANTHROPIC_API_KEY=sk-ant-...

LINKEDIN_CLIENT_ID=your-client-id
LINKEDIN_CLIENT_SECRET=your-client-secret
LINKEDIN_REDIRECT_URI=http://localhost:3000/auth/callback

NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=any-random-string-for-local-dev
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to login.

---

## Authentication Setup

SCE uses **Supabase magic link** authentication (no password needed).

1. In Supabase dashboard → **Authentication → Providers**
2. Enable **Email** provider
3. Set Site URL to your domain (e.g., `https://app.coachsharath.com`)
4. Add redirect URLs:
   - `http://localhost:3000/auth/callback` (local dev)
   - `https://app.coachsharath.com/auth/callback` (production)

---

## LinkedIn Setup (Phase 3)

1. Go to [LinkedIn Developer Portal](https://developer.linkedin.com/)
2. Create a new app
3. Under **Products**, add:
   - **Sign In with LinkedIn using OpenID Connect**
   - **Share on LinkedIn**
4. Add OAuth 2.0 redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://app.coachsharath.com/auth/callback`
5. Copy Client ID and Client Secret to `.env.local`
6. In Supabase dashboard → **Authentication → Providers → LinkedIn (OIDC)**
7. Enter Client ID, Client Secret, and enable the provider

---

## Deployment (Vercel)

### First deploy

1. Push to GitHub
2. Import repository in [Vercel](https://vercel.com)
3. Add all environment variables from `.env.local` (use production values)
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel domain or custom domain
5. Deploy

### Vercel Cron setup

Cron jobs require **Vercel Pro** ($20/month). The `vercel.json` already configures:

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/publish` | Every minute | Publishes scheduled posts |
| `/api/cron/analytics` | Daily 6 AM UTC | Fetches LinkedIn analytics |

To authenticate Cron requests, Vercel automatically sends the `CRON_SECRET` in the `Authorization` header. Set this in Vercel's environment variables.

### Custom domain

1. In Vercel → your project → **Settings → Domains**
2. Add `app.coachsharath.com`
3. Follow DNS configuration instructions
4. Update `NEXT_PUBLIC_APP_URL` and LinkedIn OAuth redirect URIs

---

## Project Structure

```
sharath-content-engine/
├── app/
│   ├── api/
│   │   ├── generate/       # Content generation (Anthropic API)
│   │   ├── learn/          # Edit diff → voice rules extraction
│   │   ├── plan/           # Theme proposal + week plan generation
│   │   ├── publish/        # LinkedIn publishing
│   │   ├── drafts/save/    # Auto-save draft edits
│   │   └── cron/
│   │       ├── publish/    # Scheduled post publisher (Vercel Cron)
│   │       └── analytics/  # LinkedIn analytics poller (Vercel Cron)
│   ├── auth/
│   │   ├── login/          # Magic link login
│   │   └── callback/       # Supabase OAuth callback
│   └── dashboard/
│       ├── page.tsx         # Forward Plan (Sunday session view)
│       ├── layout.tsx       # Sidebar navigation
│       ├── drafts/[postId]/ # Inline draft editor
│       ├── arc/             # 52-week story arc timeline
│       ├── rules/           # Voice Rules Library
│       ├── analytics/       # Performance dashboard
│       └── settings/        # LinkedIn + account settings
├── lib/
│   ├── anthropic/
│   │   ├── client.ts       # Anthropic SDK wrapper
│   │   └── prompts.ts      # All generation prompts (the engine's brain)
│   ├── supabase/
│   │   ├── client.ts       # Browser client
│   │   ├── server.ts       # Server + service role clients
│   │   └── types.ts        # Full TypeScript types mirroring DB schema
│   └── utils/
│       └── helpers.ts      # cn(), countWords(), date helpers, labels
├── middleware.ts            # Auth protection for /dashboard routes
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── tailwind.config.js       # Brand design tokens
├── vercel.json              # Cron job configuration
└── .env.example             # Environment variable template
```

---

## Development Notes

### Mock data
All dashboard pages currently use mock data (clearly marked with `// Mock data — replace with Supabase query`). Wire up real Supabase queries for each page as Phase 1 progresses.

### Content generation
The `lib/anthropic/prompts.ts` file contains the full Sharath Content Engine playbook as a system prompt. This is the most important file in the codebase — any changes to Sharath's voice or content rules should be made here.

### Voice rules
Voice rules are stored in the `voice_rules` Supabase table and fetched fresh on every generation API call. No caching — this ensures the most recently approved rules are always used.

### Word count
Word counts are **always computed programmatically** using `countWords()` in `lib/anthropic/client.ts`. Never trust word counts reported by the LLM.

### Streaming
Draft generation uses Server-Sent Events streaming — the `stream: true` flag in the generate API call returns a `ReadableStream`. The editor renders content as it arrives, character by character.

---

## Phase Roadmap

| Phase | Status | Description |
|---|---|---|
| Phase 1 — MVP | 🚧 In Progress | Theme + Draft + Edit |
| Phase 2 — Learning | ⏳ Planned | Edit diff → voice rules |
| Phase 3 — Publish & Track | ⏳ Planned | LinkedIn + analytics |
| Phase 4 — Book Export | 🔮 Future | Manuscript from 52 weeks |

---

## Key Open Questions

See PRD Section 13 for full details. Critical before proceeding:

- [ ] **Vercel Pro plan** — confirm for Cron job support before Phase 3
- [ ] **Custom domain** — needed before LinkedIn OAuth redirect URIs can be finalised
- [ ] **Multi-business LinkedIn** — personal profile vs. Company Pages for 5-Swans / Bradford
