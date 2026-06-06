import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { RuleCategory } from '@/lib/supabase/types'

// ── POST /api/rules/candidates ────────────────────────────────────────
// Called from the CandidateRulesModal after Sharath reviews the
// rules extracted by /api/learn and approves a subset.
// Only the rules he ticks are saved — discarded ones are dropped.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { rules, sourcePostId } = await req.json() as {
    rules: Array<{
      category: RuleCategory
      rule_text: string
      example_before?: string | null
      example_after?: string | null
    }>
    sourcePostId: string
  }

  if (!rules?.length) return NextResponse.json({ saved: 0 })

  const { data, error } = await supabase
    .from('voice_rules')
    .insert(
      rules.map(r => ({
        category:       r.category,
        rule_text:      r.rule_text,
        example_before: r.example_before ?? null,
        example_after:  r.example_after ?? null,
        source_post_id: sourcePostId,
        active:         true,
        approved_at:    new Date().toISOString(),
      }))
    )
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saved: data?.length ?? 0 })
}
