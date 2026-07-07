import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Runs daily at 1:00 AM UTC. Fetches LinkedIn social activity for all
// published posts using the stored user OAuth token.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Use the admin client directly — no cookie dependency in cron context
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Get the stored user OAuth token (service client bypasses RLS)
  const { data: tokenRow, error: tokenFetchError } = await supabase
    .from('linkedin_tokens')
    .select('access_token, expires_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (tokenFetchError) {
    console.error('[cron/analytics] Failed to fetch LinkedIn token:', tokenFetchError)
    return NextResponse.json({ fetched: 0, message: 'DB error fetching token' })
  }

  if (!tokenRow) {
    console.warn('[cron/analytics] No LinkedIn token stored — connect LinkedIn in Settings')
    return NextResponse.json({ fetched: 0, message: 'LinkedIn not connected' })
  }

  if (!tokenRow.access_token) {
    console.warn('[cron/analytics] LinkedIn token is empty — reconnect LinkedIn in Settings')
    return NextResponse.json({ fetched: 0, message: 'LinkedIn token is empty — please reconnect' })
  }

  if (new Date(tokenRow.expires_at) <= new Date()) {
    console.warn('[cron/analytics] LinkedIn token expired — reconnect in Settings')
    return NextResponse.json({ fetched: 0, message: 'LinkedIn token expired' })
  }

  const accessToken = tokenRow.access_token

  // Fetch all linkedin_posts published in last 90 days
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)

  const { data: liPosts, error: postsError } = await supabase
    .from('linkedin_posts')
    .select('id, linkedin_post_id, linkedin_url')
    .gte('published_at', cutoff.toISOString())
    .limit(50)

  if (postsError) {
    console.error('[cron/analytics] Failed to fetch linkedin_posts:', postsError)
    return NextResponse.json({ fetched: 0, message: 'DB error fetching linkedin_posts' })
  }

  if (!liPosts?.length) {
    return NextResponse.json({ fetched: 0, message: 'No published posts in last 90 days' })
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
  // Use /rest/socialActions (versioned REST, same API family as /rest/posts publishing)
  const res = await fetch(
    `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(liPost.linkedin_post_id)}`,
    {
      headers: {
        Authorization:                 `Bearer ${accessToken}`,
        'LinkedIn-Version':            '202604',
        'X-Restli-Protocol-Version':   '2.0.0',
      },
    }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`[cron/analytics] LinkedIn REST socialActions ${res.status} for ${liPost.linkedin_post_id}: ${body}`)
    throw new Error(`LinkedIn socialActions error ${res.status}: ${body}`)
  }

  const data = await res.json()
  console.log(`[cron/analytics] socialActions response keys: ${Object.keys(data).join(', ')}`)

  // REST socialActions response — try multiple known field locations
  const counts = data.totalSocialActivityCounts ?? data.socialActivityCounts ?? {}
  const likes    = counts.numLikes    ?? data.numLikes    ?? data.likesSummary?.totalLikes ?? 0
  const comments = counts.numComments ?? data.numComments ?? data.commentsSummary?.totalFirstLevelComments ?? 0
  const reposts  = counts.numShares   ?? data.numShares   ?? data.sharesSummary?.totalShares ?? 0

  await supabase.from('performance_data').insert({
    linkedin_post_id: liPost.id,
    source:      'api',
    impressions: 0,
    likes,
    comments,
    shares:  reposts,
    reposts,
    clicks:  0,
    fetched_at: new Date().toISOString(),
  })
}
