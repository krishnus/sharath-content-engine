'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils/helpers'
import { BookOpen, ChevronRight } from 'lucide-react'

const QUARTER_CONFIG = {
  Q1: { label: 'The Awakening',   colour: 'text-violet-400', bg: 'bg-violet-900/20', border: 'border-violet-700/30', weeks: [1,13]  },
  Q2: { label: 'The Turning',     colour: 'text-amber-400',  bg: 'bg-amber-900/20',  border: 'border-amber-700/30',  weeks: [14,26] },
  Q3: { label: 'The Becoming',    colour: 'text-emerald-400',bg: 'bg-emerald-900/20',border: 'border-emerald-700/30',weeks: [27,39] },
  Q4: { label: 'The Integration', colour: 'text-blue-400',   bg: 'bg-blue-900/20',   border: 'border-blue-700/30',   weeks: [40,52] },
} as const

// Mock arc data — replace with Supabase query
const MOCK_ARC = {
  year: 2026,
  currentWeek: 20,
  openThread: 'There is a dimension of courage I have not yet addressed — what happens to those who stay.',
  quarters: {
    Q1: { theme: 'The Awakening — recognition, discomfort, honest questioning' },
    Q2: { theme: 'The Turning — decision, courage, the moment of change' },
    Q3: { theme: 'The Becoming — identity shift, new strengths, unexpected losses' },
    Q4: { theme: 'The Integration — wisdom, legacy, what the whole journey means' },
  },
  weeks: Array.from({ length: 52 }, (_, i) => ({
    weekNumber: i + 1,
    theme: i < 19
      ? ['Walking Away', 'The Crossroads', 'Risk and Discipline', 'Letting Go', 'The Inner Critic',
         'Surrender as Strategy', 'Board-Level Presence', 'The Parent Inside the Leader', 'Māyā',
         'Grief as a Teacher', 'Patience as Power', 'Righteous Anger', 'Self-Knowledge',
         'The Empty Boat', 'Healing the Young Self', 'Manipulation vs Influence', 'Quiet Sacrifices',
         'The Hidden Game', 'Portfolio Thinking'][i]
      : i === 19
        ? 'The Courage to Walk Away — Ranchhordas'
        : null,
    status: i < 19 ? 'published' : i === 19 ? 'in_progress' : i < 21 ? 'planned' : 'empty',
    coreInsight: i < 19 ? 'Sample insight for this week...' : null,
  })),
}

