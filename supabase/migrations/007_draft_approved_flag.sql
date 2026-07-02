-- Add is_approved flag to drafts.
-- When multiple versions exist, this marks which one Sharath explicitly chose at approval time.
-- Only one non-original draft per post should have is_approved = true at a time.
ALTER TABLE public.drafts
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;
