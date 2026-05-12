import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'
export const maxDuration = 30

// Vercel Cron calls this every minute.
// Finds all approved + scheduled posts where scheduled_at <= now()
// and publishes them to LinkedIn.
export async function GET(req: NextRequest) {
  // Verify Cron secret to prevent unauthorised calls
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  // Fetch all posts due for publishing
  const { data: duePosts, error } = await supabase
    .from('posts')
    .select('id, scheduled_at, drafts(content, is_original)')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(20) // Process max 20 per minute to avoid rate limits

  if (error) {
    console.error('[cron/publish] Supabase query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!duePosts || duePosts.length === 0) {
    return NextResponse.json({ published: 0, message: 'No posts due' })
  }

  const results = await Promise.allSettled(
    duePosts.map(post => publishScheduledPost(post, supabase))
  )

  const published = results.filter(r => r.status === 'fulfilled' && r.value).length
  const failed    = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value)).length

  console.log(`[cron/publish] Published: ${published}, Failed: ${failed}`)
  return NextResponse.json({ published, failed })
}


async function publishScheduledPost(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<boolean> {
  const currentDraft = post.drafts?.find((d: { is_original: boolean }) => !d.is_original)
  if (!currentDraft?.content) {
    await supabase.from('posts').update({ status: 'publish_failed' }).eq('id', post.id)
    return false
  }

  // Call the publish API internally
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Service-to-service call uses service role — no user session available in Cron
          // For Cron publishing, LinkedIn token must be stored separately in DB
          // TODO: store LinkedIn access_token in a settings table for service-level publishing
        },
        body: JSON.stringify({ postId: post.id, publishNow: true }),
      }
    )

    return res.ok
  } catch {
    await supabase.from('posts').update({ status: 'publish_failed' }).eq('id', post.id)
    return false
  }
}
