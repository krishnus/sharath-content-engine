import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { RuleCategory } from '@/lib/supabase/types'

// ── GET /api/rules ────────────────────────────────────────────────────
// Returns all voice rules, ordered by creation date desc.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabase
    .from('voice_rules')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rules: data ?? [] })
}

// ── POST /api/rules ───────────────────────────────────────────────────
// Manually add a new rule (from the Rules page "Add rule" button).
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as {
    category: RuleCategory
    rule_text: string
    example_before?: string | null
    example_after?: string | null
  }

  if (!body.category || !body.rule_text?.trim()) {
    return NextResponse.json({ error: 'category and rule_text are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('voice_rules')
    .insert({
      category:       body.category,
      rule_text:      body.rule_text.trim(),
      example_before: body.example_before ?? null,
      example_after:  body.example_after ?? null,
      source_post_id: null,
      active:         true,
      approved_at:    new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rule: data })
}

// ── PATCH /api/rules ──────────────────────────────────────────────────
// Toggle active state or update rule_text for a single rule.
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as {
    id: string
    active?: boolean
    rule_text?: string
  }

  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (typeof body.active !== 'undefined')   updates.active    = body.active
  if (typeof body.rule_text !== 'undefined') updates.rule_text = body.rule_text.trim()

  const { data, error } = await supabase
    .from('voice_rules')
    .update(updates)
    .eq('id', body.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rule: data })
}

// ── DELETE /api/rules ─────────────────────────────────────────────────
// Permanently delete a rule.
export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabase.from('voice_rules').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
