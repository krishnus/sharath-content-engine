import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /auth/linkedin/callback
//
// Supabase handles the OAuth code exchange and sets the session cookie.
// This route runs AFTER Supabase's own /auth/callback — we redirect
// Supabase's callback to here so we can persist the provider_token.
//
// In Supabase dashboard → Auth → URL Configuration, set:
//   Redirect URL: https://your-domain.com/auth/callback
//   And in your OAuth call: redirectTo = `${origin}/auth/linkedin/callback`
//
// Flow:
//   LinkedIn → Supabase OAuth → /auth/linkedin/callback
//   This route reads session.provider_token and stores it in linkedin_tokens.

export async function GET(req: NextRequest) {
  const supabase = createClient()

  // By the time this route is called, Supabase SSR has already set the
  // session cookie (via its own /auth/callback handler).
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session) {
    console.error('[linkedin/callback] No session after OAuth:', error)
    return NextResponse.redirect(new URL('/dashboard/settings?linkedin=error', req.url))
  }

  const providerToken   = session.provider_token
  const providerRefresh = session.provider_refresh_token

  if (!providerToken) {
    console.error('[linkedin/callback] No provider_token in session')
    return NextResponse.redirect(new URL('/dashboard/settings?linkedin=no_token', req.url))
  }

  // Fetch LinkedIn profile to get the member URN and display name
  let linkedinId: string | null = null
  let displayName: string | null = null

  try {
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${providerToken}` },
    })
    if (profileRes.ok) {
      const profile = await profileRes.json()
      linkedinId  = profile.sub        ?? null
      displayName = profile.name       ?? profile.given_name ?? null
    }
  } catch (err) {
    console.warn('[linkedin/callback] Profile fetch failed:', err)
  }

  // Token typically expires in 60 days for LinkedIn
  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()

  // Upsert into linkedin_tokens
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
    }, {
      onConflict: 'user_id',
    })

  if (upsertError) {
    console.error('[linkedin/callback] Token upsert failed:', upsertError)
    return NextResponse.redirect(new URL('/dashboard/settings?linkedin=save_error', req.url))
  }

  return NextResponse.redirect(new URL('/dashboard/settings?linkedin=connected', req.url))
}
