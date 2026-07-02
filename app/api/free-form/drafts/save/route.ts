import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { countWords } from '@/lib/anthropic/client'

export const runtime = 'nodejs'

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

  if (content !== undefined) {
    wordCount = countWords(content)

    const { error } = await supabase
      .from('free_form_drafts')
      .update({ content, word_count: wordCount })
      .eq('post_id', postId)
      .eq('is_original', false)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabase
      .from('free_form_posts')
      .update({ status: 'edited', updated_at: new Date().toISOString() })
      .eq('id', postId)
      .eq('status', 'draft')
  }

  if (hashtags !== undefined) {
    await supabase
      .from('free_form_posts')
      .update({ hashtags, updated_at: new Date().toISOString() })
      .eq('id', postId)
  }

  return NextResponse.json({ saved: true, ...(wordCount !== undefined ? { wordCount } : {}) })
}
