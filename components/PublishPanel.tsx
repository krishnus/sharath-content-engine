'use client'

import { useState } from 'react'
import { Linkedin, Clock, Send, Loader2, CheckCircle2, ExternalLink, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils/helpers'

// Default publish times by day (IST)
const DEFAULT_TIMES: Record<string, string> = {
  monday:    '07:30',
  tuesday:   '07:30',
  wednesday: '07:30',
  thursday:  '07:30',
  friday:    '08:30',
  saturday:  '09:30',
}

export default function PublishPanel({
  postId,
  day,
  weekStart,     // ISO date string for the week's Monday
  onPublished,
  onScheduled,
}: {
  postId: string
  day: string
  weekStart: string
  onPublished: (url: string) => void
  onScheduled: (scheduledAt: string) => void
}) {
  const [mode, setMode]         = useState<'schedule' | 'now'>('schedule')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [done, setDone]         = useState(false)
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null)

  // Build the default scheduled datetime for this post's day
  function buildDefaultScheduledAt(): string {
    const DAY_OFFSET: Record<string, number> = {
      monday: 0, tuesday: 1, wednesday: 2,
      thursday: 3, friday: 4, saturday: 5,
    }
    const monday   = new Date(weekStart)
    const offset   = DAY_OFFSET[day] ?? 0
    const postDate = new Date(monday)
    postDate.setDate(monday.getDate() + offset)

    const time  = DEFAULT_TIMES[day] ?? '07:30'
    const [hr, min] = time.split(':').map(Number)

    // Convert IST (UTC+5:30) to UTC
    postDate.setUTCHours(hr - 5, min - 30, 0, 0)
    return postDate.toISOString()
  }

  const [scheduledAt, setScheduledAt] = useState(() => {
    const iso = buildDefaultScheduledAt()
    // Format to datetime-local input (YYYY-MM-DDTHH:MM) in IST
    const ist = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000)
    return ist.toISOString().slice(0, 16)
  })

  const handleAction = async () => {
    setLoading(true)
    setError(null)

    try {
      const body = mode === 'now'
        ? { postId, publishNow: true }
        : {
            postId,
            publishNow: false,
            // Convert IST datetime-local back to UTC ISO
            scheduledAt: new Date(
              new Date(scheduledAt).getTime() - 5.5 * 60 * 60 * 1000
            ).toISOString(),
          }

      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json()

      if (!res.ok) {
        // 402 = LinkedIn not connected
        throw new Error(json.error ?? `Publish failed (${res.status})`)
      }

      setDone(true)

      if (mode === 'now' && json.url) {
        setPublishedUrl(json.url)
        onPublished(json.url)
      } else if (mode === 'schedule') {
        onScheduled(json.scheduledAt)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish')
    } finally {
      setLoading(false)
    }
  }

  if (done && mode === 'now' && publishedUrl) {
    return (
      <div className="card px-4 py-4 border-emerald-700/30 bg-emerald-900/10 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300 font-medium">Published to LinkedIn</p>
        </div>
        <a
          href={publishedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-xs w-full justify-center"
        >
          <ExternalLink size={13} /> View on LinkedIn
        </a>
      </div>
    )
  }

  if (done && mode === 'schedule') {
    const ist = new Date(new Date(scheduledAt).getTime())
    return (
      <div className="card px-4 py-4 border-blue-700/30 bg-blue-900/10">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-blue-400 shrink-0" />
          <p className="text-sm text-blue-300 font-medium">
            Scheduled for {ist.toLocaleDateString('en-GB', { day:'numeric', month:'short' })} at {scheduledAt.slice(11, 16)} IST
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-4 space-y-4 border-[#0A66C2]/20 bg-[#0A66C2]/5">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-[#0A66C2]/20 flex items-center justify-center">
          <Linkedin size={13} className="text-[#0A66C2]" />
        </div>
        <p className="text-sm font-medium text-cream">Publish to LinkedIn</p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-lg overflow-hidden border border-ink-700">
        {(['schedule', 'now'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5',
              mode === m ? 'bg-ink-700 text-cream' : 'text-ink-400 hover:text-cream'
            )}
          >
            {m === 'schedule' ? <><Clock size={12} /> Schedule</> : <><Send size={12} /> Publish now</>}
          </button>
        ))}
      </div>

      {/* Schedule time picker */}
      {mode === 'schedule' && (
        <div className="space-y-1.5">
          <label className="section-label">Publish time (IST)</label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)}
            className="input text-sm w-full font-mono"
          />
          <p className="text-xs text-ink-500">
            Default: {DEFAULT_TIMES[day] ?? '07:30'} IST on {day.charAt(0).toUpperCase() + day.slice(1)}
          </p>
        </div>
      )}

      {mode === 'now' && (
        <p className="text-xs text-ink-400">
          Post will be published immediately to your LinkedIn profile.
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-900/10 border border-red-800/30 flex items-start gap-2">
          <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-red-400">{error}</p>
            {error.includes('not connected') && (
              <a href="/dashboard/settings" className="text-xs text-gold-500 hover:underline mt-1 block">
                Connect LinkedIn in Settings →
              </a>
            )}
          </div>
          <button onClick={() => setError(null)} className="shrink-0">
            <X size={12} className="text-ink-500" />
          </button>
        </div>
      )}

      <button
        onClick={handleAction}
        disabled={loading}
        className="btn-primary w-full justify-center"
      >
        {loading
          ? <><Loader2 size={14} className="animate-spin" /> {mode === 'now' ? 'Publishing...' : 'Scheduling...'}</>
          : mode === 'now'
            ? <><Send size={14} /> Publish now</>
            : <><Clock size={14} /> Schedule post</>
        }
      </button>
    </div>
  )
}
