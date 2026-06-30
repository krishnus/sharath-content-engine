import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addWeeks, format, getISOWeek, getYear, startOfISOWeek, parseISO } from 'date-fns'

export const runtime = 'nodejs'

// GET /api/calendar?windowStart=YYYY-MM-DD
// windowStart = the Monday of the "context" week (one before the 5-week display window).
// Returns 6 ordered week slots (index 0 = context, indices 1-5 = display).
// Unplanned weeks are returned as stubs with id: null.
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const rawWindowStart = searchParams.get('windowStart')

  // Default: context week = 3 weeks before current ISO week
  // so display weeks = currentWeek-2 … currentWeek+2
  const defaultContextMonday = startOfISOWeek(addWeeks(new Date(), -3))
  // Append T00:00:00 to avoid UTC→local shift on date-only strings
  const contextMonday = rawWindowStart
    ? parseISO(rawWindowStart.includes('T') ? rawWindowStart : `${rawWindowStart}T00:00:00`)
    : defaultContextMonday

  // 6 week slots: index 0 is the context week (for threading), 1-5 are displayed
  const slots = Array.from({ length: 6 }, (_, i) => {
    const monday = addWeeks(contextMonday, i)
    return {
      week_start:  format(monday, 'yyyy-MM-dd'),
      week_number: getISOWeek(monday),
      year:        getYear(monday),
    }
  })

  // Fetch existing weeks in this range
  const { data: weeks, error } = await supabase
    .from('weeks')
    .select(`
      id, week_number, year, week_start, theme, quarter, status, open_thread,
      posts (
        id, day, pillar, format, status, hook_idea, target_word_count,
        drafts ( id ),
        story_log ( thread_planted )
      )
    `)
    .gte('week_start', slots[0].week_start)
    .lte('week_start', slots[5].week_start)
    .order('week_start', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const weeksByStart: Record<string, typeof weeks[0]> = {}
  for (const w of weeks ?? []) weeksByStart[w.week_start] = w

  // Merge DB weeks into ordered slot stubs
  const result = slots.map(slot => {
    const w = weeksByStart[slot.week_start]
    if (w) return w
    return {
      id:          null as string | null,
      week_number: slot.week_number,
      year:        slot.year,
      week_start:  slot.week_start,
      theme:       null as string | null,
      quarter:     null as string | null,
      status:      'draft',
      open_thread: null as string | null,
      posts:       [] as typeof weeks[0]['posts'],
    }
  })

  // Arc themes + live_date fetched in parallel (for theme proposals and arc-quarter display)
  const centreYear = slots[3].year
  const [{ data: arc }, { data: settingsRow }] = await Promise.all([
    supabase.from('annual_arcs').select('q1_theme, q2_theme, q3_theme, q4_theme').eq('year', centreYear).maybeSingle(),
    supabase.from('system_settings').select('value').eq('key', 'live_date').maybeSingle(),
  ])

  const arcThemes: Record<string, string> = {
    Q1: arc?.q1_theme ?? 'The Awakening',
    Q2: arc?.q2_theme ?? 'The Turning',
    Q3: arc?.q3_theme ?? 'The Becoming',
    Q4: arc?.q4_theme ?? 'The Integration',
  }
  const liveDate: string | null = settingsRow?.value ?? null

  return NextResponse.json({ weeks: result, arcThemes, liveDate })
}
