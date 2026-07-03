import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PostFormat, PostPillar } from '@/lib/supabase/types'

export const runtime = 'nodejs'

// GET /api/free-form/posts — list recent free-form posts (last 20)
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabase
    .from('free_form_posts')
    .select('id, user_prompt, format, pillar, status, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ posts: data ?? [] })
}

// POST /api/free-form/posts — create a new free-form post
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { userPrompt, format, pillar } = await req.json() as {
    userPrompt: string
    format: PostFormat
    pillar?: PostPillar | null
  }

  if (!userPrompt?.trim() || userPrompt.trim().length < 20) {
    return NextResponse.json({ error: 'Instructions must be at least 20 characters' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('free_form_posts')
    .insert({
      user_prompt: userPrompt.trim(),
      format:      format ?? 'text_post',
      pillar:      pillar ?? null,
      status:      'draft',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}
