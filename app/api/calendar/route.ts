import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { startOfMonth, endOfMonth, format } from 'date-fns'

// GET /api/calendar?year=2026&month=6
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year  = parseInt(searchParams.get('year')  ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))

  const monthStart = startOfMonth(new Date(year, month - 1, 1))
  const monthEnd   = endOfMonth(monthStart)

  // Fetch all weeks whose week_start falls within the month OR overlaps it
  // (a week starting in late prev month may have days in this month)
  const { data: weeks, error } = await supabase
    .from('weeks')
    .select(`
      id, week_number, week_start, theme, quarter, status,
      posts (
        id, day, pillar, format, status, hook_idea, target_word_count
      )
    `)
    .gte('week_start', format(new Date(year, month - 1, -6), 'yyyy-MM-dd'))
    .lte('week_start', format(monthEnd, 'yyyy-MM-dd'))
    .order('week_start', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Build a flat list of { date, post } pairs the calendar can consume
  const DAY_OFFSET: Record<string, number> = {
    monday:    0,
    tuesday:   1,
    wednesday: 2,
    thursday:  3,
    friday:    4,
    saturday:  5,
  }

  type CalendarEntry = {
    date: string   // YYYY-MM-DD
    weekId: string
    weekTheme: string | null
    weekNumber: number
    post: {
      id: string; day: string; pillar: string; format: string
      status: string; hook_idea: string | null; target_word_count: number | null
    }
  }

  const entries: CalendarEntry[] = []

  for (const week of weeks ?? []) {
    const monday = new Date(week.week_start)
    for (const post of (week.posts ?? [])) {
      const offset = DAY_OFFSET[post.day] ?? 0
      const postDate = new Date(monday)
      postDate.setDate(monday.getDate() + offset)

      // Only include dates within the requested month
      if (postDate.getMonth() + 1 !== month || postDate.getFullYear() !== year) continue

      entries.push({
        date:       format(postDate, 'yyyy-MM-dd'),
        weekId:     week.id,
        weekTheme:  week.theme,
        weekNumber: week.week_number,
        post: {
          id:               post.id,
          day:              post.day,
          pillar:           post.pillar,
          format:           post.format,
          status:           post.status,
          hook_idea:        post.hook_idea,
          target_word_count: post.target_word_count,
        },
      })
    }
  }

  return NextResponse.json({ year, month, entries })
}
