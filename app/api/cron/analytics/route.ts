import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Runs daily at 1:00 AM UTC. Fetches LinkedIn social activity for all
// published posts using the stored user OAuth token.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Get the stored user OAuth token (service client can bypass RLS)
  const { data: tokenRow } = await supabase
    .from('linkedin_tokens')
    .select('access_token, expires_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!tokenRow) {
    console.warn('[cron/analytics] No LinkedIn token stored — connect LinkedIn in Settings')
    return NextResponse.json({ fetched: 0, message: 'LinkedIn not connected' })
  }

  if (new Date(tokenRow.expires_at) <= new Date()) {
    console.warn('[cron/analytics] LinkedIn token expired — reconnect in Settings')
    return NextResponse.json({ fetched: 0, message: 'LinkedIn token expired' })
  }

  const accessToken = tokenRow.access_token

  // Fetch all linkedin_posts published in last 90 days
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)

  const { data: liPosts, error } = await supabase
    .from('linkedin_posts')
    .select('id, linkedin_post_id, linkedin_url')
    .gte('published_at', cutoff.toISOString())
    .limit(50)

  if (error || !liPosts?.length) {
    return NextResponse.json({ fetched: 0 })
  }

  const results = await Promise.allSettled(
    liPosts.map(lp => fetchAndStoreAnalytics(lp, accessToken, supabase))
  )

  const fetched = results.filter(r => r.status === 'fulfilled').length
  const failed  = results.filter(r => r.status === 'rejected').length
  console.log(`[cron/analytics] Fetched ${fetched}/${liPosts.length} posts (${failed} failed)`)

  return NextResponse.json({ fetched })
}


async function fetchAndStoreAnalytics(
  liPost: { id: string; linkedin_post_id: string },
  accessToken: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<void> {
  // /v2/socialActions/{shareUrn} returns like/comment counts using the post owner's OAuth token
  const res = await fetch(
    `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(liPost.linkedin_post_id)}`,
    {
      headers: {
        Authorization:                 `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version':   '2.0.0',
      },
    }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`LinkedIn socialActions error ${res.status}: ${body}`)
  }

  const data = await res.json()

  // LinkedIn v2 socialActions response shape has nested paging objects for likes/comments
  // and totalSocialActivityCounts at the root — try multiple field locations
  const likes    = data.totalSocialActivityCounts?.numLikes    ?? data.likes?.paging?.total    ?? data.numLikes    ?? 0
  const comments = data.totalSocialActivityCounts?.numComments ?? data.comments?.paging?.total ?? data.numComments ?? 0
  const reposts  = data.totalSocialActivityCounts?.numShares   ?? data.shares?.paging?.total   ?? data.numShares   ?? 0

  await supabase.from('performance_data').insert({
    linkedin_post_id: liPost.id,
    source:      'api',
    impressions: 0,       // Not available via LinkedIn personal profile API — entered manually via check-in
    likes,
    comments,
    shares:  reposts,     // legacy field kept for backwards compat
    reposts,
    clicks:  0,
    fetched_at: new Date().toISOString(),
  })
}
