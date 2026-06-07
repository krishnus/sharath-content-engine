import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/linkedin/callback
//
// LinkedIn → Supabase OAuth → lands here with ?code=...
// We exchange the code ourselves so we have access to provider_token
// at the moment of exchange (before it's stripped from SSR cookies).

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    console.error('[linkedin/callback] No code in request')
    return NextResponse.redirect(`${origin}/dashboard/settings?linkedin=error`)
  }

  const supabase = createClient()

  // Exchange code for session — provider_token is available right here
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    console.error('[linkedin/callback] Code exchange failed:', error)
    return NextResponse.redirect(`${origin}/dashboard/settings?linkedin=error`)
  }

  const { session } = data
  const providerToken   = session.provider_token
  const providerRefresh = session.provider_refresh_token

  if (!providerToken) {
    console.error('[linkedin/callback] No provider_token after exchange')
    return NextResponse.redirect(`${origin}/dashboard/settings?linkedin=no_token`)
  }

  // Fetch LinkedIn profile for member URN and display name
  let linkedinId: string | null = null
  let displayName: string | null = null

  try {
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${providerToken}` },
    })
    if (profileRes.ok) {
      const profile = await profileRes.json()
      linkedinId  = profile.sub  ?? null
      displayName = profile.name ?? profile.given_name ?? null
    }
  } catch (err) {
    console.warn('[linkedin/callback] Profile fetch failed (non-fatal):', err)
  }

  // LinkedIn access tokens expire in 60 days
  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()

  const { error: upsertError } = await supabase
    .from('linkedin_tokens')
    .upsert({
      user_id:       session.user.id,
      access_token:  providerToken,
      refresh_token: providerRefresh ?? null,
      expires_at:    expiresAt,
      linkedin_id:   linkedinId,
      display_name:  displayName,
      connected_at:  new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (upsertError) {
    console.error('[linkedin/callback] Token upsert failed:', upsertError)
    return NextResponse.redirect(`${origin}/dashboard/settings?linkedin=save_error`)
  }

  return NextResponse.redirect(`${origin}/dashboard/settings?linkedin=connected`)
}
