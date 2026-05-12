'use client'

import { useState, useCallback } from 'react'
import {
  X, ChevronRight, ChevronLeft, Loader2,
  CheckCircle2, Sparkles, RotateCcw, Pencil,
} from 'lucide-react'
import { cn, PILLAR_LABELS, FORMAT_LABELS, formatDay } from '@/lib/utils/helpers'
import { getForwardPlanWeeks, getQuarter } from '@/lib/utils/helpers'

// ── Types ──────────────────────────────────────────────────────────────
type ThemeOption = {
  theme: string
  rationale: string
  primary_pillar: string
  primary_audience: string
  open_thread_link: string | null
}

type PlanSlot = {
  day: string
  pillar: string
  format: string
  narrative_position: string
  target_audience: string
  target_word_count: number
  hook_idea: string
}

type WeekMeta = {
  weekNumber: number
  year: number
  start: Date
}

type WeekState = {
  meta: WeekMeta
  weekId: string | null
  proposedThemes: ThemeOption[]
  selectedTheme: ThemeOption | null
  customTheme: string
  isCustom: boolean
  plan: PlanSlot[]
  quarterTheme: string
  quarter: string
}

type Step = 'proposing' | 'themes' | 'confirming' | 'plans' | 'done'

// ── Quarter themes ─────────────────────────────────────────────────────
const QUARTER_THEMES: Record<string, string> = {
  Q1: 'The Awakening — recognition, discomfort, honest questioning',
  Q2: 'The Turning — decision, courage, the moment of change',
  Q3: 'The Becoming — identity shift, new strengths, unexpected losses',
  Q4: 'The Integration — wisdom, legacy, what the whole journey means',
}

