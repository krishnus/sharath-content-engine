import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// GET /api/analytics/checkin
// Returns published posts from the last 14 days with their latest API-pulled
// likes/comments pre-filled, and the most recent manual impression entry if any.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 14)

  const { data: liPosts, error } = await supabase
    .from('linkedin_posts')
    .select(`
      id,
      linkedin_post_id,
      linkedin_url,
      published_at,
      post:posts (
        id, day, pillar, format, hook_idea
      ),
      performance_data (
        source, impressions, likes, comments, reposts, dm_note, fetched_at
      )
    `)
    .gte('published_at', cutoff.toISOString())
    .order('published_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const posts = (liPosts ?? []).map(lp => {
    const post    = Array.isArray(lp.post) ? lp.post[0] : lp.post
    const perfs   = (lp.performance_data ?? []) as Array<{ source: string; impressions: number; likes: number; comments: number; reposts: number; dm_note: string | null; fetched_at: string }>

    const apiEntries    = perfs.filter(p => p.source === 'api').sort((a, b) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime())
    const manualEntries = perfs.filter(p => p.source === 'manual').sort((a, b) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime())

    const latestApi    = apiEntries[0]
    const latestManual = manualEntries[0]

    return {
      linkedin_post_fk:   lp.id,
      linkedin_post_id:   lp.linkedin_post_id,
      linkedin_url:       lp.linkedin_url,
      published_at:       lp.published_at,
      day:                post?.day    ?? null,
      pillar:             post?.pillar ?? null,
      format:             post?.format ?? null,
      hook_idea:          post?.hook_idea ?? null,
      // Pre-fill from latest API pull
      api_likes:          latestApi?.likes    ?? 0,
      api_comments:       latestApi?.comments ?? 0,
      api_reposts:        latestApi?.reposts  ?? 0,
      // Pre-fill from latest manual entry
      manual_impressions: latestManual?.impressions ?? null,
      dm_note:            latestManual?.dm_note     ?? null,
      has_manual_entry:   manualEntries.length > 0,
    }
  })

  return NextResponse.json({ posts })
}


// POST /api/analytics/checkin
// Body: { entries: Array<{ linkedin_post_fk: string, impressions: number, dm_note?: string }> }
// Saves a manual performance_data row for each entry.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as {
    entries: Array<{
      linkedin_post_fk: string
      impressions: number
      dm_note?: string
    }>
  }

  if (!body.entries?.length) {
    return NextResponse.json({ error: 'No entries provided' }, { status: 400 })
  }

  const now = new Date().toISOString()

  const rows = body.entries
    .filter(e => e.impressions > 0)
    .map(e => ({
      linkedin_post_id: e.linkedin_post_fk,
      source:           'manual' as const,
      impressions:      e.impressions,
      likes:            0,
      comments:         0,
      shares:           0,
      reposts:          0,
      clicks:           0,
      dm_note:          e.dm_note ?? null,
      fetched_at:       now,
    }))

  if (!rows.length) {
    return NextResponse.json({ saved: 0, message: 'No valid impressions to save' })
  }

  const { error } = await supabase.from('performance_data').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ saved: rows.length })
}
