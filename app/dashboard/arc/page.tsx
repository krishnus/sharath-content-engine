'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils/helpers'
import { BookOpen, ChevronRight, Loader2, AlertCircle } from 'lucide-react'

const QUARTER_CONFIG = {
  Q1: { label: 'The Awakening',   colour: 'text-violet-400', bg: 'bg-violet-900/20', border: 'border-violet-700/30', bar: 'bg-violet-500', weeks: [1,13]  },
  Q2: { label: 'The Turning',     colour: 'text-amber-400',  bg: 'bg-amber-900/20',  border: 'border-amber-700/30',  bar: 'bg-amber-500',  weeks: [14,26] },
  Q3: { label: 'The Becoming',    colour: 'text-emerald-400',bg: 'bg-emerald-900/20',border: 'border-emerald-700/30',bar: 'bg-emerald-500',weeks: [27,39] },
  Q4: { label: 'The Integration', colour: 'text-blue-400',   bg: 'bg-blue-900/20',   border: 'border-blue-700/30',   bar: 'bg-blue-500',   weeks: [40,52] },
} as const

type Quarter = keyof typeof QUARTER_CONFIG

type WeekData = {
  id: string; week_number: number; week_start: string
  theme: string | null; quarter: string | null; open_thread: string | null
  status: string
  posts: Array<{
    id: string; status: string; pillar: string
    story_log: { core_insight: string | null; thread_planted: string | null } | null
  }>
}

type ArcResponse = {
  year: number
  currentWeek: number
  openThread: string | null
  arc: { q1_theme: string; q2_theme: string; q3_theme: string; q4_theme: string }
  weekMap: Record<number, WeekData>
}

// Derive display status from DB week data
function deriveStatus(weekNum: number, currentWeek: number, weekData: WeekData | undefined): 'published' | 'in_progress' | 'planned' | 'empty' {
  if (!weekData) return 'empty'
  const posts = weekData.posts ?? []
  if (posts.length === 0) return weekData.status === 'confirmed' ? 'planned' : 'empty'
  const allPublished = posts.every(p => p.status === 'published')
  if (allPublished) return 'published'
  if (weekNum === currentWeek) return 'in_progress'
  const anyApproved = posts.some(p => p.status === 'approved' || p.status === 'published')
  if (anyApproved) return 'in_progress'
  return 'planned'
}

// Best core insight for a week: from story_log of an approved/published post
function getCoreInsight(weekData: WeekData | undefined): string | null {
  if (!weekData) return null
  const post = weekData.posts?.find(p =>
    (p.status === 'published' || p.status === 'approved') && p.story_log?.core_insight
  )
  return post?.story_log?.core_insight ?? null
}

