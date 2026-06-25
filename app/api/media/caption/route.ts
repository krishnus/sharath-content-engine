import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { MODEL } from '@/lib/anthropic/client'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { postId } = await req.json() as { postId: string }

  const { data: post } = await supabase
    .from('posts')
    .select('pillar, format, drafts(content, is_original, version)')
    .eq('id', postId)
    .single()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const drafts = post.drafts as Array<{ content: string; is_original: boolean; version: number }>
  const original = drafts?.find(d => d.is_original)
  const current  = drafts?.filter(d => !d.is_original).sort((a, b) => b.version - a.version)[0]
  const content  = current?.content ?? original?.content ?? ''

  if (!content.trim()) return NextResponse.json({ error: 'No content found' }, { status: 400 })

  const format = post.format as string
  const isQuote = format === 'text_post' || format === 'market_insights'

  const prompt = isQuote
    ? `Extract or write the single most powerful, self-contained quote from this LinkedIn post.
Rules:
- Maximum 120 characters
- Must stand alone without context
- Punchy, memorable, and shareable
- No hashtags, no author attribution
- Sentence case (not all-caps)

POST CONTENT:
${content.slice(0, 3000)}

Return ONLY the quote text, nothing else.`
    : `Write a compelling LinkedIn caption hook for this document post (article or carousel).
Rules:
- 200–280 characters total
- Opens with a provocative question or bold statement
- Teases the value inside without giving it away
- Ends with a micro-CTA (e.g. "Read inside →" or "Swipe through →")
- No hashtags in the caption itself
- Voice: executive coaching, vedic wisdom, former global banker — Sharath Kumar R N

POST CONTENT:
${content.slice(0, 3000)}

Return ONLY the caption text, nothing else.`

  const client = new Anthropic()
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const caption = (message.content[0] as { text: string }).text.trim()
  return NextResponse.json({ caption })
}
