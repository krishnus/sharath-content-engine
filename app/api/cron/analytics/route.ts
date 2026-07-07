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

  // LinkedIn's socialActions endpoint requires LinkedIn Partner API access (403 otherwise).
  // Standard OAuth tokens (w_member_social) cannot read engagement counts via API.
  // Analytics must be entered manually via the check-in UI.
  console.log(
    `[cron/analytics] Found ${liPosts.length} published post(s). ` +
    `LinkedIn Partner API access is required to fetch engagement counts automatically. ` +
    `Enter impressions/likes manually via the analytics check-in.`
  )

  return NextResponse.json({
    fetched: 0,
    posts: liPosts.length,
    message: 'LinkedIn Partner API access required for automated analytics. Use manual check-in.',
  })
}
