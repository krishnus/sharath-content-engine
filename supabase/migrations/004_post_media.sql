-- Migration 004: post_media table for PDF and image attachments
-- Run this after 003_drafts_linkedin_excerpt.sql
--
-- STORAGE SETUP (do this manually in Supabase Dashboard → Storage):
--   1. Create a new bucket named: post-media
--   2. Set it to PRIVATE (not public)
--   3. Add RLS policy: authenticated users can upload/download their own files

CREATE TABLE IF NOT EXISTS post_media (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id          uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_type       text NOT NULL CHECK (media_type IN ('article_pdf', 'carousel_pdf', 'quote_png')),
  storage_path     text NOT NULL,    -- path within the post-media bucket
  file_name        text NOT NULL,
  file_size        int,
  page_count       int,              -- for PDFs only
  linkedin_caption text,             -- AI-drafted caption to use as post text on LinkedIn
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Only one media entry per type per post
CREATE UNIQUE INDEX IF NOT EXISTS post_media_post_type
  ON post_media (post_id, media_type);

ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage post_media"
  ON post_media FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
