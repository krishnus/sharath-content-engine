-- Migration: 002_drafts_linkedin_excerpt.sql
-- Adds the linkedin_excerpt column to the drafts table.
-- This stores the AI-crafted ≤2,900-char feed post excerpt for Monday/Wednesday
-- long-form articles, used by the publish route instead of truncating the full content.

ALTER TABLE drafts
  ADD COLUMN IF NOT EXISTS linkedin_excerpt TEXT DEFAULT NULL;

COMMENT ON COLUMN drafts.linkedin_excerpt IS
  'AI-generated LinkedIn feed post excerpt (≤2,900 chars) for long-form articles (Mon/Wed). '
  'NULL for text posts, carousels, and market insights posts. '
  'Used by the publish route to post within the /rest/posts 3,000-char limit.';
