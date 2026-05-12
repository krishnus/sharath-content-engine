import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, MODEL } from '@/lib/anthropic/client'
import { buildThemeProposalPrompt, buildWeekPlanPrompt } from '@/lib/anthropic/prompts'
import { getForwardPlanWeeks, getQuarter } from '@/lib/utils/helpers'
import type { PlanSlot } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 30

// ── GET /api/plan — fetch or generate forward plan ──────────────────
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const forwardWeeks = getForwardPlanWeeks(new Date())

  // Fetch existing weeks from DB
  const weeks = await Promise.all(forwardWeeks.map(async fw => {
    const { data } = await supabase
      .from('weeks')
      .select(`*, posts(*)`)
      .eq('year', fw.year)
      .eq('week_number', fw.weekNumber)
      .maybeSingle()
    return { meta: fw, data }
  }))

  return NextResponse.json({ weeks })
}

// ── POST /api/plan/themes — propose themes for 2 forward weeks ──────
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as {
    action: 'propose_themes' | 'generate_plan' | 'confirm_theme'
    weekId?: string
    theme?: string
    weekNumber?: number
    year?: number
    quarter?: string
    quarterTheme?: string
  }

  const { action, weekId, theme } = body

  // ── 1. Propose themes ────────────────────────────────────────────
  if (action === 'propose_themes') {
    const { weekNumber, year, quarter, quarterTheme } = body as {
      weekNumber: number
      year: number
      quarter: string
      quarterTheme: string
    }

    // Fetch recent themes (last 4 weeks) to avoid repetition
    const { data: recentWeeks } = await supabase
      .from('weeks')
      .select('theme')
      .not('theme', 'is', null)
      .order('week_start', { ascending: false })
      .limit(4)

    const { data: currentWeek } = await supabase
      .from('weeks')
      .select('open_thread')
      .eq('year', year)
      .eq('week_number', weekNumber - 1)
      .maybeSingle()

    const message = await getAnthropicClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: buildThemeProposalPrompt({
          weekNumber,
          year,
          quarter,
          quarterTheme,
          recentThemes: (recentWeeks ?? []).map((w: { theme: string | null }) => w.theme).filter(Boolean) as string[],
          openThread: currentWeek?.open_thread ?? null,
        }),
      }],
    })

    const raw = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    let themes: unknown[] = []
    try {
      themes = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch {
      return NextResponse.json({ error: 'Failed to parse themes' }, { status: 500 })
    }

    return NextResponse.json({ themes })
  }

  // ── 2. Generate plan for a confirmed theme ───────────────────────
  if (action === 'generate_plan' && weekId && theme) {
    const { data: week } = await supabase
      .from('weeks')
      .select('week_number, year, arc_id')
      .eq('id', weekId)
      .single()

    if (!week) return NextResponse.json({ error: 'Week not found' }, { status: 404 })

    const { data: arc } = await supabase
      .from('annual_arcs')
      .select('q1_theme, q2_theme, q3_theme, q4_theme')
      .eq('id', week.arc_id)
      .single()

    const weekStartDate = new Date() // approximate — sufficient for quarter calc
    const quarter = getQuarter(weekStartDate)
    const quarterThemeKey = `${quarter.toLowerCase()}_theme` as keyof typeof arc
    const quarterTheme = arc ? String(arc[quarterThemeKey]) : ''

    const message = await getAnthropicClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: buildWeekPlanPrompt({
          theme,
          quarter,
          quarterTheme,
          weekNumber: week.week_number,
        }),
      }],
    })

    const raw = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    let plan: PlanSlot[] = []
    try {
      plan = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch {
      return NextResponse.json({ error: 'Failed to parse plan' }, { status: 500 })
    }

    // Save plan and create post records
    await supabase
      .from('weeks')
      .update({ theme, plan, status: 'confirmed' })
      .eq('id', weekId)

    // Upsert posts for each slot
    await Promise.all(plan.map(slot =>
      supabase.from('posts').upsert({
        week_id:            weekId,
        day:                slot.day,
        pillar:             slot.pillar,
        format:             slot.format,
        narrative_position: slot.narrative_position,
        target_audience:    slot.target_audience,
        target_word_count:  slot.target_word_count,
        hook_idea:          slot.hook_idea,
        status: slot.day === 'saturday' ? 'awaiting_market_data' : 'draft',
      }, { onConflict: 'week_id,day' })
    ))

    return NextResponse.json({ plan })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
