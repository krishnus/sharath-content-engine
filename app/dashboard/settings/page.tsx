'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Linkedin, CheckCircle2, LogOut, ExternalLink, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils/helpers'

// Mock settings state — replace with Supabase + session data
const MOCK_SETTINGS = {
  linkedInConnected: false,
  linkedInName: null as string | null,
  email: 'sharath@coachsharath.com',
  publishTimezone: 'Asia/Kolkata',
}

const PUBLISH_TIMES: Record<string, string> = {
  monday:    '07:30',
  tuesday:   '07:30',
  wednesday: '07:30',
  thursday:  '07:30',
  friday:    '08:30',
  saturday:  '09:30',
}

export default function SettingsPage() {
  const [settings]  = useState(MOCK_SETTINGS)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleLinkedInConnect = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'linkedin_oidc',
      options: {
        scopes: 'openid profile email w_member_social r_basicprofile',
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/settings`,
      },
    })
    if (error) {
      console.error('LinkedIn OAuth error:', error)
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  return (
    <div className="px-8 py-8 max-w-2xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <p className="section-label mb-2">Settings</p>
        <h1 className="display-heading text-3xl">Account</h1>
      </div>

      {/* LinkedIn connection */}
      <section className="card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0A66C2]/20 border border-[#0A66C2]/30 flex items-center justify-center">
            <Linkedin size={16} className="text-[#0A66C2]" />
          </div>
          <div>
            <p className="text-sm font-medium text-cream">LinkedIn</p>
            <p className="text-xs text-ink-400">Required for direct publishing and analytics</p>
          </div>
        </div>

        {settings.linkedInConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-900/15 border border-emerald-700/25">
              <CheckCircle2 size={15} className="text-emerald-400" />
              <div>
                <p className="text-sm text-emerald-300">Connected as {settings.linkedInName}</p>
                <p className="text-xs text-emerald-500/70">Publishing and analytics are active</p>
              </div>
            </div>
            <button className="btn-secondary text-sm w-full justify-center">
              Reconnect LinkedIn
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-900/15 border border-amber-700/25">
              <AlertTriangle size={15} className="text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-amber-300">LinkedIn not connected</p>
                <p className="text-xs text-amber-500/70">
                  Posts can be drafted and approved without LinkedIn, but direct publishing requires connection.
                </p>
              </div>
            </div>
            <button
              onClick={handleLinkedInConnect}
              disabled={loading}
              className="btn-primary w-full justify-center"
            >
              <Linkedin size={15} />
              {loading ? 'Connecting...' : 'Connect LinkedIn account'}
            </button>
            <p className="text-xs text-ink-500 text-center">
              Requires LinkedIn app approval with{' '}
              <code className="text-ink-400 bg-ink-800 px-1 py-0.5 rounded">w_member_social</code> scope.{' '}
              <a
                href="https://developer.linkedin.com/docs/guide/v2/sign-in-with-linkedin"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold-500 hover:underline inline-flex items-center gap-1"
              >
                Setup guide <ExternalLink size={10} />
              </a>
            </p>
          </div>
        )}
      </section>

      {/* Default publish times */}
      <section className="card p-6 space-y-4">
        <div>
          <p className="text-sm font-medium text-cream">Default Publish Times</p>
          <p className="text-xs text-ink-400 mt-0.5">IST (UTC+5:30) · Adjust per post in the editor</p>
        </div>

        <div className="space-y-2">
          {Object.entries(PUBLISH_TIMES).map(([day, time]) => (
            <div key={day} className="flex items-center justify-between py-2 border-b border-ink-800 last:border-0">
              <p className="text-sm text-cream capitalize">{day}</p>
              <input
                type="time"
                defaultValue={time}
                className="input w-32 text-right font-mono text-sm"
              />
            </div>
          ))}
        </div>

        <button className="btn-secondary w-full justify-center text-sm">
          Save publish times
        </button>
      </section>

      {/* Account */}
      <section className="card p-6 space-y-4">
        <p className="text-sm font-medium text-cream">Account</p>
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm text-cream-muted">{settings.email}</p>
            <p className="text-xs text-ink-500">Signed in via magic link</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className={cn('btn-ghost text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 w-full justify-center')}
        >
          <LogOut size={14} />
          Sign out
        </button>
      </section>

    </div>
  )
}
