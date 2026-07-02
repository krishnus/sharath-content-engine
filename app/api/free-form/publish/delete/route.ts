import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { postId, linkedinPostId } = await req.json() as {
    postId: string
    linkedinPostId: string
  }

  const { data: tokenRow } = await supabase
    .from('linkedin_tokens')
    .select('access_token')
    .eq('user_id', user.id)
    .single()

  if (!tokenRow) return NextResponse.json({ error: 'LinkedIn not connected' }, { status: 402 })

  const normalizedId = encodeURIComponent(decodeURIComponent(linkedinPostId))
  const delRes = await fetch(`https://api.linkedin.com/rest/posts/${normalizedId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${tokenRow.access_token}`,
      'LinkedIn-Version': '202604',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  })

  if (!delRes.ok && delRes.status !== 404) {
    const body = await delRes.text()
    return NextResponse.json({ error: `LinkedIn delete failed (${delRes.status}): ${body}` }, { status: 502 })
  }

  await supabase.from('free_form_linkedin_posts').delete().eq('post_id', postId)
  await supabase.from('free_form_posts').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', postId)

  return NextResponse.json({ deleted: true })
}
