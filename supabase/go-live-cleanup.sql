-- ============================================================
-- SCE GO-LIVE CLEANUP SCRIPT
-- Run once in Supabase SQL Editor before go-live (July 6, 2026)
--
-- PRESERVES: voice_rules, linkedin_tokens, system_settings, annual_arcs row
-- CLEARS:    weeks → posts → drafts, story_log, linkedin_posts,
--            performance_data, post_media  (all cascade from weeks)
--
-- MANUAL STEP AFTER RUNNING:
--   Supabase Dashboard → Storage → post-media → delete all objects
--   (DB records cascade-delete; storage files require manual cleanup)
-- ============================================================

-- Step 1: Delete all content (cascade handles the full hierarchy)
DELETE FROM weeks;

-- Step 2: Reset arc narrative state so test-period threads and references
--         don't bleed into the live arc's continuity memory.
UPDATE annual_arcs
SET
  arc_state  = '{"open_threads":[],"used_references":[],"chapter_summaries":{}}'::jsonb,
  updated_at = now()
WHERE year = 2026;

-- Step 3: Configure system_settings for July 6, 2026 go-live.
UPDATE system_settings SET value = '2026-05-12', updated_at = now() WHERE key = 'inception_date';
UPDATE system_settings SET value = '8',          updated_at = now() WHERE key = 'training_period_weeks';
UPDATE system_settings SET value = '2026-07-06', updated_at = now() WHERE key = 'live_date';

-- Arc themes (arc-relative quarters, NOT calendar quarters):
--   Q1: Jul  6 – Oct  4, 2026  →  The Awakening
--   Q2: Oct  5 – Jan  3, 2027  →  The Turning
--   Q3: Jan  4 – Apr  4, 2027  →  The Becoming
--   Q4: Apr  5 – Jun 27, 2027  →  The Integration
UPDATE system_settings SET value = 'The Awakening — Recognition, discomfort, honest questioning',   updated_at = now() WHERE key = 'arc_q1_theme';
UPDATE system_settings SET value = 'The Turning — Decision, courage, the moment of change',         updated_at = now() WHERE key = 'arc_q2_theme';
UPDATE system_settings SET value = 'The Becoming — Identity shift, new strengths, unexpected losses', updated_at = now() WHERE key = 'arc_q3_theme';
UPDATE system_settings SET value = 'The Integration — Wisdom, legacy, what the whole journey means', updated_at = now() WHERE key = 'arc_q4_theme';

-- Step 4: Sync the same themes into annual_arcs (both stores must match
--         because the arc timeline page reads from annual_arcs directly).
UPDATE annual_arcs
SET
  q1_theme   = 'The Awakening — Recognition, discomfort, honest questioning',
  q2_theme   = 'The Turning — Decision, courage, the moment of change',
  q3_theme   = 'The Becoming — Identity shift, new strengths, unexpected losses',
  q4_theme   = 'The Integration — Wisdom, legacy, what the whole journey means',
  updated_at = now()
WHERE year = 2026;

-- Step 5: Ensure posts.hashtags column exists (migration 005).
--         Safe to run even if already applied.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hashtags text[] NOT NULL DEFAULT '{}';

-- ============================================================
-- VERIFICATION — run this block after the above to confirm
-- ============================================================
SELECT
  (SELECT COUNT(*) FROM weeks)                        AS weeks_remaining,         -- expect 0
  (SELECT COUNT(*) FROM posts)                        AS posts_remaining,         -- expect 0
  (SELECT COUNT(*) FROM drafts)                       AS drafts_remaining,        -- expect 0
  (SELECT COUNT(*) FROM story_log)                    AS story_log_remaining,     -- expect 0
  (SELECT COUNT(*) FROM linkedin_posts)               AS linkedin_posts_remaining,-- expect 0
  (SELECT COUNT(*) FROM performance_data)             AS perf_data_remaining,     -- expect 0
  (SELECT COUNT(*) FROM voice_rules)                  AS voice_rules_kept,        -- expect > 0
  (SELECT COUNT(*) FROM voice_rules WHERE active)     AS active_rules,            -- expect > 0
  (SELECT COUNT(*) FROM linkedin_tokens)              AS linkedin_tokens_kept;    -- expect 1

-- Confirm settings look right
SELECT key, value FROM system_settings ORDER BY key;

-- Confirm arc themes
SELECT year, q1_theme, q2_theme, q3_theme, q4_theme, arc_state FROM annual_arcs;
