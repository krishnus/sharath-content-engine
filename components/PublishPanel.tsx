'use client'

import { useState } from 'react'
import {
  Linkedin, Clock, Send, Eye, Loader2, CheckCircle2,
  ExternalLink, AlertCircle, X, Trash2, Lock, RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils/helpers'

const DEFAULT_TIMES: Record<string, string> = {
  monday: '07:30', tuesday: '07:30', wednesday: '07:30',
  thursday: '07:30', friday: '07:30', saturday: '07:30',
}

type Mode = 'schedule' | 'now' | 'preview'

const DOCUMENT_FORMATS = ['long_form_article', 'carousel']

export default function PublishPanel({
  postId,
  day = 'monday',
  format,
  weekStart,
  approved,
  postStatus,
  hasRequiredMedia,
  scheduledAt: scheduledAtFromDB,
  initialPublishedUrl,
  unresolvedRefCount,
  onPublished,
  onScheduled,
  onStatusReset,
  publishApiPath = '/api/publish',
  deleteApiPath = '/api/publish/delete',
  statusResetPath,
}: {
  postId: string
  day?: string
  format?: string
  weekStart?: string
  approved: boolean
  postStatus: string
  hasRequiredMedia: boolean
  scheduledAt?: string
  initialPublishedUrl?: string | null
  unresolvedRefCount?: number
  onPublished: (url: string) => void
  onScheduled: (scheduledAt: string) => void
  onStatusReset: () => void
  publishApiPath?: string
  deleteApiPath?: string
  statusResetPath?: string
}) {
  const isDocumentPost = DOCUMENT_FORMATS.includes(format ?? '')
  const mediaLabel = isDocumentPost ? 'PDF' : 'Quote Image'

  const alreadyPublished = postStatus === 'published' && !!initialPublishedUrl

  const [mode, setMode]                   = useState<Mode>('schedule')
  const [loading, setLoading]             = useState(false)
  const [resetting, setResetting]         = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [done, setDone]                   = useState(alreadyPublished)
  const [doneMode, setDoneMode]           = useState<Mode>(alreadyPublished ? 'now' : 'schedule')
  const [previewUrl, setPreviewUrl]       = useState<string | null>(null)
  const [previewPostId, setPreviewPostId] = useState<string | null>(null)
  const [publishedUrl, setPublishedUrl]   = useState<string | null>(initialPublishedUrl ?? null)

  function buildDefaultScheduledAt(): string {
    const DAY_OFFSET: Record<string, number> = {
      monday: 0, tuesday: 1, wednesday: 2,
      thursday: 3, friday: 4, saturday: 5,
    }
    const base   = weekStart ? new Date(weekStart) : new Date()
    const offset = DAY_OFFSET[day] ?? 0
    const postDate = new Date(base)
    postDate.setDate(base.getDate() + offset)
    const [hr, min] = (DEFAULT_TIMES[day] ?? '07:30').split(':').map(Number)
    postDate.setUTCHours(hr - 5, min - 30, 0, 0)
    return postDate.toISOString()
  }

  const [scheduledAt, setScheduledAt] = useState(() => {
    const iso = buildDefaultScheduledAt()
    const ist = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000)
    return ist.toISOString().slice(0, 16)
  })

  // Format a UTC ISO string as "4 Jul, 07:30 IST" for display
  function formatScheduledTime(isoUtc?: string): string {
    if (!isoUtc) return ''
    const ist = new Date(new Date(isoUtc).getTime() + 5.5 * 60 * 60 * 1000)
    const date = ist.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const time = ist.toISOString().slice(11, 16)
    return `${date} at ${time} IST`
  }

  const effectiveMode: Mode = mode

  async function handleAction() {
    setLoading(true)
    setError(null)
    try {
      const body =
        effectiveMode === 'preview' ? { postId, publishNow: true, preview: true } :
        effectiveMode === 'now'     ? { postId, publishNow: true } :
        {
          postId,
          publishNow:  false,
          scheduledAt: new Date(new Date(scheduledAt + 'Z').getTime() - 5.5 * 60 * 60 * 1000).toISOString(),
        }

      const res  = await fetch(publishApiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`)

      if (effectiveMode === 'preview') {
        setPreviewUrl(json.url)
        setPreviewPostId(json.linkedinPostId ?? null)
      } else if (effectiveMode === 'now') {
        setPublishedUrl(json.url)
        setDoneMode('now')
        setDone(true)
        onPublished(json.url)
      } else {
        setDoneMode('schedule')
        setDone(true)
        onScheduled(json.scheduledAt)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish')
    } finally {
      setLoading(false)
    }
  }

  async function handlePromote() {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(publishApiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, publishNow: true, promotePreview: true, linkedinPostId: previewPostId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`)
      setPublishedUrl(json.url)
      setPreviewUrl(null)
      setDoneMode('now')
      setDone(true)
      onPublished(json.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeletePreview() {
    if (!previewPostId) { setPreviewUrl(null); return }
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(deleteApiPath, {
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

  // Reset status from 'scheduled' back to 'approved' — use when a scheduled
  // post was cancelled directly on LinkedIn and SCE needs to reflect that.
  async function handleStatusReset() {
    setResetting(true)
    setError(null)
    try {
      const resetEndpoint = statusResetPath ?? `/api/posts/${postId}`
      const res = await fetch(resetEndpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Reset failed')
      }
      setDone(false)
      onStatusReset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset status')
    } finally {
      setResetting(false)
    }
  }

  // ── Section header ───────────────────────────────────────────────────────
  const SectionHeader = () => (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-ink-800/40 border-b border-ink-800">
      <div className="w-4 h-4 rounded bg-[#0A66C2]/30 flex items-center justify-center shrink-0">
        <Linkedin size={10} className="text-[#0A66C2]" />
      </div>
      <span className="text-xs font-semibold text-cream tracking-wide">Publish to LinkedIn</span>
    </div>
  )

  // ── Error row ────────────────────────────────────────────────────────────
  const ErrorRow = () => error ? (
    <div className="flex items-start gap-2 px-3 py-2 bg-red-900/10 border border-red-800/30 rounded-lg">
      <AlertCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-red-400">{error}</p>
        {error.includes('not connected') && (
          <a href="/dashboard/settings" className="text-xs text-gold-500 hover:underline mt-1 block">
            Connect LinkedIn in Settings →
          </a>
        )}
      </div>
      <button onClick={() => setError(null)} className="shrink-0 text-ink-500 hover:text-ink-300">
        <X size={11} />
      </button>
    </div>
  ) : null

  // ── Persistent "scheduled" state ─────────────────────────────────────────
  // Shown when postStatus is 'scheduled' on mount (survives page navigation).
  if (postStatus === 'scheduled' && !done) {
    return (
      <div className="border border-ink-800 rounded-xl overflow-hidden">
        <SectionHeader />
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-900/15 border border-blue-700/30 rounded-lg">
            <Clock size={13} className="text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-blue-300">Queued for publishing</p>
              {scheduledAtFromDB && (
                <p className="text-xs text-ink-400 mt-0.5">
                  {formatScheduledTime(scheduledAtFromDB)}
                </p>
              )}
            </div>
          </div>

          <ErrorRow />

          <p className="text-xs text-ink-500 leading-relaxed">
            SCE will publish this at 8:00 AM IST on the scheduled date.
          </p>

          <button
            onClick={handleStatusReset}
            disabled={resetting}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-ink-700 text-xs text-ink-400 hover:text-cream hover:border-ink-500 transition-colors disabled:opacity-40"
          >
            {resetting
              ? <><Loader2 size={11} className="animate-spin" /> Resetting…</>
              : <><RotateCcw size={11} /> Cancel & reset status</>
            }
          </button>
        </div>
      </div>
    )
  }

  // ── Published done state ─────────────────────────────────────────────────
  if (done && doneMode === 'now' && publishedUrl) {
    return (
      <div className="border border-ink-800 rounded-xl overflow-hidden">
        <SectionHeader />
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-900/15 border border-emerald-700/30 rounded-lg">
            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
            <p className="text-xs font-medium text-emerald-300">Published to LinkedIn</p>
          </div>
          <a
            href={publishedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs w-full justify-center"
          >
            <ExternalLink size={12} /> View on LinkedIn
          </a>
          <button
            onClick={() => { setDone(false); setPublishedUrl(null) }}
            className="w-full text-xs text-ink-500 hover:text-ink-300 transition-colors py-1"
          >
            Publish again
          </button>
        </div>
      </div>
    )
  }

  // ── Scheduled done state (just scheduled in this session) ────────────────
  if (done && doneMode === 'schedule') {
    return (
      <div className="border border-ink-800 rounded-xl overflow-hidden">
        <SectionHeader />
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-900/15 border border-blue-700/30 rounded-lg">
            <CheckCircle2 size={13} className="text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-blue-300">Queued for publishing</p>
              <p className="text-xs text-ink-400 mt-0.5">
                {new Date(scheduledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at {scheduledAt.slice(11, 16)} IST
              </p>
            </div>
          </div>
          <p className="text-xs text-ink-500 leading-relaxed">
            SCE will publish this at 8:00 AM IST on the scheduled date.
          </p>
          <ErrorRow />
          <button
            onClick={handleStatusReset}
            disabled={resetting}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-ink-700 text-xs text-ink-400 hover:text-cream hover:border-ink-500 transition-colors disabled:opacity-40"
          >
            {resetting
              ? <><Loader2 size={11} className="animate-spin" /> Resetting…</>
              : <><RotateCcw size={11} /> Cancel & reset status</>
            }
          </button>
        </div>
      </div>
    )
  }

  // ── Preview live state ────────────────────────────────────────────────────
  if (previewUrl) {
    return (
      <div className="border border-ink-800 rounded-xl overflow-hidden">
        <SectionHeader />
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-2 px-3 py-2.5 bg-violet-900/15 border border-violet-700/25 rounded-lg">
            <Eye size={13} className="text-violet-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-cream">Preview live on LinkedIn</p>
              <p className="text-xs text-ink-500 mt-0.5">Only visible to you via the direct link</p>
            </div>
          </div>

          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs w-full justify-center"
          >
            <ExternalLink size={12} /> Open preview
          </a>

          <ErrorRow />

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleDeletePreview}
              disabled={deleting || loading}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-ink-700 text-xs text-red-400 hover:text-red-300 hover:border-red-800 transition-colors disabled:opacity-40"
            >
              {deleting
                ? <><Loader2 size={11} className="animate-spin" /> Deleting…</>
                : <><Trash2 size={11} /> Delete</>
              }
            </button>
            <button
              onClick={handlePromote}
              disabled={loading || deleting}
              className="btn-primary justify-center text-xs"
            >
              {loading
                ? <><Loader2 size={11} className="animate-spin" /> Publishing…</>
                : <><Send size={11} /> Publish</>
              }
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Not approved — gated state ────────────────────────────────────────────
  if (!approved) {
    return (
      <div className="border border-ink-800 rounded-xl overflow-hidden">
        <SectionHeader />
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 px-3 py-2.5 bg-ink-800/30 border border-ink-700/40 rounded-lg">
            <Lock size={12} className="text-ink-500 shrink-0" />
            <p className="text-xs text-ink-400">Approve the post first to enable publishing.</p>
          </div>

          {/* Mode tabs — visible but faded */}
          <div className="flex rounded-lg overflow-hidden border border-ink-800 opacity-40 pointer-events-none">
            {(['schedule', 'now', 'preview'] as const).map(key => (
              <div key={key} className="flex-1 py-2 text-center text-xs text-ink-500 capitalize">{key}</div>
            ))}
          </div>

          <div className="h-9 rounded-lg border border-dashed border-ink-800 flex items-center justify-center opacity-40">
            <Clock size={12} className="text-ink-600 mr-1.5" />
            <span className="text-xs text-ink-600">Schedule post</span>
          </div>
        </div>
      </div>
    )
  }

  // ── Main publish controls ─────────────────────────────────────────────────
  return (
    <div className="border border-ink-800 rounded-xl overflow-hidden">
      <SectionHeader />
      <div className="p-4 space-y-3">

        {/* Mode selector */}
        {isDocumentPost ? (
          <div className="flex rounded-lg overflow-hidden border border-ink-700">
            {([
              { key: 'schedule', label: 'Schedule', icon: <Clock size={11} /> },
              { key: 'now',      label: 'Now',      icon: <Send size={11} /> },
            ] as const).map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={cn(
                  'flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5',
                  mode === key ? 'bg-ink-700 text-cream' : 'text-ink-500 hover:text-cream'
                )}
              >
                {icon}{label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex rounded-lg overflow-hidden border border-ink-700">
            {([
              { key: 'preview',  label: 'Preview',  icon: <Eye size={11} /> },
              { key: 'schedule', label: 'Schedule', icon: <Clock size={11} /> },
              { key: 'now',      label: 'Now',      icon: <Send size={11} /> },
            ] as const).map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={cn(
                  'flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5',
                  mode === key ? 'bg-ink-700 text-cream' : 'text-ink-500 hover:text-cream'
                )}
              >
                {icon}{label}
              </button>
            ))}
          </div>
        )}

        {/* Mode content */}
        {effectiveMode === 'preview' && !isDocumentPost && (
          <p className="text-xs text-ink-500 leading-relaxed">
            Posts as <code className="text-ink-300 bg-ink-800 px-1 rounded text-xs">LOGGED_IN</code> —
            only reachable via direct link, never distributed in feeds.
          </p>
        )}

        {effectiveMode === 'schedule' && (
          <p className="text-xs text-ink-500 leading-relaxed">
            SCE publishes at 8:00 AM IST on the scheduled date. Set time before 8:00 AM IST.
          </p>
        )}

        {effectiveMode === 'schedule' && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-400">Publish time (IST)</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="input text-xs w-full font-mono"
            />
            <p className="text-xs text-ink-600">
              Default: {DEFAULT_TIMES[day] ?? '07:30'} IST on {day.charAt(0).toUpperCase() + day.slice(1)}
            </p>
          </div>
        )}

        <ErrorRow />

        {/* Media gate */}
        {!hasRequiredMedia && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-900/15 border border-amber-700/30 rounded-lg">
            <AlertCircle size={12} className="text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">Generate the {mediaLabel} below before publishing.</p>
          </div>
        )}

        {/* Unresolved post-reference warning */}
        {(unresolvedRefCount ?? 0) > 0 && (
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-900/15 border border-amber-700/30 rounded-lg">
            <AlertCircle size={12} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              {unresolvedRefCount} post reference{unresolvedRefCount === 1 ? '' : 's'} not yet published — {unresolvedRefCount === 1 ? 'it' : 'they'} will be removed from the LinkedIn post at publish time.
            </p>
          </div>
        )}

        {/* Action button */}
        <button
          onClick={handleAction}
          disabled={loading || !hasRequiredMedia}
          className="btn-primary w-full justify-center text-sm"
        >
          {loading
            ? <><Loader2 size={14} className="animate-spin" />
                {effectiveMode === 'preview' ? 'Creating preview…' : effectiveMode === 'now' ? 'Publishing…' : 'Scheduling…'}
              </>
            : effectiveMode === 'preview'
              ? <><Eye size={14} /> Preview on LinkedIn</>
              : effectiveMode === 'now'
                ? <><Send size={14} /> Publish now</>
                : <><Clock size={14} /> Schedule to Publish</>
          }
        </button>
      </div>
    </div>
  )
}
