-- ============================================================
-- SHARATH CONTENT ENGINE — Initial Schema
-- Run this in Supabase SQL Editor (or via supabase db push)
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- ANNUAL ARCS
-- One row per year. Stores quarterly arc themes + narrative state.
-- ============================================================
create table annual_arcs (
  id          uuid primary key default gen_random_uuid(),
  year        int not null unique,
  q1_theme    text not null default 'The Awakening',
  q2_theme    text not null default 'The Turning',
  q3_theme    text not null default 'The Becoming',
  q4_theme    text not null default 'The Integration',
  arc_state   jsonb not null default '{
    "open_threads": [],
    "used_references": [],
    "chapter_summaries": {}
  }'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- WEEKS
-- One row per planned week. Two weeks planned per Sunday session.
-- ============================================================
create table weeks (
  id           uuid primary key default gen_random_uuid(),
  arc_id       uuid not null references annual_arcs(id) on delete cascade,
  year         int not null,
  week_number  int not null,
  week_start   date not null,
  theme        text,
  quarter      text check (quarter in ('Q1','Q2','Q3','Q4')),
  open_thread  text,
  plan         jsonb not null default '[]'::jsonb,
  status       text not null default 'draft' check (status in ('draft','confirmed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(year, week_number)
);

-- ============================================================
-- POSTS
-- One row per post slot. The structural record for a piece of content.
-- ============================================================
create type post_day    as enum ('monday','tuesday','wednesday','thursday','friday','saturday');
create type post_pillar as enum ('vedic_leadership','banker_coach','coaching_transformation','financial_intelligence','inner_work');
create type post_format as enum ('long_form_article','text_post','carousel','market_insights');
create type post_status as enum ('awaiting_market_data','draft','edited','approved','scheduled','published','publish_failed');
create type narrative_position as enum ('chapter_opening','chapter_deepening','complication','resolution','bridge');

create table posts (
  id                   uuid primary key default gen_random_uuid(),
  week_id              uuid not null references weeks(id) on delete cascade,
  day                  post_day not null,
  pillar               post_pillar not null,
  format               post_format not null,
  status               post_status not null default 'draft',
  narrative_position   narrative_position,
  target_audience      text,
  target_word_count    int,
  hook_idea            text,
  scheduled_at         timestamptz,
  approved_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique(week_id, day)
);

-- ============================================================
-- DRAFTS
-- One row per version. is_original=true is immutable.
-- ============================================================
create table drafts (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references posts(id) on delete cascade,
  version      int not null default 1,
  content      text not null default '',
  word_count   int not null default 0,
  is_original  bool not null default false,
  created_at   timestamptz not null default now(),
  unique(post_id, version)
);

-- ============================================================
-- STORY LOG
-- Narrative metadata per approved post. The engine's memory.
-- Written automatically when a post is approved.
-- ============================================================
create table story_log (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null unique references posts(id) on delete cascade,
  core_insight     text,
  callback_used    text,
  thread_planted   text,
  references_used  jsonb not null default '{"vedic":[],"banking":[],"coaching":[]}'::jsonb,
  created_at       timestamptz not null default now()
);

-- ============================================================
-- VOICE RULES
-- AI-extracted, Sharath-approved voice rules.
-- Fed into every generation prompt.
-- ============================================================
create type rule_category as enum (
  'avoid_phrase',
  'prefer_phrase',
  'structural_pattern',
  'cta_adjustment',
  'tone_calibration',
  'opening_style',
  'closing_style'
);

create table voice_rules (
  id              uuid primary key default gen_random_uuid(),
  category        rule_category not null,
  rule_text       text not null,
  example_before  text,
  example_after   text,
  source_post_id  uuid references posts(id) on delete set null,
  active          bool not null default true,
  approved_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- ============================================================
-- LINKEDIN POSTS
-- One row per successfully published post.
-- ============================================================
create table linkedin_posts (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null unique references posts(id) on delete cascade,
  linkedin_post_id text not null,
  linkedin_url     text,
  published_at     timestamptz not null default now()
);

-- ============================================================
-- PERFORMANCE DATA
-- Time-series analytics per published post.
-- New row written on each analytics poll.
-- ============================================================
create table performance_data (
  id                uuid primary key default gen_random_uuid(),
  linkedin_post_id  uuid not null references linkedin_posts(id) on delete cascade,
  impressions       int not null default 0,
  likes             int not null default 0,
  comments          int not null default 0,
  shares            int not null default 0,
  clicks            int not null default 0,
  fetched_at        timestamptz not null default now()
);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- Auto-update updated_at timestamps on row changes.
-- ============================================================
create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at_annual_arcs
  before update on annual_arcs
  for each row execute function handle_updated_at();

create trigger set_updated_at_weeks
  before update on weeks
  for each row execute function handle_updated_at();

create trigger set_updated_at_posts
  before update on posts
  for each row execute function handle_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_weeks_year_week     on weeks(year, week_number);
create index idx_posts_week_id       on posts(week_id);
create index idx_posts_status        on posts(status);
create index idx_posts_scheduled_at  on posts(scheduled_at) where status = 'approved';
create index idx_drafts_post_id      on drafts(post_id);
create index idx_story_log_post_id   on story_log(post_id);
create index idx_voice_rules_active  on voice_rules(active) where active = true;
create index idx_performance_li_post on performance_data(linkedin_post_id, fetched_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- All data is private to the authenticated user (Sharath).
-- ============================================================
alter table annual_arcs     enable row level security;
alter table weeks            enable row level security;
alter table posts            enable row level security;
alter table drafts           enable row level security;
alter table story_log        enable row level security;
alter table voice_rules      enable row level security;
alter table linkedin_posts   enable row level security;
alter table performance_data enable row level security;

-- Policy: authenticated users can read/write their own data
-- Since this is a single-user app, we allow all authenticated operations.
-- If multi-user is added later, add user_id columns and update these policies.
create policy "Authenticated access" on annual_arcs     for all using (auth.role() = 'authenticated');
create policy "Authenticated access" on weeks            for all using (auth.role() = 'authenticated');
create policy "Authenticated access" on posts            for all using (auth.role() = 'authenticated');
create policy "Authenticated access" on drafts           for all using (auth.role() = 'authenticated');
create policy "Authenticated access" on story_log        for all using (auth.role() = 'authenticated');
create policy "Authenticated access" on voice_rules      for all using (auth.role() = 'authenticated');
create policy "Authenticated access" on linkedin_posts   for all using (auth.role() = 'authenticated');
create policy "Authenticated access" on performance_data for all using (auth.role() = 'authenticated');

-- ============================================================
-- SEED: CURRENT YEAR ARC
-- Inserts the 2026 annual arc with Q2 as the starting quarter.
-- ============================================================
insert into annual_arcs (year, q1_theme, q2_theme, q3_theme, q4_theme)
values (
  2026,
  'The Awakening — Recognition, discomfort, honest questioning',
  'The Turning — Decision, courage, the moment of change',
  'The Becoming — Identity shift, new strengths, unexpected losses',
  'The Integration — Wisdom, legacy, what the whole journey means'
) on conflict (year) do nothing;
