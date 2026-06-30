import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { countWords } from '@/lib/anthropic/client'

export async function POST(req: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { postId, content, hashtags } = await req.json() as {
    postId: string
    content?: string
    hashtags?: string[]
  }

  let wordCount: number | undefined

  // Update draft content when provided (regular auto-save path)
  if (content !== undefined) {
    wordCount = countWords(content)

    const { error } = await supabase
      .from('drafts')
      .update({ content, word_count: wordCount })
      .eq('post_id', postId)
      .eq('is_original', false)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Advance post status from 'draft' → 'edited' on first user edit
    await supabase
      .from('posts')
      .update({ status: 'edited' })
      .eq('id', postId)
      .eq('status', 'draft')
  }

  // Persist hashtags when provided (auto-save includes current set;
  // X-button removal sends just postId + hashtags with no content)
  if (hashtags !== undefined) {
    await supabase
      .from('posts')
      .update({ hashtags })
      .eq('id', postId)
  }

  return NextResponse.json({ saved: true, ...(wordCount !== undefined ? { wordCount } : {}) })
}
