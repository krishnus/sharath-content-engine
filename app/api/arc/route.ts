import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getISOWeek, getYear } from 'date-fns'

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

  const year = getYear(new Date())
  const currentWeek = getISOWeek(new Date())

  const { data: arc, error: arcError } = await supabase
    .from('annual_arcs')
    .select('*')
    .eq('year', year)
    .single()

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

  const weekMap: Record<number, WeekRow> = {}
  for (const w of weeks) {
    weekMap[w.week_number] = w
  }

  const latestOpenThread = [...weeks].reverse().find(w => w.open_thread)?.open_thread ?? null

  return NextResponse.json({
    year,
    currentWeek,
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
