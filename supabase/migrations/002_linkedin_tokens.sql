-- ============================================================
-- MIGRATION 002: LinkedIn token storage
-- Run in Supabase SQL Editor after 001_initial_schema.sql
-- ============================================================

-- Stores the LinkedIn OAuth access + refresh tokens so the
-- cron publisher can post without a live user session.
-- One row per user (upserted on every OAuth callback).
create table if not exists linkedin_tokens (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  access_token   text not null,
  refresh_token  text,
  expires_at     timestamptz not null,
  linkedin_id    text,          -- LinkedIn member URN sub (e.g. "ACoAA...")
  display_name   text,
  connected_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint linkedin_tokens_user_id_key unique (user_id)
);

alter table linkedin_tokens enable row level security;
create policy "Users manage own token" on linkedin_tokens
  for all using (auth.uid() = user_id);

-- Allow service role full access (for cron jobs)
create policy "Service role full access" on linkedin_tokens
  for all using (true)
  with check (true);
