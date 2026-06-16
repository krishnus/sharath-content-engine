-- Migration 004: post_media table for PDF and image attachments
-- Run this after 003_drafts_linkedin_excerpt.sql
--
-- STORAGE SETUP:
--   1. Create a new bucket named: post-media (Dashboard → Storage → New Bucket, set Private)
--   2. Run the storage policy below (storage.objects is not covered by table migrations)

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

-- Storage bucket policy (run this after creating the post-media bucket)
-- This must be run separately as storage.objects is managed by Supabase Storage
CREATE POLICY "Authenticated users can manage post-media files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'post-media')
  WITH CHECK (bucket_id = 'post-media');
