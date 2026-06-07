'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Linkedin, CheckCircle2, LogOut, ExternalLink, AlertTriangle, Settings2, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils/helpers'

type SystemSettings = {
  inception_date: string
  training_period_weeks: string
  live_date: string
  arc_q1_theme: string
  arc_q2_theme: string
  arc_q3_theme: string
  arc_q4_theme: string
}

type DerivedSettings = {
  isTrainingPeriod: boolean
  trainingWeeks: number
  daysSinceLive: number
  weeksSinceLive: number
  arcWeekNumber: number
  arcQuarter: string
  arcQuarterTheme: string
  arcYearNumber: number
}

const PUBLISH_TIMES: Record<string, string> = {
  monday: '07:30', tuesday: '07:30', wednesday: '07:30',
  thursday: '07:30', friday: '08:30', saturday: '09:30',
}

function SettingRow({ label, description, type, value, suffix, saving, saved, onSave }: {
  label: string; description?: string; type: string; value: string
  suffix?: string; saving: boolean; saved: boolean; onSave: (v: string) => void
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-cream">{label}</p>
          {description && <p className="text-xs text-ink-500 mt-0.5">{description}</p>}
        </div>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
      </div>
      <div className="flex items-center gap-2">
        <input type={type} value={local} onChange={e => setLocal(e.target.value)} className="input flex-1 text-sm" />
        {suffix && <span className="text-xs text-ink-400 shrink-0">{suffix}</span>}
        <button onClick={() => onSave(local)} disabled={saving || local === value} className="btn-secondary text-xs px-3 py-2 shrink-0">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [derived, setDerived]   = useState<DerivedSettings | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState<string | null>(null)
  const [saved, setSaved]       = useState<string | null>(null)
  const [liLoading, setLiLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(json => {
      setSettings(json.settings); setDerived(json.derived)
    }).finally(() => setLoading(false))
  }, [])

  const updateSetting = async (key: string, value: string) => {
    setSaving(key)
    await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) })
    setSettings(prev => prev ? { ...prev, [key]: value } : prev)
    setSaved(key); setTimeout(() => setSaved(null), 2000); setSaving(null)
  }

  const handleLinkedInConnect = async () => {
    setLiLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'linkedin_oidc', options: { scopes: 'profile email w_member_social', redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/settings` } })
    if (error) setLiLoading(false)
  }

  if (loading) return <div className="px-8 py-8 max-w-2xl mx-auto"><div className="h-64 bg-ink-800 rounded-xl animate-pulse" /></div>

  return (
    <div className="px-8 py-8 max-w-2xl mx-auto space-y-8">
      <div><p className="section-label mb-2">Settings</p><h1 className="display-heading text-3xl">Account & System</h1></div>

      {/* Arc Status */}
      {derived && (
        <section className="card p-6 space-y-4">
          <div className="flex items-center gap-2"><Calendar size={15} className="text-gold-500" /><p className="text-sm font-medium text-cream">Narrative Arc Status</p></div>
          {derived.isTrainingPeriod ? (
            <div className="px-4 py-3 rounded-lg bg-amber-900/15 border border-amber-700/25">
              <p className="text-sm text-amber-300 font-medium">Training Period Active</p>
              <p className="text-xs text-amber-400/70 mt-0.5">Live narrative arc begins on <span className="font-medium">{settings?.live_date}</span>. Posts now build your voice library and story context.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {[['Arc year', `Year ${derived.arcYearNumber}`], ['Arc quarter', `${derived.arcQuarter} — ${derived.arcQuarterTheme.split(' — ')[0]}`], ['Arc week', `Week ${derived.arcWeekNumber} of 52`]].map(([label, value]) => (
                <div key={label} className="card px-3 py-3"><p className="text-xs text-ink-500">{label}</p><p className="text-sm text-cream mt-0.5">{value}</p></div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* System Inception */}
      {settings && (
        <section className="card p-6 space-y-5">
          <div className="flex items-center gap-2"><Settings2 size={15} className="text-gold-500" /><p className="text-sm font-medium text-cream">System Inception</p></div>
          <SettingRow label="Inception date" description="When you first started using the system" type="date" value={settings.inception_date} saving={saving === 'inception_date'} saved={saved === 'inception_date'} onSave={v => updateSetting('inception_date', v)} />
          <SettingRow label="Training period" description="Weeks of training before the live arc begins" type="number" value={settings.training_period_weeks} suffix="weeks" saving={saving === 'training_period_weeks'} saved={saved === 'training_period_weeks'} onSave={v => updateSetting('training_period_weeks', v)} />
          <SettingRow label="Live date" description="When Year 1 / Q1 of the narrative arc starts" type="date" value={settings.live_date} saving={saving === 'live_date'} saved={saved === 'live_date'} onSave={v => updateSetting('live_date', v)} />
          <p className="text-xs text-ink-500 pt-2 border-t border-ink-800">Quarters are 13 weeks each from the live date — not the calendar year.</p>
        </section>
      )}

      {/* Arc Themes */}
      {settings && (
        <section className="card p-6 space-y-5">
          <p className="text-sm font-medium text-cream">Quarterly Arc Themes</p>
          {(['q1','q2','q3','q4'] as const).map((q, i) => {
            const key = `arc_${q}_theme` as keyof SystemSettings
            const labels = ['Q1 — The Awakening','Q2 — The Turning','Q3 — The Becoming','Q4 — The Integration']
            return <SettingRow key={q} label={labels[i]} type="text" value={settings[key]} saving={saving === key} saved={saved === key} onSave={v => updateSetting(key, v)} />
          })}
        </section>
      )}

      {/* LinkedIn */}
      <LinkedInSection />

      {/* Publish times */}
      <section className="card p-6 space-y-4">
        <div><p className="text-sm font-medium text-cream">Default Publish Times</p><p className="text-xs text-ink-400 mt-0.5">IST (UTC+5:30)</p></div>
        <div className="space-y-2">
          {Object.entries(PUBLISH_TIMES).map(([day, time]) => (
            <div key={day} className="flex items-center justify-between py-2 border-b border-ink-800 last:border-0">
              <p className="text-sm text-cream capitalize">{day}</p>
              <input type="time" defaultValue={time} className="input w-32 text-right font-mono text-sm" />
            </div>
          ))}
        </div>
        <button className="btn-secondary w-full justify-center text-sm">Save publish times</button>
      </section>

      {/* Account */}
      <section className="card p-6">
        <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/auth/login' }}
          className={cn('btn-ghost text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 w-full justify-center')}>
          <LogOut size={14} /> Sign out
        </button>
      </section>
    </div>
  )
}

// ── LinkedIn connection section ──────────────────────────────────────
function LinkedInSection() {
  const searchParams = useSearchParams()
  const [status, setStatus]       = useState<'loading' | 'connected' | 'disconnected'>('loading')
  const [tokenInfo, setTokenInfo] = useState<{ display_name: string | null; expires_at: string; connected_at: string } | null>(null)
  const [connecting, setConnecting]   = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [toast, setToast]         = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/linkedin/status')
      if (!res.ok) { setStatus('disconnected'); return }
      const json = await res.json()
      if (json.connected) {
        setStatus('connected')
        setTokenInfo(json.tokenInfo)
      } else {
        setStatus('disconnected')
      }
    } catch {
      setStatus('disconnected')
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const param = searchParams.get('linkedin')
    if (param === 'connected') setToast('LinkedIn connected successfully')
    if (param === 'error' || param === 'no_token') setToast('LinkedIn connection failed — please try again')
    if (param === 'save_error') setToast('Connected but failed to save token — please try again')
  }, [fetchStatus, searchParams])

  const handleConnect = async () => {
    setConnecting(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'linkedin_oidc',
      options: {
        scopes: 'profile email w_member_social',
        redirectTo: `${window.location.origin}/api/linkedin/callback`,
      },
    })
    if (error) { setConnecting(false); setToast('Connection failed: ' + error.message) }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      await fetch('/api/linkedin/disconnect', { method: 'DELETE' })
      setStatus('disconnected')
      setTokenInfo(null)
      setToast('LinkedIn disconnected')
    } catch {
      setToast('Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <section className="card p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#0A66C2]/20 border border-[#0A66C2]/30 flex items-center justify-center">
          <Linkedin size={16} className="text-[#0A66C2]" />
        </div>
        <div>
          <p className="text-sm font-medium text-cream">LinkedIn</p>
          <p className="text-xs text-ink-400">Required for direct publishing</p>
        </div>
        {status === 'connected' && (
          <span className="ml-auto badge badge-approved">
            <CheckCircle2 size={10} /> Connected
          </span>
        )}
      </div>

      {toast && (
        <div className={cn(
          'px-3 py-2 rounded-lg text-sm flex items-center justify-between gap-2',
          toast.includes('success') || toast.includes('disconnect')
            ? 'bg-emerald-900/15 border border-emerald-700/25 text-emerald-300'
            : 'bg-amber-900/15 border border-amber-700/25 text-amber-300'
        )}>
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="text-ink-500 hover:text-cream shrink-0">×</button>
        </div>
      )}

      {status === 'loading' && (
        <div className="h-10 bg-ink-800 rounded-lg animate-pulse" />
      )}

      {status === 'disconnected' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-900/15 border border-amber-700/25">
            <AlertTriangle size={15} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-300">LinkedIn not connected — direct publishing requires connection.</p>
          </div>
          <button onClick={handleConnect} disabled={connecting} className="btn-primary w-full justify-center">
            <Linkedin size={15} />{connecting ? 'Connecting...' : 'Connect LinkedIn'}
          </button>
          <p className="text-xs text-ink-500 text-center">
            Requires <code className="text-ink-400 bg-ink-800 px-1 py-0.5 rounded">w_member_social</code> scope.{' '}
            <a href="https://developer.linkedin.com/docs/guide/v2/sign-in-with-linkedin" target="_blank" rel="noopener noreferrer" className="text-gold-500 hover:underline inline-flex items-center gap-1">
              Setup guide <ExternalLink size={10} />
            </a>
          </p>
        </div>
      )}

      {status === 'connected' && tokenInfo && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="card px-3 py-3">
              <p className="text-xs text-ink-500">Account</p>
              <p className="text-sm text-cream mt-0.5">{tokenInfo.display_name ?? 'LinkedIn account'}</p>
            </div>
            <div className="card px-3 py-3">
              <p className="text-xs text-ink-500">Token expires</p>
              <p className="text-sm text-cream mt-0.5">
                {new Date(tokenInfo.expires_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
              </p>
            </div>
          </div>
          <button onClick={handleDisconnect} disabled={disconnecting} className="btn-secondary w-full justify-center text-sm text-red-400 hover:text-red-300">
            {disconnecting ? 'Disconnecting...' : 'Disconnect LinkedIn'}
          </button>
        </div>
      )}
    </section>
  )
}