// ── Main component ─────────────────────────────────────────────────────
export default function SundaySessionModal({
  onClose,
  onComplete,
}: {
  onClose: () => void
  onComplete: () => void
}) {
  const forwardWeeks = getForwardPlanWeeks(new Date())
  const [step, setStep]   = useState<Step>('proposing')
  const [error, setError] = useState<string | null>(null)
  const [weeks, setWeeks] = useState<WeekState[]>(
    forwardWeeks.map(fw => ({
      meta: fw,
      weekId: null,
      proposedThemes: [],
      selectedTheme: null,
      customTheme: '',
      isCustom: false,
      plan: [],
      quarter: getQuarter(new Date(fw.start)),
      quarterTheme: QUARTER_THEMES[getQuarter(new Date(fw.start))],
    }))
  )

  // ── Step 1: Propose themes for both weeks ──────────────────────────
  const proposeThemes = useCallback(async () => {
    setStep('proposing')
    setError(null)

    try {
      const results = await Promise.all(
        weeks.map(w =>
          fetch('/api/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'propose_themes',
              weekNumber: w.meta.weekNumber,
              year: w.meta.year,
              quarter: w.quarter,
              quarterTheme: w.quarterTheme,
            }),
          }).then(r => r.json())
        )
      )

      setWeeks(prev => prev.map((w, i) => ({
        ...w,
        proposedThemes: results[i]?.themes ?? [],
      })))
      setStep('themes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to propose themes')
      setStep('themes')
    }
  }, [weeks])

  // Auto-propose on mount
  useState(() => { proposeThemes() })

  // ── Step 2: Generate plans for confirmed themes ────────────────────
  const generatePlans = useCallback(async () => {
    setStep('confirming')
    setError(null)

    try {
      const results = await Promise.all(
        weeks.map(async w => {
          const theme = w.isCustom
            ? w.customTheme
            : w.selectedTheme?.theme ?? ''

          if (!theme) return { weekId: null, plan: [] }

          // First ensure the week record exists in Supabase
          const createRes = await fetch('/api/weeks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              weekNumber: w.meta.weekNumber,
              year: w.meta.year,
              quarter: w.quarter,
              theme,
            }),
          })
          const { weekId } = await createRes.json()

          // Then generate the plan
          const planRes = await fetch('/api/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'generate_plan',
              weekId,
              theme,
            }),
          })
          const { plan } = await planRes.json()
          return { weekId, plan: plan ?? [] }
        })
      )

      setWeeks(prev => prev.map((w, i) => ({
        ...w,
        weekId: results[i]?.weekId ?? null,
        plan: results[i]?.plan ?? [],
      })))
      setStep('plans')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate plans')
      setStep('plans')
    }
  }, [weeks])

  const allThemesSelected = weeks.every(w =>
    (w.isCustom && w.customTheme.trim().length > 0) || w.selectedTheme !== null
  )

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden animate-in">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800 shrink-0">
          <div>
            <p className="section-label mb-0.5">Sunday Session</p>
            <h2 className="font-display text-xl text-cream">
              {step === 'proposing' || step === 'themes'
                ? 'Choose your themes'
                : step === 'confirming'
                  ? 'Generating your plans...'
                  : step === 'plans'
                    ? 'Review your 2-week plan'
                    : 'Session complete'}
            </h2>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 mr-2">
              {(['themes', 'plans', 'done'] as const).map((s, i) => (
                <div
                  key={s}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    (step === s || (step === 'proposing' && s === 'themes') || (step === 'confirming' && s === 'plans'))
                      ? 'w-6 bg-gold-500'
                      : step === 'done' || (step === 'plans' && i < 2)
                        ? 'w-4 bg-gold-500/40'
                        : 'w-4 bg-ink-700'
                  )}
                />
              ))}
            </div>
            <button onClick={onClose} className="btn-ghost p-2">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Proposing themes (loading) ───────────────────── */}
          {step === 'proposing' && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
                <Loader2 size={20} className="text-gold-500 animate-spin" />
              </div>
              <p className="text-cream text-sm">Proposing themes for your next 2 weeks...</p>
              <p className="text-xs text-ink-500">Reading your narrative arc and recent posts</p>
            </div>
          )}

          {/* ── Theme selection ──────────────────────────────── */}
          {step === 'themes' && (
            <div className="p-6 space-y-8">
              {error && (
                <div className="card px-4 py-3 border-red-800/30 bg-red-900/10">
                  <p className="text-sm text-red-400">{error}</p>
                  <button onClick={proposeThemes} className="btn-secondary text-xs mt-2">
                    <RotateCcw size={12} /> Retry
                  </button>
                </div>
              )}

              {weeks.map((w, wi) => (
                <WeekThemeSelector
                  key={wi}
                  week={w}
                  weekIndex={wi}
                  onSelectTheme={theme => setWeeks(prev => prev.map((pw, i) =>
                    i === wi ? { ...pw, selectedTheme: theme, isCustom: false } : pw
                  ))}
                  onCustomTheme={val => setWeeks(prev => prev.map((pw, i) =>
                    i === wi ? { ...pw, customTheme: val, isCustom: true, selectedTheme: null } : pw
                  ))}
                />
              ))}
            </div>
          )}

          {/* ── Generating plans (loading) ───────────────────── */}
          {step === 'confirming' && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
                <Loader2 size={20} className="text-gold-500 animate-spin" />
              </div>
              <p className="text-cream text-sm">Generating your 2-week plan...</p>
              <p className="text-xs text-ink-500">Creating 6 posts per week with narrative continuity</p>
            </div>
          )}

          {/* ── Plan review ──────────────────────────────────── */}
          {step === 'plans' && (
            <div className="p-6 space-y-8">
              {error && (
                <div className="card px-4 py-3 border-red-800/30 bg-red-900/10">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {weeks.map((w, wi) => (
                <WeekPlanReview key={wi} week={w} weekIndex={wi} />
              ))}
            </div>
          )}

          {/* ── Done ────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
              <div className="w-12 h-12 rounded-xl bg-emerald-900/30 border border-emerald-700/30 flex items-center justify-center">
                <CheckCircle2 size={20} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-cream font-medium">Your 2-week plan is ready</p>
                <p className="text-sm text-ink-400 mt-1">
                  {weeks.reduce((acc, w) => acc + w.plan.filter(p => p.day !== 'saturday').length, 0)} posts planned across 2 weeks
                </p>
              </div>
              <p className="text-xs text-ink-500 max-w-xs">
                Go to each post and click "Generate" to create the draft.
                Saturday posts are generated on the day.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-ink-800 shrink-0">
          <button
            onClick={onClose}
            className="btn-ghost text-sm"
          >
            {step === 'done' ? 'Close' : 'Cancel'}
          </button>

          <div className="flex items-center gap-3">
            {step === 'themes' && (
              <>
                <button
                  onClick={proposeThemes}
                  className="btn-secondary text-sm"
                >
                  <RotateCcw size={14} />
                  New proposals
                </button>
                <button
                  onClick={generatePlans}
                  disabled={!allThemesSelected}
                  className="btn-primary"
                >
                  Generate plans
                  <ChevronRight size={15} />
                </button>
              </>
            )}

            {step === 'plans' && (
              <>
                <button
                  onClick={() => setStep('themes')}
                  className="btn-secondary text-sm"
                >
                  <ChevronLeft size={14} />
                  Back to themes
                </button>
                <button
                  onClick={() => { setStep('done'); setTimeout(onComplete, 1500) }}
                  className="btn-primary"
                >
                  <CheckCircle2 size={15} />
                  Confirm plan
                </button>
              </>
            )}

            {step === 'done' && (
              <button onClick={onComplete} className="btn-primary">
                View my plan
                <ChevronRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Week Theme Selector ────────────────────────────────────────────────
function WeekThemeSelector({
  week, weekIndex, onSelectTheme, onCustomTheme,
}: {
  week: WeekState
  weekIndex: number
  onSelectTheme: (theme: ThemeOption) => void
  onCustomTheme: (val: string) => void
}) {
  const [showCustom, setShowCustom] = useState(false)
  const weekStartDate = new Date(week.meta.start)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-label">
            Week {week.meta.weekNumber} · {formatDay(weekStartDate)}
          </p>
          <p className="text-xs text-ink-400 mt-0.5">
            {week.quarter} · {week.quarterTheme.split(' — ')[0]}
          </p>
        </div>
        {(week.selectedTheme || (week.isCustom && week.customTheme)) && (
          <span className="badge badge-approved">
            <CheckCircle2 size={10} /> Theme selected
          </span>
        )}
      </div>

      {/* Proposed themes */}
      {week.proposedThemes.length > 0 ? (
        <div className="space-y-2">
          {week.proposedThemes.map((theme, ti) => (
            <button
              key={ti}
              onClick={() => { onSelectTheme(theme); setShowCustom(false) }}
              className={cn(
                'w-full text-left card px-4 py-3 transition-all border',
                week.selectedTheme?.theme === theme.theme && !week.isCustom
                  ? 'border-gold-500 bg-gold-500/5'
                  : 'hover:border-ink-500'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-cream">{theme.theme}</p>
                  <p className="text-xs text-ink-400 mt-0.5">{theme.rationale}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-ink-500">
                      {PILLAR_LABELS[theme.primary_pillar] ?? theme.primary_pillar}
                    </span>
                    <span className="text-ink-700">·</span>
                    <span className="text-xs text-ink-500">{theme.primary_audience}</span>
                  </div>
                </div>
                <div className={cn(
                  'w-4 h-4 rounded-full border shrink-0 mt-0.5 flex items-center justify-center',
                  week.selectedTheme?.theme === theme.theme && !week.isCustom
                    ? 'border-gold-500 bg-gold-500'
                    : 'border-ink-600'
                )}>
                  {week.selectedTheme?.theme === theme.theme && !week.isCustom && (
                    <div className="w-1.5 h-1.5 rounded-full bg-ink-900" />
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="card py-6 text-center">
          <p className="text-sm text-ink-500">No theme proposals generated.</p>
          <p className="text-xs text-ink-600 mt-1">Use the custom theme option below.</p>
        </div>
      )}

      {/* Custom theme */}
      <div className="space-y-2">
        {!showCustom ? (
          <button
            onClick={() => setShowCustom(true)}
            className="btn-ghost text-xs w-full justify-center border border-ink-700 border-dashed"
          >
            <Pencil size={12} />
            Write my own theme instead
          </button>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={week.customTheme}
              onChange={e => onCustomTheme(e.target.value)}
              placeholder="e.g. The Weight of Unfinished Conversations"
              className="input text-sm"
              autoFocus
            />
            <p className="text-xs text-ink-500">
              Be specific — the more evocative the theme, the better the posts.
            </p>
            <button
              onClick={() => { setShowCustom(false); onCustomTheme('') }}
              className="text-xs text-ink-500 hover:text-cream-muted transition-colors"
            >
              Back to proposals
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Week Plan Review ───────────────────────────────────────────────────
function WeekPlanReview({ week, weekIndex }: { week: WeekState; weekIndex: number }) {
  const theme = week.isCustom ? week.customTheme : week.selectedTheme?.theme
  const weekStartDate = new Date(week.meta.start)

  return (
    <div className="space-y-3">
      <div>
        <p className="section-label">Week {week.meta.weekNumber} · {formatDay(weekStartDate)}</p>
        <h3 className="font-display text-lg text-cream mt-0.5">{theme}</h3>
      </div>

      {week.plan.length === 0 ? (
        <div className="card py-6 text-center">
          <p className="text-sm text-ink-500">Plan not generated. Please go back and try again.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {week.plan
            .sort((a, b) => {
              const order: Record<string, number> = { monday:0, tuesday:1, wednesday:2, thursday:3, friday:4, saturday:5 }
              return (order[a.day] ?? 0) - (order[b.day] ?? 0)
            })
            .map((slot, si) => (
              <div
                key={si}
                className={cn(
                  'card px-4 py-3 flex items-start gap-4',
                  slot.day === 'saturday' && 'opacity-60 border-dashed'
                )}
              >
                <div className="w-20 shrink-0">
                  <p className="text-xs font-medium text-cream capitalize">{slot.day}</p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    {FORMAT_LABELS[slot.format] ?? slot.format}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-xs font-medium mb-0.5',
                    slot.pillar === 'vedic_leadership'       && 'pillar-vedic',
                    slot.pillar === 'banker_coach'            && 'pillar-banker',
                    slot.pillar === 'coaching_transformation' && 'pillar-coaching',
                    slot.pillar === 'financial_intelligence'  && 'pillar-financial',
                    slot.pillar === 'inner_work'              && 'pillar-inner',
                  )}>
                    {PILLAR_LABELS[slot.pillar] ?? slot.pillar}
                  </p>
                  <p className="text-sm text-cream-muted">{slot.hook_idea}</p>
                  <p className="text-xs text-ink-500 mt-1">
                    {slot.target_audience} · {slot.target_word_count}w · {slot.narrative_position?.replace(/_/g, ' ')}
                  </p>
                </div>
                {slot.day === 'saturday' && (
                  <span className="text-xs text-ink-500 shrink-0">Saturday AM</span>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