export default function ArcPage() {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(MOCK_ARC.currentWeek)
  const arc = MOCK_ARC

  const selectedWeekData = selectedWeek
    ? arc.weeks.find(w => w.weekNumber === selectedWeek)
    : null

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <p className="section-label mb-2">Story Arc</p>
        <h1 className="display-heading text-3xl">The Book of {arc.year}</h1>
        <p className="text-sm text-ink-400 mt-1">52 weeks · 4 chapters · 1 narrative</p>
      </div>

      {/* Open thread callout */}
      {arc.openThread && (
        <div className="card px-5 py-4 border-l-2 border-gold-500 bg-gold-500/5">
          <p className="section-label mb-1.5">Open thread from last week</p>
          <p className="text-sm text-cream-muted italic">"{arc.openThread}"</p>
          <p className="text-xs text-ink-400 mt-1.5">This thread should be honoured in the coming week's posts.</p>
        </div>
      )}

      {/* Quarter tabs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.entries(QUARTER_CONFIG) as Array<[keyof typeof QUARTER_CONFIG, typeof QUARTER_CONFIG.Q1]>)
          .map(([q, cfg]) => {
            const publishedInQ = arc.weeks
              .filter(w => w.weekNumber >= cfg.weeks[0] && w.weekNumber <= cfg.weeks[1])
              .filter(w => w.status === 'published').length
            const totalInQ = cfg.weeks[1] - cfg.weeks[0] + 1

            return (
              <div key={q} className={cn('card px-4 py-4 border', cfg.border, cfg.bg)}>
                <p className={cn('text-xs font-medium uppercase tracking-wider', cfg.colour)}>{q}</p>
                <p className="text-sm text-cream font-medium mt-1">{cfg.label}</p>
                <p className="text-xs text-ink-400 mt-2">{publishedInQ}/{totalInQ} published</p>
                <div className="mt-2 h-1 bg-ink-700 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', cfg.colour.replace('text-', 'bg-').replace('-400', '-500'))}
                    style={{ width: `${(publishedInQ / totalInQ) * 100}%` }}
                  />
                </div>
              </div>
            )
          })}
      </div>

      {/* Two-column layout: timeline + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Timeline grid */}
        <div className="lg:col-span-3 card p-4">
          <p className="section-label mb-4 px-1">52-Week Timeline</p>

          {/* Quarter sections */}
          {(Object.entries(QUARTER_CONFIG) as Array<[keyof typeof QUARTER_CONFIG, typeof QUARTER_CONFIG.Q1]>)
            .map(([q, cfg]) => (
              <div key={q} className="mb-5">
                <p className={cn('text-xs font-medium mb-2 px-1', cfg.colour)}>{q} · {cfg.label}</p>
                <div className="grid grid-cols-7 gap-1.5 lg:grid-cols-13-custom"
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}
                >
                  {arc.weeks
                    .filter(w => w.weekNumber >= cfg.weeks[0] && w.weekNumber <= cfg.weeks[1])
                    .map(week => (
                      <WeekDot
                        key={week.weekNumber}
                        week={week}
                        isSelected={selectedWeek === week.weekNumber}
                        isCurrent={week.weekNumber === arc.currentWeek}
                        quarterColour={cfg.colour}
                        onClick={() => setSelectedWeek(
                          selectedWeek === week.weekNumber ? null : week.weekNumber
                        )}
                      />
                    ))
                  }
                </div>
              </div>
            ))}

          {/* Legend */}
          <div className="flex items-center gap-4 pt-3 border-t border-ink-800 mt-2 px-1">
            {[
              { status: 'published',   label: 'Published',   cls: 'bg-emerald-500' },
              { status: 'in_progress', label: 'In Progress', cls: 'bg-gold-500' },
              { status: 'planned',     label: 'Planned',     cls: 'bg-ink-600' },
              { status: 'empty',       label: 'Empty',       cls: 'bg-ink-800 border border-ink-700' },
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
          {selectedWeekData ? (
            <div className="card p-5 space-y-4 sticky top-6">
              <div className="flex items-center justify-between">
                <p className="section-label">Week {selectedWeekData.weekNumber}</p>
                <span className={cn(
                  'badge',
                  selectedWeekData.status === 'published'   && 'badge-published',
                  selectedWeekData.status === 'in_progress' && 'badge-scheduled',
                  selectedWeekData.status === 'planned'     && 'badge-draft',
                  selectedWeekData.status === 'empty'       && 'badge-awaiting',
                )}>
                  {selectedWeekData.status === 'in_progress' ? 'In Progress' :
                   selectedWeekData.status.charAt(0).toUpperCase() + selectedWeekData.status.slice(1)}
                </span>
              </div>

              {selectedWeekData.theme
                ? <h3 className="font-display text-lg text-cream">{selectedWeekData.theme}</h3>
                : <p className="font-display text-lg text-ink-500 italic">Theme not yet set</p>
              }

              {selectedWeekData.coreInsight && (
                <div className="space-y-1">
                  <p className="section-label">Core Insight</p>
                  <p className="text-sm text-cream-muted">{selectedWeekData.coreInsight}</p>
                </div>
              )}

              {selectedWeekData.status !== 'empty' && (
                <a
                  href={`/dashboard?week=${selectedWeekData.weekNumber}`}
                  className="btn-secondary w-full justify-between text-sm"
                >
                  View posts
                  <ChevronRight size={14} />
                </a>
              )}
            </div>
          ) : (
            <div className="card p-5 text-center text-ink-500">
              <BookOpen size={24} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Select a week to see details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WeekDot({
  week, isSelected, isCurrent, quarterColour, onClick
}: {
  week: { weekNumber: number; status: string; theme: string | null }
  isSelected: boolean
  isCurrent: boolean
  quarterColour: string
  onClick: () => void
}) {
  const bgClass =
    week.status === 'published'   ? quarterColour.replace('text-', 'bg-').replace('-400', '-600') :
    week.status === 'in_progress' ? 'bg-gold-500' :
    week.status === 'planned'     ? 'bg-ink-600' :
    'bg-ink-800'

  return (
    <button
      onClick={onClick}
      title={week.theme ?? `Week ${week.weekNumber}`}
      className={cn(
        'aspect-square rounded-sm transition-all duration-150',
        bgClass,
        isSelected && 'ring-2 ring-gold-400 ring-offset-1 ring-offset-ink-900',
        isCurrent && !isSelected && 'ring-1 ring-gold-500/50',
        'hover:opacity-80 hover:scale-110',
      )}
    />
  )
}
