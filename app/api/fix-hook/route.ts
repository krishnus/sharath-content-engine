import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, MODEL } from '@/lib/anthropic/client'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { postId, content, pillar } = await req.json() as {
    postId: string
    content: string
    pillar: string
  }

  if (!content) {
    return NextResponse.json({ error: 'No content provided' }, { status: 400 })
  }

  // Extract the first paragraph (the hook)
  const paragraphs = content.split(/\n\n+/)
  const firstParagraph = paragraphs[0] ?? ''
  const rest = paragraphs.slice(1).join('\n\n')

  const message = await getAnthropicClient().messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `You are rewriting the opening line of a LinkedIn post by Sharath Kumar R N to fit within 210 characters.

The opening line must:
- Be under 210 characters (strict hard limit)
- Be complete as a standalone sentence — no ellipsis, no trailing "..."
- Create immediate curiosity or tension
- Sound exactly like Sharath's voice — story-driven, specific, never generic
- NOT start with "In today's..." or any generic opener

Current opening (${firstParagraph.length} characters — too long):
"${firstParagraph}"

Rewrite it as a single line under 210 characters that preserves the core idea.
Return ONLY the rewritten opening line — no explanation, no quotes, no preamble.`,
    }],
  })

  const rewrittenHook = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  // Reassemble the full content with the fixed hook
  const fixedContent = rest
    ? `${rewrittenHook}\n\n${rest}`
    : rewrittenHook

  // Save the fixed content to the current draft
  await supabase
    .from('drafts')
    .update({ content: fixedContent, word_count: fixedContent.split(/\s+/).filter(Boolean).length })
    .eq('post_id', postId)
    .eq('is_original', false)

  return NextResponse.json({ fixedContent })
}
