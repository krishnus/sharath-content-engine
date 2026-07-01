'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Loader2, CheckCircle2, Eye, Heart, MessageSquare, RefreshCw } from 'lucide-react'
import { cn, PILLAR_LABELS } from '@/lib/utils/helpers'

type CheckinPost = {
  linkedin_post_fk: string
  linkedin_post_id: string
  linkedin_url: string | null
  published_at: string | null
  day: string | null
  pillar: string | null
  format: string | null
  hook_idea: string | null
  api_likes: number
  api_comments: number
  api_reposts: number
  manual_impressions: number | null
  dm_note: string | null
  has_manual_entry: boolean
}

type EntryState = {
  impressions: string
  dm_note: string
}

export default function AnalyticsCheckinModal({ onClose, onSaved }: {
  onClose: () => void
  onSaved: () => void
}) {
  const [posts, setPosts]     = useState<CheckinPost[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [entries, setEntries] = useState<Record<string, EntryState>>({})

  const fetchPosts = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/analytics/checkin')
      if (!res.ok) throw new Error(`Failed to load (${res.status})`)
      const data = await res.json()
      setPosts(data.posts ?? [])
      // Pre-fill from existing manual entries
      const init: Record<string, EntryState> = {}
      for (const p of data.posts ?? []) {
        init[p.linkedin_post_fk] = {
          impressions: p.manual_impressions != null ? String(p.manual_impressions) : '',
          dm_note:     p.dm_note ?? '',
        }
      }
      setEntries(init)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load posts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  function updateEntry(id: string, field: keyof EntryState, value: string) {
    setEntries(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      const payload = Object.entries(entries)
        .filter(([, v]) => v.impressions && parseInt(v.impressions) > 0)
        .map(([linkedin_post_fk, v]) => ({
          linkedin_post_fk,
          impressions: parseInt(v.impressions),
          dm_note:     v.dm_note || undefined,
        }))

      if (!payload.length) {
        setError('Enter at least one impression count to save')
        return
      }

      const res = await fetch('/api/analytics/checkin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ entries: payload }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? `Save failed (${res.status})`)
      }
      setSaved(true)
      setTimeout(() => { onSaved(); onClose() }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const filledCount = Object.values(entries).filter(v => v.impressions && parseInt(v.impressions) > 0).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-ink-900 rounded-xl border border-ink-700 shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800 shrink-0">
          <div>
            <h2 className="font-display text-lg text-cream font-semibold">Weekly Check-in</h2>
            <p className="text-xs text-ink-400 mt-0.5">Enter impressions from LinkedIn Creator Studio for each published post</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2">
            <X size={16} className="text-ink-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 py-8 justify-center">
              <Loader2 size={16} className="animate-spin text-ink-400" />
              <span className="text-sm text-ink-400">Loading published posts…</span>
            </div>
          )}

          {!loading && posts.length === 0 && (
            <div className="py-8 text-center text-sm text-ink-500">
              No posts published in the last 14 days.
            </div>
          )}

          {!loading && posts.map(post => {
            const entry = entries[post.linkedin_post_fk] ?? { impressions: '', dm_note: '' }
            const pubDate = post.published_at
              ? new Date(post.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              : '—'

            return (
              <div key={post.linkedin_post_fk} className={cn(
                'rounded-lg border p-4 space-y-3',
                post.has_manual_entry ? 'border-ink-700 bg-ink-800/30' : 'border-amber-700/30 bg-amber-900/5'
              )}>
                {/* Post header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-ink-400 mb-1">
                      {pubDate} · {post.day ? post.day.charAt(0).toUpperCase() + post.day.slice(1) : '—'}
                      {post.pillar && (
                        <span className={cn('ml-2',
                          post.pillar === 'vedic_leadership'       ? 'pillar-vedic' :
                          post.pillar === 'banker_coach'            ? 'pillar-banker' :
                          post.pillar === 'coaching_transformation' ? 'pillar-coaching' :
                          post.pillar === 'financial_intelligence'  ? 'pillar-financial' :
                          'pillar-inner'
                        )}>
                          {PILLAR_LABELS[post.pillar] ?? post.pillar}
                        </span>
                      )}
                    </p>
                    {post.hook_idea && (
                      <p className="text-sm text-cream-muted leading-snug line-clamp-2">{post.hook_idea}</p>
                    )}
                  </div>
                  {post.has_manual_entry && (
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                  )}
                </div>

                {/* API-pulled metrics (read-only) */}
                <div className="flex items-center gap-4 text-xs text-ink-500">
                  <span className="flex items-center gap-1">
                    <Heart size={11} className="text-pink-400" />{post.api_likes} likes
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare size={11} className="text-amber-400" />{post.api_comments} comments
                  </span>
                  {post.api_reposts > 0 && (
                    <span className="flex items-center gap-1">
                      <RefreshCw size={11} className="text-emerald-400" />{post.api_reposts} reposts
                    </span>
                  )}
                  <span className="text-ink-600 italic">from LinkedIn API</span>
                </div>

                {/* Manual inputs */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-ink-400 mb-1.5 flex items-center gap-1">
                      <Eye size={10} /> Impressions (from Creator Studio)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 2400"
                      value={entry.impressions}
                      onChange={e => updateEntry(post.linkedin_post_fk, 'impressions', e.target.value)}
                      className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-sm text-cream placeholder-ink-600 focus:outline-none focus:border-gold-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-ink-400 mb-1.5">DMs / notable conversations (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 2 DMs from senior bankers"
                      value={entry.dm_note}
                      onChange={e => updateEntry(post.linkedin_post_fk, 'dm_note', e.target.value)}
                      className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-sm text-cream placeholder-ink-600 focus:outline-none focus:border-gold-500/50"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-ink-800 flex items-center justify-between shrink-0">
          {error && <p className="text-xs text-red-400">{error}</p>}
          {!error && saved && (
            <p className="text-xs text-emerald-400 flex items-center gap-1">
              <CheckCircle2 size={12} /> Saved!
            </p>
          )}
          {!error && !saved && (
            <p className="text-xs text-ink-500">
              {filledCount > 0 ? `${filledCount} post${filledCount !== 1 ? 's' : ''} ready to save` : 'Enter impression counts above'}
            </p>
          )}
          <div className="flex gap-3 ml-auto">
            <button onClick={onClose} className="btn-secondary text-sm px-4 py-2">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || saved || filledCount === 0}
              className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-50"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              {saved ? 'Saved!' : `Save ${filledCount > 0 ? filledCount : ''} entr${filledCount === 1 ? 'y' : 'ies'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
