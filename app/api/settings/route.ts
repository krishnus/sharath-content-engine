import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Cache settings for the duration of the request
export async function GET() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: rows, error } = await supabase
    .from('system_settings')
    .select('key, value')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return as a flat key-value object for easy consumption
  const settings = Object.fromEntries(
    (rows ?? []).map(r => [r.key, r.value])
  )

  // Calculate derived values
  const inceptionDate       = new Date(settings.inception_date ?? new Date())
  const trainingWeeks       = parseInt(settings.training_period_weeks ?? '8', 10)
  const liveDate            = new Date(settings.live_date ?? inceptionDate)
  const today               = new Date()
  const isTrainingPeriod    = today < liveDate
  const daysSinceLive       = Math.max(0, Math.floor((today.getTime() - liveDate.getTime()) / 86400000))
  const weeksSinceLive      = Math.floor(daysSinceLive / 7)

  // Calculate arc quarter based on live date (not calendar year)
  // Each quarter = 13 weeks from live date
  const arcQuarterIndex     = Math.min(3, Math.floor(weeksSinceLive / 13))
  const arcQuarterNumber    = arcQuarterIndex + 1
  const arcQuarterLabel     = `Q${arcQuarterNumber}`
  const arcYearNumber       = Math.floor(weeksSinceLive / 52) + 1

  return NextResponse.json({
    settings,
    derived: {
      inceptionDate:     inceptionDate.toISOString().split('T')[0],
      liveDate:          liveDate.toISOString().split('T')[0],
      isTrainingPeriod,
      trainingWeeks,
      daysSinceLive,
      weeksSinceLive,
      arcWeekNumber:     isTrainingPeriod ? 0 : weeksSinceLive + 1,
      arcQuarter:        arcQuarterLabel,
      arcQuarterTheme:   settings[`arc_${arcQuarterLabel.toLowerCase()}_theme`] ?? '',
      arcYearNumber,
    },
  })
}

// PATCH — update a single setting
export async function PATCH(req: Request) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { key, value } = await req.json() as { key: string; value: string }

  const { error } = await supabase
    .from('system_settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ updated: true })
}
