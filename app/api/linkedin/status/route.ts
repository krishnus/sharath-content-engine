import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/linkedin/status
// Returns whether LinkedIn is connected and basic token info.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: tokenRow, error } = await supabase
    .from('linkedin_tokens')
    .select('display_name, expires_at, connected_at')
    .eq('user_id', user.id)
    .single()

  if (error || !tokenRow) {
    return NextResponse.json({ connected: false })
  }

  const expired = new Date(tokenRow.expires_at) < new Date()

  return NextResponse.json({
    connected: !expired,
    tokenInfo: {
      display_name: tokenRow.display_name,
      expires_at:   tokenRow.expires_at,
      connected_at: tokenRow.connected_at,
    },
  })
}
