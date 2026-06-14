import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// DELETE /api/publish/delete
// Deletes a preview post from LinkedIn and resets post status to approved.
export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { postId, linkedinPostId } = await req.json() as {
    postId: string
    linkedinPostId: string
  }

  // Get token
  const { data: tokenRow } = await supabase
    .from('linkedin_tokens')
    .select('access_token')
    .eq('user_id', user.id)
    .single()

  if (!tokenRow) {
    return NextResponse.json({ error: 'LinkedIn not connected' }, { status: 402 })
  }

  // Delete from LinkedIn — normalize the ID first (Location header may already be URL-encoded)
  const normalizedId = encodeURIComponent(decodeURIComponent(linkedinPostId))
  const delRes = await fetch(
    `https://api.linkedin.com/rest/posts/${normalizedId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization:               `Bearer ${tokenRow.access_token}`,
        'LinkedIn-Version':          '202604',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  )

  if (!delRes.ok && delRes.status !== 404) {
    const body = await delRes.text()
    return NextResponse.json(
      { error: `LinkedIn delete failed (${delRes.status}): ${body}` },
      { status: 502 }
    )
  }

  // Remove linkedin_posts record if it exists (preview posts may not have one)
  await supabase.from('linkedin_posts').delete().eq('post_id', postId)

  // Reset post status back to approved so it can be re-published
  await supabase.from('posts').update({ status: 'approved' }).eq('id', postId)

  return NextResponse.json({ deleted: true })
}
