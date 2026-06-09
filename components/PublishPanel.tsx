'use client'

import { useState } from 'react'
import { Linkedin, Clock, Send, Eye, Loader2, CheckCircle2, ExternalLink, AlertCircle, X, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils/helpers'

const DEFAULT_TIMES: Record<string, string> = {
  monday:    '07:30',
  tuesday:   '07:30',
  wednesday: '07:30',
  thursday:  '07:30',
  friday:    '08:30',
  saturday:  '09:30',
}

type Mode = 'schedule' | 'now' | 'preview'

export default function PublishPanel({
  postId,
  day,
  weekStart,
  onPublished,
  onScheduled,
  onPreviewActive,
}: {
  postId: string
  day: string
  weekStart: string
  onPublished: (url: string) => void
  onScheduled: (scheduledAt: string) => void
  onPreviewActive?: () => void
}) {
  const [mode, setMode]                   = useState<Mode>('schedule')
  const [loading, setLoading]             = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [done, setDone]                   = useState(false)
  const [previewUrl, setPreviewUrl]       = useState<string | null>(null)
  const [previewPostId, setPreviewPostId] = useState<string | null>(null)
  const [publishedUrl, setPublishedUrl]   = useState<string | null>(null)

  function buildDefaultScheduledAt(): string {
    const DAY_OFFSET: Record<string, number> = {
      monday: 0, tuesday: 1, wednesday: 2,
      thursday: 3, friday: 4, saturday: 5,
    }
    const monday   = new Date(weekStart)
    const offset   = DAY_OFFSET[day] ?? 0
    const postDate = new Date(monday)
    postDate.setDate(monday.getDate() + offset)
    const time = DEFAULT_TIMES[day] ?? '07:30'
    const [hr, min] = time.split(':').map(Number)
    postDate.setUTCHours(hr - 5, min - 30, 0, 0)
    return postDate.toISOString()
  }

  const [scheduledAt, setScheduledAt] = useState(() => {
    const iso = buildDefaultScheduledAt()
    const ist = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000)
    return ist.toISOString().slice(0, 16)
  })

  const handleAction = async () => {
    setLoading(true)
    setError(null)

    try {
      const body =
        mode === 'preview'  ? { postId, publishNow: true, preview: true } :
        mode === 'now'      ? { postId, publishNow: true } :
        {
          postId,
          publishNow: false,
          scheduledAt: new Date(
            new Date(scheduledAt).getTime() - 5.5 * 60 * 60 * 1000
          ).toISOString(),
        }

      const res  = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`)

      if (mode === 'preview') {
        setPreviewUrl(json.url)
        setPreviewPostId(json.linkedinPostId ?? null)
        onPreviewActive?.()  // tell parent not to hide PublishPanel
      } else if (mode === 'now') {
        setPublishedUrl(json.url)
        setDone(true)
        onPublished(json.url)
      } else {
        setDone(true)
        onScheduled(json.scheduledAt)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish')
    } finally {
      setLoading(false)
    }
  }

  // Promote preview post to PUBLIC visibility
  const handlePromote = async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, publishNow: true, promotePreview: true, linkedinPostId: previewPostId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`)
      setPublishedUrl(json.url)
      setPreviewUrl(null)
      setDone(true)
      onPublished(json.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote')
    } finally {
      setLoading(false)
    }
  }

  // Delete the preview post from LinkedIn
  const handleDeletePreview = async () => {
    if (!previewPostId) { setPreviewUrl(null); return }
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch('/api/publish/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, linkedinPostId: previewPostId }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Delete failed')
      }
      setPreviewUrl(null)
      setPreviewPostId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preview')
    } finally {
      setDeleting(false)
    }
  }

  // ── Done states ──────────────────────────────────────────────────

  if (done && (mode === 'now' || mode === 'preview') && publishedUrl) {
    return (
      <div className="card px-4 py-4 border-emerald-700/30 bg-emerald-900/10 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300 font-medium">Published to LinkedIn</p>
        </div>
        <a href={publishedUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs w-full justify-center">
          <ExternalLink size={13} /> View on LinkedIn
        </a>
      </div>
    )
  }

  if (done && mode === 'schedule') {
    return (
      <div className="card px-4 py-4 border-blue-700/30 bg-blue-900/10">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-blue-400 shrink-0" />
          <p className="text-sm text-blue-300 font-medium">
            Scheduled for {new Date(scheduledAt).toLocaleDateString('en-GB', { day:'numeric', month:'short' })} at {scheduledAt.slice(11,16)} IST
          </p>
        </div>
      </div>
    )
  }

  // ── Preview live state ───────────────────────────────────────────

  if (previewUrl) {
    return (
      <div className="card p-4 space-y-4 border-violet-700/30 bg-violet-900/10">
        <div className="flex items-center gap-2">
          <Eye size={15} className="text-violet-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-cream">Preview live on LinkedIn</p>
            <p className="text-xs text-ink-400 mt-0.5">
              Only visible to you via the direct link — not distributed in anyone's feed.
            </p>
          </div>
        </div>

        <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm w-full justify-center">
          <ExternalLink size={13} /> Open preview on LinkedIn
        </a>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-900/10 border border-red-800/30 flex items-start gap-2">
            <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400 flex-1">{error}</p>
            <button onClick={() => setError(null)}><X size={12} className="text-ink-500" /></button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleDeletePreview}
            disabled={deleting || loading}
            className="btn-secondary text-sm justify-center text-red-400 hover:text-red-300"
          >
            {deleting
              ? <><Loader2 size={13} className="animate-spin" /> Deleting...</>
              : <><Trash2 size={13} /> Delete preview</>
            }
          </button>
          <button
            onClick={handlePromote}
            disabled={loading || deleting}
            className="btn-primary justify-center text-sm"
          >
            {loading
              ? <><Loader2 size={13} className="animate-spin" /> Publishing...</>
              : <><Send size={13} /> Publish publicly</>
            }
          </button>
        </div>

        <p className="text-xs text-ink-500 text-center">
          Happy with how it looks? Publish publicly, or delete and go back to edit.
        </p>
      </div>
    )
  }

  // ── Main panel ───────────────────────────────────────────────────

  return (
    <div className="card p-4 space-y-4 border-[#0A66C2]/20 bg-[#0A66C2]/5">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-[#0A66C2]/20 flex items-center justify-center">
          <Linkedin size={13} className="text-[#0A66C2]" />
        </div>
        <p className="text-sm font-medium text-cream">Publish to LinkedIn</p>
      </div>

      {/* Three-way mode toggle */}
      <div className="flex rounded-lg overflow-hidden border border-ink-700">
        {([
          { key: 'preview',  label: 'Preview',  icon: <Eye size={12} /> },
          { key: 'schedule', label: 'Schedule', icon: <Clock size={12} /> },
          { key: 'now',      label: 'Publish',  icon: <Send size={12} /> },
        ] as const).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={cn(
              'flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5',
              mode === key ? 'bg-ink-700 text-cream' : 'text-ink-400 hover:text-cream'
            )}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* Mode descriptions */}
      {mode === 'preview' && (
        <div className="px-3 py-2.5 rounded-lg bg-violet-900/15 border border-violet-700/25 space-y-1">
          <p className="text-xs text-violet-300 font-medium">How preview works</p>
          <p className="text-xs text-ink-400">
            Publishes with <code className="text-ink-300 bg-ink-800 px-1 rounded">LOGGED_IN</code> visibility —
            only reachable via the direct link, never distributed in anyone's feed.
            You review it on LinkedIn, then either publish publicly or delete it.
          </p>
        </div>
      )}

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
          Post will be published immediately and publicly to your LinkedIn profile.
        </p>
      )}

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
          ? <><Loader2 size={14} className="animate-spin" />
              {mode === 'preview' ? 'Creating preview...' : mode === 'now' ? 'Publishing...' : 'Scheduling...'}
            </>
          : mode === 'preview'
            ? <><Eye size={14} /> Preview on LinkedIn</>
            : mode === 'now'
              ? <><Send size={14} /> Publish now</>
              : <><Clock size={14} /> Schedule post</>
        }
      </button>
    </div>
  )
}
