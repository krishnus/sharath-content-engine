import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const weekNumber = parseInt(searchParams.get('weekNumber') ?? '0', 10)
  const year       = parseInt(searchParams.get('year') ?? '0', 10)

  if (!weekNumber || !year) {
    return NextResponse.json({ error: 'weekNumber and year are required' }, { status: 400 })
  }

  const { data: week } = await supabase
    .from('weeks')
    .select('id, theme, status, posts(id, status)')
    .eq('year', year)
    .eq('week_number', weekNumber)
    .maybeSingle()

  if (!week) {
    return NextResponse.json({ week: null })
  }

  const posts        = (week.posts as Array<{ id: string; status: string }>) ?? []
  const approvedCount = posts.filter(p => p.status === 'approved').length
  const totalPosts    = posts.filter(p => p.status !== 'awaiting_market_data').length

  return NextResponse.json({
    week: {
      weekId:        week.id,
      theme:         week.theme,
      status:        week.status,
      approvedCount,
      totalPosts,
    },
  })
}
