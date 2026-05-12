import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { weekStart } from '@/lib/utils/helpers'

export async function POST(req: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { weekNumber, year, quarter, theme } = await req.json() as {
    weekNumber: number
    year: number
    quarter: string
    theme: string
  }

  // Get or create the annual arc for this year
  let { data: arc } = await supabase
    .from('annual_arcs')
    .select('id')
    .eq('year', year)
    .maybeSingle()

  if (!arc) {
    const { data: newArc } = await supabase
      .from('annual_arcs')
      .insert({ year })
      .select('id')
      .single()
    arc = newArc
  }

  if (!arc) {
    return NextResponse.json({ error: 'Failed to create annual arc' }, { status: 500 })
  }

  // Calculate week start date
  const startDate = weekStart(year, weekNumber)

  // Upsert the week record
  const { data: week, error } = await supabase
    .from('weeks')
    .upsert({
      arc_id:     arc.id,
      year,
      week_number: weekNumber,
      week_start:  startDate.toISOString().split('T')[0],
      theme,
      quarter,
      status:     'draft',
    }, { onConflict: 'year,week_number' })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ weekId: week.id })
}
