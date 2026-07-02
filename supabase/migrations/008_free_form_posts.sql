-- Free-form (ad-hoc) post creator — standalone posts outside the 52-week arc.
-- Four new tables mirror the existing posts/drafts/media/linkedin_posts chain.

CREATE TABLE public.free_form_posts (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_prompt  text NOT NULL,
  format       post_format NOT NULL DEFAULT 'text_post',
  pillar       post_pillar,                        -- nullable; optional framing choice
  status       post_status NOT NULL DEFAULT 'draft',
  hashtags     text[] NOT NULL DEFAULT '{}',
  scheduled_at timestamptz,
  approved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.free_form_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users full access" ON public.free_form_posts
  FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE public.free_form_drafts (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id          uuid NOT NULL REFERENCES free_form_posts(id) ON DELETE CASCADE,
  version          int NOT NULL DEFAULT 1,
  content          text NOT NULL DEFAULT '',
  word_count       int NOT NULL DEFAULT 0,
  is_original      bool NOT NULL DEFAULT false,
  is_approved      bool NOT NULL DEFAULT false,
  linkedin_excerpt text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, version)
);
ALTER TABLE public.free_form_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users full access" ON public.free_form_drafts
  FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE public.free_form_media (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id          uuid NOT NULL REFERENCES free_form_posts(id) ON DELETE CASCADE,
  media_type       text NOT NULL,
  storage_path     text NOT NULL,
  file_name        text NOT NULL,
  file_size        integer NOT NULL DEFAULT 0,
  page_count       integer,
  linkedin_caption text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, media_type)
);
ALTER TABLE public.free_form_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users full access" ON public.free_form_media
  FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE public.free_form_linkedin_posts (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id          uuid NOT NULL UNIQUE REFERENCES free_form_posts(id) ON DELETE CASCADE,
  linkedin_post_id text NOT NULL,
  linkedin_url     text,
  published_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.free_form_linkedin_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users full access" ON public.free_form_linkedin_posts
  FOR ALL USING (auth.role() = 'authenticated');
