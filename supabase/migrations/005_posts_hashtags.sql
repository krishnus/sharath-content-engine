-- Migration 004: Add hashtags column to posts table
-- Stores AI-generated hashtags as a text array, updated on every generation
-- (first draft and regeneration). Consumed by the draft editor for display
-- and by the publish route for appending to LinkedIn posts.

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS hashtags text[] NOT NULL DEFAULT '{}';
