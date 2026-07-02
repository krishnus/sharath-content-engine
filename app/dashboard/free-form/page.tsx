'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PenLine, Loader2, ArrowRight, Clock, CheckCheck, FileText, AlignLeft, LayoutGrid, TrendingUp } from 'lucide-react'
import { cn, FORMAT_LABELS, PILLAR_LABELS } from '@/lib/utils/helpers'
import type { PostFormat, PostPillar } from '@/lib/supabase/types'

const FORMATS: { value: PostFormat; label: string; desc: string }[] = [
  { value: 'text_post',         label: 'Text Post',     desc: '180–250 words' },
  { value: 'long_form_article', label: 'Article',       desc: '900–1100 words' },
  { value: 'carousel',          label: 'Carousel',      desc: '8–10 slides' },
  { value: 'market_insights',   label: 'Market Post',   desc: '180–250 words' },
]

const PILLARS: { value: PostPillar; label: string }[] = [
  { value: 'vedic_leadership',       label: PILLAR_LABELS['vedic_leadership'] },
  { value: 'banker_coach',           label: PILLAR_LABELS['banker_coach'] },
  { value: 'coaching_transformation', label: PILLAR_LABELS['coaching_transformation'] },
  { value: 'financial_intelligence', label: PILLAR_LABELS['financial_intelligence'] },
  { value: 'inner_work',             label: PILLAR_LABELS['inner_work'] },
]

type RecentPost = {
  id: string
  user_prompt: string
  format: string
  pillar: string | null
  status: string
  created_at: string
}

const STATUS_BADGE: Record<string, string> = {
  draft:         'badge-draft',
  edited:        'badge-edited',
  approved:      'badge-approved',
  published:     'badge-published',
  scheduled:     'badge-scheduled',
  publish_failed:'badge-draft',
}

const FORMAT_ICON: Record<string, typeof FileText> = {
  long_form_article: FileText,
  text_post:         AlignLeft,
  carousel:          LayoutGrid,
  market_insights:   TrendingUp,
}

export default function FreeFormHubPage() {
  const router = useRouter()

  const [prompt,   setPrompt]   = useState('')
  const [format,   setFormat]   = useState<PostFormat>('text_post')
  const [pillar,   setPillar]   = useState<PostPillar | ''>('')
  const [creating, setCreating] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [recent,   setRecent]   = useState<RecentPost[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    fetch('/api/free-form/posts')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.posts) setRecent(data.posts) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (prompt.trim().length < 20) {
      setError('Please write at least 20 characters describing what you want.')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/free-form/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userPrompt: prompt.trim(), format, pillar: pillar || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create post')
      router.push(`/dashboard/free-form/${json.post.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post')
      setCreating(false)
    }
  }

  const promptWords = prompt.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">

      {/* ── Header ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-lg bg-violet-900/30 border border-violet-700/30 flex items-center justify-center">
            <PenLine size={16} className="text-violet-400" />
          </div>
          <h1 className="text-xl font-display font-semibold text-cream">Random Post</h1>
        </div>
        <p className="text-sm text-ink-400 ml-11">
          Write a brief for any post — outside the weekly arc. Uses all your voice rules.
        </p>
      </div>

      {/* ── Create form ─────────────────────────────────────── */}
      <form onSubmit={handleCreate} className="card p-6 space-y-5">

        {/* Prompt */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-ink-300 uppercase tracking-wide">
            What do you want to post?
          </label>
          <textarea
            value={prompt}
            onChange={e => { setPrompt(e.target.value); setError(null) }}
            rows={5}
            placeholder="e.g. A text post sharing the lesson I learnt when my HNI client panicked during the 2020 market crash — the real issue wasn't money, it was identity. Vedic perspective on wealth and self-worth."
            className="input w-full text-sm leading-relaxed resize-none"
            disabled={creating}
          />
          <div className="flex items-center justify-between">
            <span className={cn('text-xs', prompt.trim().length < 20 ? 'text-ink-600' : 'text-ink-500')}>
              {prompt.trim().length} chars · {promptWords} words
            </span>
            <span className="text-xs text-ink-600">min 20 chars</span>
          </div>
        </div>

        {/* Format */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-ink-300 uppercase tracking-wide">Format</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FORMATS.map(f => {
              const Icon = FORMAT_ICON[f.value] ?? AlignLeft
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFormat(f.value)}
                  className={cn(
                    'flex flex-col items-start px-3 py-2.5 rounded-lg border text-left transition-all',
                    format === f.value
                      ? 'border-gold-600 bg-gold-900/15 text-cream'
                      : 'border-ink-700 text-ink-400 hover:border-ink-600 hover:text-cream'
                  )}
                >
                  <Icon size={13} className="mb-1.5 opacity-70" />
                  <span className="text-xs font-medium leading-tight">{f.label}</span>
                  <span className="text-xs text-ink-500 leading-tight mt-0.5">{f.desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Pillar (optional) */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-ink-300 uppercase tracking-wide">Pillar</label>
            <span className="text-xs text-ink-600">(optional)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPillar('')}
              className={cn(
                'px-3 py-1.5 rounded-lg border text-xs transition-all',
                pillar === '' ? 'border-ink-600 bg-ink-700 text-cream' : 'border-ink-700 text-ink-500 hover:text-cream'
              )}
            >
              Auto-select
            </button>
            {PILLARS.map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPillar(p.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg border text-xs transition-all',
                  pillar === p.value
                    ? 'border-gold-600 bg-gold-900/15 text-cream'
                    : 'border-ink-700 text-ink-500 hover:text-cream'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-400 bg-red-900/10 border border-red-800/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={creating || prompt.trim().length < 20}
          className="btn-primary w-full justify-center text-sm"
        >
          {creating
            ? <><Loader2 size={15} className="animate-spin" /> Creating…</>
            : <><PenLine size={15} /> Create &amp; Generate</>
          }
        </button>
      </form>

      {/* ── Recent posts ────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-ink-400 uppercase tracking-wider">Recent posts</h2>

        {loading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 size={14} className="animate-spin text-ink-400" />
            <span className="text-sm text-ink-500">Loading…</span>
          </div>
        ) : recent.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-ink-500">No random posts yet — create your first one above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map(post => {
              const Icon = FORMAT_ICON[post.format] ?? AlignLeft
              const created = new Date(post.created_at)
              const dateStr = created.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              return (
                <button
                  key={post.id}
                  onClick={() => router.push(`/dashboard/free-form/${post.id}`)}
                  className="w-full card px-4 py-3 flex items-start gap-3 text-left hover:bg-ink-800/50 transition-colors"
                >
                  <Icon size={14} className="text-ink-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-cream-muted leading-snug line-clamp-2">
                      {post.user_prompt}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs text-ink-500">{FORMAT_LABELS[post.format] ?? post.format}</span>
                      {post.pillar && (
                        <>
                          <span className="text-ink-700">·</span>
                          <span className="text-xs text-ink-500">{PILLAR_LABELS[post.pillar] ?? post.pillar}</span>
                        </>
                      )}
                      <span className="text-ink-700">·</span>
                      <div className="flex items-center gap-1 text-xs text-ink-600">
                        <Clock size={10} />
                        {dateStr}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn('badge text-xs', STATUS_BADGE[post.status] ?? 'badge-draft')}>
                      {post.status === 'published'
                        ? <><CheckCheck size={9} className="mr-1" />Published</>
                        : post.status
                      }
                    </span>
                    <ArrowRight size={13} className="text-ink-600" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
