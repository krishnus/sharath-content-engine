import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 30

// Vercel Cron — runs every 30 minutes (see vercel.json).
// Finds all posts with status='scheduled' where scheduled_at <= now()
// and publishes them by calling /api/publish with the cron secret.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  // Left-join linkedin_posts so we can filter out posts already handed to LinkedIn
  // as native scheduled posts (they have a linkedin_posts record even before publishing).
  const { data: allDue, error } = await supabase
    .from('posts')
    .select('id, scheduled_at, linkedin_posts!left(id)')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(10)

  if (error) {
    console.error('[cron/publish] Query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Only process legacy DB-only scheduled posts (no linkedin_posts row).
  // Posts submitted as LinkedIn-native scheduled drafts already have a linkedin_posts
  // record — LinkedIn publishes those automatically; cron must not double-publish.
  const duePosts = (allDue ?? []).filter(p => {
    const lp = p.linkedin_posts
    if (!lp) return true
    if (Array.isArray(lp)) return lp.length === 0
    return false
  })

  if (!duePosts.length) {
    return NextResponse.json({ published: 0, message: 'No posts due' })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const results = await Promise.allSettled(
    duePosts.map(post =>
      fetch(`${appUrl}/api/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Identify this as a cron call so /api/publish uses service client
          'x-cron-secret': process.env.CRON_SECRET!,
        },
        body: JSON.stringify({ postId: post.id, publishNow: true }),
      }).then(r => r.ok)
    )
  )

  const published = results.filter(r => r.status === 'fulfilled' && r.value === true).length
  const failed    = results.length - published

  console.log(`[cron/publish] Published: ${published}, Failed: ${failed}`)
  return NextResponse.json({ published, failed })
}
