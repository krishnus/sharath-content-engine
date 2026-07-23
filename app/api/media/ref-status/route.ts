import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const REF_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const refRe    = () => new RegExp(`REF:(${REF_UUID})`, 'gi')

// GET /api/media/ref-status?postId=xxx
// Returns how many [REF:uuid] tokens in the current draft resolve to live LinkedIn URLs
// vs. how many reference posts not yet published.
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const postId = req.nextUrl.searchParams.get('postId')
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })

  const { data: drafts } = await supabase
    .from('drafts')
    .select('content, is_original, version')
    .eq('post_id', postId)
    .order('version', { ascending: false })

  const currentDraft = ((drafts ?? []) as Array<{ content: string; is_original: boolean; version: number }>)
    .filter(d => !d.is_original)[0] ?? (drafts as Array<{ content: string }>)?.[0]

  if (!currentDraft?.content) {
    return NextResponse.json({ resolvedCount: 0, unresolvedCount: 0 })
  }

  const matches = [...currentDraft.content.matchAll(refRe())]
  const postIds = [...new Set(matches.map(m => m[1]))]

  if (postIds.length === 0) {
    return NextResponse.json({ resolvedCount: 0, unresolvedCount: 0 })
  }

  const { data: liPosts } = await supabase
    .from('linkedin_posts')
    .select('post_id, linkedin_url')
    .in('post_id', postIds)

  const resolvedIds = new Set(
    ((liPosts ?? []) as Array<{ post_id: string; linkedin_url: string | null }>)
      .filter(lp => !!lp.linkedin_url)
      .map(lp => lp.post_id)
  )

  const resolvedCount   = postIds.filter(id =>  resolvedIds.has(id)).length
  const unresolvedCount = postIds.filter(id => !resolvedIds.has(id)).length

  return NextResponse.json({ resolvedCount, unresolvedCount })
}