export default function ArcPage() {
  const [data, setData]             = useState<ArcResponse | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [selectedWeek, setSelected] = useState<number | null>(null)

  const fetchArc = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/arc')
      if (!res.ok) throw new Error(`Failed to load arc (${res.status})`)
      const json: ArcResponse = await res.json()
      setData(json)
      setSelected(json.currentWeek)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load arc')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchArc() }, [fetchArc])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={18} className="animate-spin text-ink-400" />
      <span className="text-sm text-ink-400 ml-3">Loading arc...</span>
    </div>
  )

  if (error || !data) return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <div className="card px-4 py-3 border-red-800/30 bg-red-900/10 flex items-center gap-2">
        <AlertCircle size={14} className="text-red-400 shrink-0" />
        <p className="text-sm text-red-400">{error ?? 'No arc data found'}</p>
        <button onClick={fetchArc} className="ml-auto btn-secondary text-xs px-3 py-1.5">Retry</button>
      </div>
    </div>
  )

  const { year, currentWeek, openThread, arc, weekMap } = data

  const selectedWeekData   = selectedWeek ? weekMap[selectedWeek] : undefined
  const selectedStatus     = selectedWeek ? deriveStatus(selectedWeek, currentWeek, selectedWeekData) : null
  const selectedInsight    = getCoreInsight(selectedWeekData)

  // Quarter themes from DB
  const quarterThemes: Record<Quarter, string> = {
    Q1: arc.q1_theme, Q2: arc.q2_theme, Q3: arc.q3_theme, Q4: arc.q4_theme,
  }

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <p className="section-label mb-2">Story Arc</p>
        <h1 className="display-heading text-3xl">The Book of {year}</h1>
        <p className="text-sm text-ink-400 mt-1">52 weeks · 4 chapters · 1 narrative</p>
      </div>

      {/* Open thread */}
      {openThread && (
        <div className="card px-5 py-4 border-l-2 border-gold-500 bg-gold-500/5">
          <p className="section-label mb-1.5">Open thread</p>
          <p className="text-sm text-cream-muted italic">"{openThread}"</p>
          <p className="text-xs text-ink-400 mt-1.5">Honour this thread in the coming week's posts.</p>
        </div>
      )}

      {/* Quarter cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.entries(QUARTER_CONFIG) as Array<[Quarter, typeof QUARTER_CONFIG.Q1]>).map(([q, cfg]) => {
          const publishedInQ = Array.from({ length: cfg.weeks[1] - cfg.weeks[0] + 1 }, (_, i) => cfg.weeks[0] + i)
            .filter(n => deriveStatus(n, currentWeek, weekMap[n]) === 'published').length
          const total = cfg.weeks[1] - cfg.weeks[0] + 1
          return (
            <div key={q} className={cn('card px-4 py-4 border', cfg.border, cfg.bg)}>
              <p className={cn('text-xs font-medium uppercase tracking-wider', cfg.colour)}>{q}</p>
              <p className="text-sm text-cream font-medium mt-1">{cfg.label}</p>
              <p className="text-xs text-ink-500 mt-0.5 leading-snug">{quarterThemes[q].split(' — ')[1]}</p>
              <p className="text-xs text-ink-400 mt-2">{publishedInQ}/{total} published</p>
              <div className="mt-1.5 h-1 bg-ink-700 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full', cfg.bar)} style={{ width: `${(publishedInQ/total)*100}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Timeline + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* 52-week grid */}
        <div className="lg:col-span-3 card p-4">
          <p className="section-label mb-4 px-1">52-Week Timeline</p>
          {(Object.entries(QUARTER_CONFIG) as Array<[Quarter, typeof QUARTER_CONFIG.Q1]>).map(([q, cfg]) => (
            <div key={q} className="mb-5">
              <p className={cn('text-xs font-medium mb-2 px-1', cfg.colour)}>{q} · {cfg.label}</p>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(13, minmax(0, 1fr))', gap:'6px' }}>
                {Array.from({ length: cfg.weeks[1] - cfg.weeks[0] + 1 }, (_, i) => cfg.weeks[0] + i).map(n => (
                  <WeekDot
                    key={n}
                    weekNumber={n}
                    status={deriveStatus(n, currentWeek, weekMap[n])}
                    theme={weekMap[n]?.theme ?? null}
                    isSelected={selectedWeek === n}
                    isCurrent={n === currentWeek}
                    quarterColour={cfg.colour}
                    onClick={() => setSelected(selectedWeek === n ? null : n)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center gap-4 pt-3 border-t border-ink-800 mt-2 px-1">
            {[
              { label:'Published',   cls:'bg-emerald-600' },
              { label:'In Progress', cls:'bg-gold-500' },
              { label:'Planned',     cls:'bg-ink-600' },
              { label:'Empty',       cls:'bg-ink-800 border border-ink-700' },
            ].map(({ label, cls }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={cn('w-2 h-2 rounded-sm', cls)} />
                <span className="text-xs text-ink-500">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {selectedWeek && selectedWeekData ? (
            <div className="card p-5 space-y-4 sticky top-6">
              <div className="flex items-center justify-between">
                <p className="section-label">Week {selectedWeek}</p>
                <StatusBadge status={selectedStatus ?? 'empty'} />
              </div>

              {selectedWeekData.theme
                ? <h3 className="font-display text-lg text-cream">{selectedWeekData.theme}</h3>
                : <p className="font-display text-lg text-ink-500 italic">Theme not yet set</p>
              }

              {selectedWeekData.quarter && (
                <p className="text-xs text-ink-400">
                  {selectedWeekData.quarter} · {quarterThemes[selectedWeekData.quarter as Quarter]?.split(' — ')[0]}
                </p>
              )}

              {selectedInsight && (
                <div className="space-y-1">
                  <p className="section-label">Core Insight</p>
                  <p className="text-sm text-cream-muted">{selectedInsight}</p>
                </div>
              )}

              {selectedWeekData.open_thread && (
                <div className="space-y-1">
                  <p className="section-label">Thread Planted</p>
                  <p className="text-sm text-cream-muted italic">"{selectedWeekData.open_thread}"</p>
                </div>
              )}

              {/* Post status pills */}
              {selectedWeekData.posts?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="section-label">Posts</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedWeekData.posts.map(p => (
                      <span key={p.id} className={cn('text-xs px-2 py-0.5 rounded-full capitalize',
                        p.status === 'published' ? 'bg-emerald-900/30 text-emerald-400' :
                        p.status === 'approved'  ? 'bg-blue-900/30 text-blue-400' :
                        'bg-ink-700 text-ink-400'
                      )}>
                        {p.pillar}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedStatus !== 'empty' && (
                <a href={`/dashboard?week=${selectedWeek}`} className="btn-secondary w-full justify-between text-sm">
                  View posts <ChevronRight size={14} />
                </a>
              )}
            </div>
          ) : selectedWeek && !selectedWeekData ? (
            <div className="card p-5 text-center space-y-3">
              <BookOpen size={24} className="mx-auto text-ink-600" />
              <p className="text-sm text-ink-400">Week {selectedWeek} not yet planned.</p>
              <a href="/dashboard" className="btn-secondary text-sm">Plan this week</a>
            </div>
          ) : (
            <div className="card p-5 text-center">
              <BookOpen size={24} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm text-ink-500">Select a week to see details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WeekDot({ weekNumber, status, theme, isSelected, isCurrent, quarterColour, onClick }: {
  weekNumber: number; status: string; theme: string | null
  isSelected: boolean; isCurrent: boolean; quarterColour: string; onClick: () => void
}) {
  const bg =
    status === 'published'   ? quarterColour.replace('text-','bg-').replace('-400','-600') :
    status === 'in_progress' ? 'bg-gold-500' :
    status === 'planned'     ? 'bg-ink-600' :
    'bg-ink-800'

  // Text colour matches the legend at the bottom of the timeline
  const textColor =
    status === 'published'   ? 'text-white/90' :
    status === 'in_progress' ? 'text-ink-900' :
    status === 'planned'     ? 'text-ink-200' :
    'text-ink-600'

  return (
    <button
      onClick={onClick}
      title={theme ? `Wk ${weekNumber}: ${theme}` : `Week ${weekNumber}`}
      className={cn(
        'aspect-square rounded-sm transition-all duration-150 hover:opacity-80 hover:scale-110',
        'flex items-center justify-center',
        bg,
        isSelected  && 'ring-2 ring-gold-400 ring-offset-1 ring-offset-ink-900',
        isCurrent   && !isSelected && 'ring-1 ring-gold-500/50',
      )}
    >
      <span className={cn('text-[8px] font-semibold leading-none select-none', textColor)}>
        wk{weekNumber}
      </span>
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string,string> = {
    published:   'badge-published',
    in_progress: 'badge-scheduled',
    planned:     'badge-draft',
    empty:       'badge-awaiting',
  }
  const label = status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)
  return <span className={cn('badge', map[status] ?? 'badge-draft')}>{label}</span>
}
