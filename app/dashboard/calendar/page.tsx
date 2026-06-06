'use client'

import { useState, useEffect, useCallback } from 'react'
import { addMonths, subMonths, format, startOfMonth, getDay, getDaysInMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import { cn, PILLAR_LABELS, FORMAT_LABELS } from '@/lib/utils/helpers'
import Link from 'next/link'

type CalendarEntry = {
  date: string
  weekId: string
  weekTheme: string | null
  weekNumber: number
  post: {
    id: string; day: string; pillar: string; format: string
    status: string; hook_idea: string | null; target_word_count: number | null
  }
}

const STATUS_COLOUR: Record<string, string> = {
  published:          'bg-emerald-100 text-emerald-800',
  approved:           'bg-blue-100 text-blue-800',
  edited:             'bg-violet-100 text-violet-800',
  draft:              'bg-stone-100 text-stone-600',
  awaiting_market_data: 'bg-amber-100 text-amber-700',
  scheduled:          'bg-sky-100 text-sky-700',
}

const PILLAR_DOT: Record<string, string> = {
  vedic_leadership:        'bg-violet-400',
  banker_coach:            'bg-blue-400',
  coaching_transformation: 'bg-emerald-400',
  financial_intelligence:  'bg-amber-400',
  inner_work:              'bg-pink-400',
}

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

// Returns 0=Mon … 6=Sun for a date
function getMondayBasedDay(date: Date): number {
  const d = getDay(date) // 0=Sun
  return d === 0 ? 6 : d - 1
}

export default function CalendarPage() {
  const [current, setCurrent]         = useState(new Date())
  const [entries, setEntries]         = useState<CalendarEntry[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [selectedPost, setSelected]   = useState<CalendarEntry | null>(null)

  const year  = current.getFullYear()
  const month = current.getMonth() + 1

  const fetchMonth = useCallback(async (y: number, m: number) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/calendar?year=${y}&month=${m}`)
      if (!res.ok) throw new Error(`Failed to load calendar (${res.status})`)
      const json = await res.json()
      setEntries(json.entries ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMonth(year, month) }, [year, month, fetchMonth])

  const prev = () => setCurrent(d => subMonths(d, 1))
  const next = () => setCurrent(d => addMonths(d, 1))

  // Build entry lookup by date string
  const byDate: Record<string, CalendarEntry[]> = {}
  for (const e of entries) {
    if (!byDate[e.date]) byDate[e.date] = []
    byDate[e.date].push(e)
  }

  // Build calendar grid
  const firstDay  = startOfMonth(current)
  const startOffset = getMondayBasedDay(firstDay)  // blanks before day 1
  const daysInMonth = getDaysInMonth(current)
  const today = format(new Date(), 'yyyy-MM-dd')

  const cells: Array<null | number> = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad to complete final row
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          {/* calendar icon matching screenshot */}
          <div className="w-9 h-9 rounded-lg border border-ink-700 flex items-center justify-center text-lg">
            📅
          </div>
          <h1 className="display-heading text-3xl">Content Calendar</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={prev} className="btn-secondary px-4 py-2 text-sm">
            ← Prev
          </button>
          <span className="font-display text-xl text-cream min-w-[180px] text-center">
            {format(current, 'MMMM yyyy')}
          </span>
          <button onClick={next} className="btn-secondary px-4 py-2 text-sm">
            Next →
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card px-4 py-3 border-red-800/30 bg-red-900/10 flex items-center gap-2 mb-6">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => fetchMonth(year, month)} className="ml-auto btn-secondary text-xs px-3 py-1.5">Retry</button>
        </div>
      )}

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-ink-500 tracking-wider py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={18} className="animate-spin text-ink-400" />
          <span className="text-sm text-ink-400 ml-3">Loading...</span>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`blank-${i}`} className="min-h-[100px]" />
            }

            const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            const isToday = dateStr === today
            const dayEntries = byDate[dateStr] ?? []

            return (
              <div
                key={dateStr}
                className={cn(
                  'min-h-[100px] rounded-xl border p-2 transition-shadow',
                  'bg-ink-900',
                  isToday ? 'border-gold-500 border-2' : 'border-ink-700 hover:border-ink-600',
                )}
              >
                {/* Date number */}
                <p className={cn(
                  'text-xs font-semibold mb-1.5',
                  isToday ? 'text-gold-400' : 'text-ink-400'
                )}>
                  {day}
                </p>

                {/* Post chips */}
                <div className="space-y-1">
                  {dayEntries.map((entry, ei) => (
                    <button
                      key={ei}
                      onClick={() => setSelected(selectedPost?.post.id === entry.post.id ? null : entry)}
                      className={cn(
                        'w-full text-left px-1.5 py-1 rounded-md text-xs font-medium truncate transition-colors',
                        STATUS_COLOUR[entry.post.status] ?? 'bg-stone-100 text-stone-600',
                        selectedPost?.post.id === entry.post.id && 'ring-1 ring-offset-1 ring-gold-400 ring-offset-ink-900',
                      )}
                      title={entry.post.hook_idea ?? PILLAR_LABELS[entry.post.pillar] ?? entry.post.pillar}
                    >
                      <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1 mb-px', PILLAR_DOT[entry.post.pillar])} />
                      {entry.post.hook_idea
                        ? entry.post.hook_idea.substring(0, 22) + (entry.post.hook_idea.length > 22 ? '…' : '')
                        : (PILLAR_LABELS[entry.post.pillar] ?? entry.post.pillar).substring(0, 22) + '…'
                      }
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail drawer — slides in from bottom when a post is selected */}
      {selectedPost && (
        <div className="fixed bottom-0 left-60 right-0 bg-ink-900 border-t border-ink-700 shadow-2xl z-40 animate-in slide-in-from-bottom-2 duration-200">
          <div className="max-w-6xl mx-auto px-8 py-5 flex items-start gap-8">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <span className={cn('badge border text-xs',
                  selectedPost.post.pillar === 'vedic_leadership'       ? 'text-violet-400 bg-violet-900/20 border-violet-700/30' :
                  selectedPost.post.pillar === 'banker_coach'            ? 'text-blue-400 bg-blue-900/20 border-blue-700/30' :
                  selectedPost.post.pillar === 'coaching_transformation' ? 'text-emerald-400 bg-emerald-900/20 border-emerald-700/30' :
                  selectedPost.post.pillar === 'financial_intelligence'  ? 'text-amber-400 bg-amber-900/20 border-amber-700/30' :
                  'text-pink-400 bg-pink-900/20 border-pink-700/30'
                )}>
                  {PILLAR_LABELS[selectedPost.post.pillar] ?? selectedPost.post.pillar}
                </span>
                <span className="text-xs text-ink-400 capitalize">{selectedPost.post.day}</span>
                <span className="text-xs text-ink-500">{FORMAT_LABELS[selectedPost.post.format] ?? selectedPost.post.format}</span>
                <span className={cn('text-xs px-2 py-0.5 rounded-full capitalize font-medium',
                  STATUS_COLOUR[selectedPost.post.status] ?? 'bg-stone-100 text-stone-600'
                )}>
                  {selectedPost.post.status.replace(/_/g,' ')}
                </span>
              </div>
              {selectedPost.weekTheme && (
                <p className="text-xs text-ink-500 mb-1">
                  Wk {selectedPost.weekNumber} — {selectedPost.weekTheme}
                </p>
              )}
              <p className="text-sm text-cream">
                {selectedPost.post.hook_idea ?? 'No hook idea set yet'}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {selectedPost.post.status !== 'published' && (
                <Link
                  href={`/dashboard/drafts/${selectedPost.post.id}`}
                  className="btn-primary text-sm"
                >
                  {selectedPost.post.status === 'draft' ? 'Generate' :
                   selectedPost.post.status === 'edited' ? 'Review' :
                   'Open'
                  }
                </Link>
              )}
              <button onClick={() => setSelected(null)} className="btn-ghost p-2">
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pillar legend */}
      <div className="flex items-center gap-6 mt-6 pt-4 border-t border-ink-800">
        {Object.entries(PILLAR_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={cn('w-2 h-2 rounded-full', PILLAR_DOT[key])} />
            <span className="text-xs text-ink-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
