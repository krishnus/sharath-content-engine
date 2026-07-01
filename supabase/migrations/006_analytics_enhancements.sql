-- 006_analytics_enhancements.sql
-- Extends performance_data with source (api|manual), reposts, dm_note
-- Adds performance_insights table for AI-generated weekly digest

-- ── Extend performance_data ──────────────────────────────────────────
ALTER TABLE performance_data
  ADD COLUMN IF NOT EXISTS source  text NOT NULL DEFAULT 'api',
  ADD COLUMN IF NOT EXISTS reposts int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dm_note text;

ALTER TABLE performance_data
  ADD CONSTRAINT performance_data_source_check CHECK (source IN ('api', 'manual'));

-- ── AI-generated performance insights ────────────────────────────────
CREATE TABLE IF NOT EXISTS performance_insights (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at timestamptz NOT NULL    DEFAULT now(),
  period_start date,
  period_end   date,
  insight_type text        NOT NULL    DEFAULT 'weekly_digest',
  insights     jsonb       NOT NULL    DEFAULT '[]',
  data_summary jsonb       NOT NULL    DEFAULT '{}',
  post_count   int         NOT NULL    DEFAULT 0,
  created_at   timestamptz NOT NULL    DEFAULT now()
);

ALTER TABLE performance_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON performance_insights FOR ALL USING (true);
