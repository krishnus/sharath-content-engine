// ============================================================
// Supabase Database Types
// Mirrors 001_initial_schema.sql exactly.
// ============================================================

export type PostDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'
export type PostPillar = 'vedic_leadership' | 'banker_coach' | 'coaching_transformation' | 'financial_intelligence' | 'inner_work'
export type PostFormat = 'long_form_article' | 'text_post' | 'carousel' | 'market_insights'
export type PostStatus = 'awaiting_market_data' | 'draft' | 'edited' | 'approved' | 'scheduled' | 'published' | 'publish_failed'
export type NarrativePosition = 'chapter_opening' | 'chapter_deepening' | 'complication' | 'resolution' | 'bridge'
export type RuleCategory = 'avoid_phrase' | 'prefer_phrase' | 'structural_pattern' | 'cta_adjustment' | 'tone_calibration' | 'opening_style' | 'closing_style'

export interface AnnualArc {
  id: string
  year: number
  q1_theme: string
  q2_theme: string
  q3_theme: string
  q4_theme: string
  arc_state: {
    open_threads: string[]
    used_references: string[]
    chapter_summaries: Record<string, string>
  }
  created_at: string
  updated_at: string
}

export interface Week {
  id: string
  arc_id: string
  year: number
  week_number: number
  week_start: string
  theme: string | null
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null
  open_thread: string | null
  plan: PlanSlot[]
  status: 'draft' | 'confirmed'
  created_at: string
  updated_at: string
}

export interface PlanSlot {
  day: PostDay
  pillar: PostPillar
  format: PostFormat
  narrative_position: NarrativePosition
  target_audience: string
  target_word_count: number
  hook_idea: string
}

export interface Post {
  id: string
  week_id: string
  day: PostDay
  pillar: PostPillar
  format: PostFormat
  status: PostStatus
  narrative_position: NarrativePosition | null
  target_audience: string | null
  target_word_count: number | null
  hook_idea: string | null
  hashtags: string[]
  scheduled_at: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
  // Relations (joined)
  drafts?: Draft[]
  story_log?: StoryLog
  linkedin_post?: LinkedInPost
}

export interface Draft {
  id: string
  post_id: string
  version: number
  content: string
  word_count: number
  is_original: boolean
  is_approved: boolean
  linkedin_excerpt: string | null
  created_at: string
}

export interface StoryLog {
  id: string
  post_id: string
  core_insight: string | null
  callback_used: string | null
  thread_planted: string | null
  references_used: {
    vedic: string[]
    banking: string[]
    coaching: string[]
  }
  created_at: string
}

export interface VoiceRule {
  id: string
  category: RuleCategory
  rule_text: string
  example_before: string | null
  example_after: string | null
  source_post_id: string | null
  active: boolean
  approved_at: string
  created_at: string
}

export interface LinkedInPost {
  id: string
  post_id: string
  linkedin_post_id: string
  linkedin_url: string | null
  published_at: string
}

export interface PerformanceData {
  id: string
  linkedin_post_id: string
  impressions: number
  likes: number
  comments: number
  shares: number
  clicks: number
  reposts: number
  source: 'api' | 'manual'
  dm_note: string | null
  fetched_at: string
}

export interface PerformanceInsight {
  id: string
  generated_at: string
  period_start: string | null
  period_end: string | null
  insight_type: string
  insights: Array<{
    category: 'pillar' | 'format' | 'timing' | 'content' | 'growth'
    insight: string
    recommendation: string
    confidence: 'high' | 'medium' | 'low'
  }>
  data_summary: Record<string, unknown>
  post_count: number
  created_at: string
}

// ── Free-form post types ──────────────────────────────────────────────
export interface FreeFormPost {
  id: string
  user_prompt: string
  format: PostFormat
  pillar: PostPillar | null
  status: PostStatus
  hashtags: string[]
  scheduled_at: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface FreeFormDraft {
  id: string
  post_id: string
  version: number
  content: string
  word_count: number
  is_original: boolean
  is_approved: boolean
  linkedin_excerpt: string | null
  created_at: string
}

export interface FreeFormMedia {
  id: string
  post_id: string
  media_type: string
  storage_path: string
  file_name: string
  file_size: number
  page_count: number | null
  linkedin_caption: string | null
  created_at: string
  updated_at: string
}

export interface FreeFormLinkedInPost {
  id: string
  post_id: string
  linkedin_post_id: string
  linkedin_url: string | null
  published_at: string
}

// ============================================================
// Database schema type for Supabase client
// ============================================================
export interface Database {
  public: {
    Tables: {
      annual_arcs:      { Row: AnnualArc;      Insert: Omit<AnnualArc, 'id' | 'created_at' | 'updated_at'>; Update: Partial<AnnualArc> }
      weeks:            { Row: Week;           Insert: Omit<Week, 'id' | 'created_at' | 'updated_at'>;      Update: Partial<Week> }
      posts:            { Row: Post;           Insert: Omit<Post, 'id' | 'created_at' | 'updated_at'>;      Update: Partial<Post> }
      drafts:           { Row: Draft;          Insert: Omit<Draft, 'id' | 'created_at'>;                    Update: Partial<Draft> }
      story_log:        { Row: StoryLog;       Insert: Omit<StoryLog, 'id' | 'created_at'>;                 Update: Partial<StoryLog> }
      voice_rules:      { Row: VoiceRule;      Insert: Omit<VoiceRule, 'id' | 'created_at'>;                Update: Partial<VoiceRule> }
      linkedin_posts:        { Row: LinkedInPost;        Insert: Omit<LinkedInPost, 'id'>;                               Update: Partial<LinkedInPost> }
      performance_data:      { Row: PerformanceData;      Insert: Omit<PerformanceData, 'id'>;                           Update: Partial<PerformanceData> }
      performance_insights:  { Row: PerformanceInsight;  Insert: Omit<PerformanceInsight, 'id' | 'created_at'>;         Update: Partial<PerformanceInsight> }
    }
  }
}
