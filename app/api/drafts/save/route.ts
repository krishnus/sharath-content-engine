import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { countWords } from '@/lib/anthropic/client'

export async function POST(req: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { postId, content } = await req.json() as { postId: string; content: string }

  const wordCount = countWords(content)

  // Update the current (non-original) draft
  const { error } = await supabase
    .from('drafts')
    .update({ content, word_count: wordCount })
    .eq('post_id', postId)
    .eq('is_original', false)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update post status to 'edited' if it was 'draft'
  await supabase
    .from('posts')
    .update({ status: 'edited' })
    .eq('id', postId)
    .eq('status', 'draft')

  return NextResponse.json({ saved: true, wordCount })
}
