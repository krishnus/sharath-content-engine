import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getYear } from 'date-fns'

type WeekRow = {
  id: string; week_number: number; week_start: string
  theme: string | null; quarter: string | null; open_thread: string | null
  status: string
  posts: Array<{
    id: string; status: string; pillar: string
    story_log: { core_insight: string | null; thread_planted: string | null } | null
  }>
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const today = new Date()
  const year  = getYear(today)

  const [{ data: arc, error: arcError }, { data: settingsRow }] = await Promise.all([
    supabase.from('annual_arcs').select('*').eq('year', year).single(),
    supabase.from('system_settings').select('value').eq('key', 'live_date').maybeSingle(),
  ])

  if (arcError || !arc) {
    return NextResponse.json({ error: 'Annual arc not found for ' + year }, { status: 404 })
  }

  const { data: rawWeeks, error: weeksError } = await supabase
    .from('weeks')
    .select(`
      id,
      week_number,
      week_start,
      theme,
      quarter,
      open_thread,
      status,
      posts (
        id,
        status,
        pillar,
        story_log ( core_insight, thread_planted )
      )
    `)
    .eq('year', year)
    .order('week_number', { ascending: true })

  if (weeksError) {
    return NextResponse.json({ error: weeksError.message }, { status: 500 })
  }

  // Supabase returns story_log as an array from the nested select.
  // Normalise each post's story_log to a single object or null.
  const weeks: WeekRow[] = (rawWeeks ?? []).map(w => ({
    id:          w.id,
    week_number: w.week_number,
    week_start:  w.week_start,
    theme:       w.theme,
    quarter:     w.quarter,
    open_thread: w.open_thread,
    status:      w.status,
    posts: (w.posts ?? []).map((p: {
      id: string
      status: string
      pillar: string
      story_log: Array<{ core_insight: string | null; thread_planted: string | null }> | null
    }) => ({
      id:        p.id,
      status:    p.status,
      pillar:    p.pillar,
      story_log: Array.isArray(p.story_log) && p.story_log.length > 0
        ? { core_insight: p.story_log[0].core_insight, thread_planted: p.story_log[0].thread_planted }
        : null,
    })),
  }))

  // Compute arc-relative current week from live_date (not ISO calendar week)
  const liveDate = settingsRow?.value ? new Date(`${settingsRow.value}T00:00:00`) : null
  const isTrainingPeriod = liveDate ? today < liveDate : true
  const daysSinceLive = liveDate
    ? Math.max(0, Math.floor((today.getTime() - liveDate.getTime()) / 86400000))
    : 0
  // 0 = pre-live (no week highlighted); 1-52 = arc-relative week after go-live
  const arcCurrentWeek = isTrainingPeriod
    ? 0
    : Math.min(52, Math.floor(daysSinceLive / 7) + 1)

  // Re-key weekMap from ISO calendar week → arc-relative week (1-52)
  // so the arc timeline (which uses arc weeks 1-52) looks up the right data.
  const weekMap: Record<number, WeekRow> = {}
  if (liveDate) {
    for (const w of weeks) {
      const daysFromLive = Math.floor(
        (new Date(`${w.week_start}T00:00:00`).getTime() - liveDate.getTime()) / 86400000
      )
      const arcWeek = Math.floor(daysFromLive / 7) + 1
      if (arcWeek >= 1 && arcWeek <= 52) weekMap[arcWeek] = w
    }
  } else {
    // Fallback before live_date is configured: use ISO week numbers
    for (const w of weeks) weekMap[w.week_number] = w
  }

  const latestOpenThread = [...weeks].reverse().find(w => w.open_thread)?.open_thread ?? null

  return NextResponse.json({
    year,
    currentWeek: arcCurrentWeek,
    openThread: latestOpenThread,
    arc: {
      q1_theme: arc.q1_theme,
      q2_theme: arc.q2_theme,
      q3_theme: arc.q3_theme,
      q4_theme: arc.q4_theme,
    },
    weekMap,
  })
}
