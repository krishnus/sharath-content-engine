import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, MODEL } from '@/lib/anthropic/client'
import { buildEditDiffPrompt } from '@/lib/anthropic/prompts'
import type { RuleCategory } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/free-form/learn — approve a free-form post, optionally for a specific draft version
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { postId, draftId } = await req.json() as { postId: string; draftId?: string }

  const { data: drafts } = await supabase
    .from('free_form_drafts')
    .select('*')
    .eq('post_id', postId)
    .order('version', { ascending: true })

  if (!drafts || drafts.length < 2) {
    return NextResponse.json({ candidateRules: [], message: 'No edit diff found' })
  }

  const original     = drafts.find(d => d.is_original)
  const nonOriginals = drafts.filter(d => !d.is_original)
  const current      = (draftId ? nonOriginals.find(d => d.id === draftId) : null)
    ?? nonOriginals[nonOriginals.length - 1]

  if (!original || !current) {
    return NextResponse.json({ candidateRules: [] })
  }

  const contentChanged = original.content.trim() !== current.content.trim()

  // Mark chosen draft as approved; clear flag on all others
  await supabase
    .from('free_form_drafts')
    .update({ is_approved: false })
    .eq('post_id', postId)
    .eq('is_original', false)
  await supabase
    .from('free_form_drafts')
    .update({ is_approved: true })
    .eq('id', current.id)

  // Set post status to approved
  await supabase
    .from('free_form_posts')
    .update({ status: 'approved', approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', postId)

  // No story log extraction for free-form posts (outside the arc)

  if (!contentChanged) {
    return NextResponse.json({ candidateRules: [] })
  }

  // Extract candidate voice rules from edit diff
  const diffMessage = await getAnthropicClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: buildEditDiffPrompt(original.content, current.content),
    }],
  })

  const diffRaw = diffMessage.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  let candidateRules: Array<{
    category: RuleCategory
    rule_text: string
    example_before: string | null
    example_after: string | null
  }> = []

  try {
    const cleaned = diffRaw.replace(/```json|```/g, '').trim()
    candidateRules = JSON.parse(cleaned)
  } catch {
    console.error('Failed to parse candidate rules JSON:', diffRaw)
  }

  candidateRules = candidateRules.filter(r =>
    !r.example_before || !r.example_after ||
    r.example_before.trim() !== r.example_after.trim()
  )

  return NextResponse.json({ candidateRules })
}
