'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  X, ChevronRight, ChevronLeft, Loader2,
  CheckCircle2, RotateCcw, Pencil, AlertCircle,
} from 'lucide-react'
import { cn, PILLAR_LABELS, FORMAT_LABELS, formatDay } from '@/lib/utils/helpers'
import { getForwardPlanWeeks, getQuarter } from '@/lib/utils/helpers'

// ── Types ────────────────────────────────────────────────────────────
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

type ExistingWeekStatus = {
  weekId: string
  theme: string
  status: string
  approvedCount: number
  totalPosts: number
}

type WeekState = {
  meta: WeekMeta
  weekId: string | null
  existing: ExistingWeekStatus | null
  confirmChange: boolean
  proposalRounds: ThemeOption[][]
  activeRound: number
  selectedTheme: ThemeOption | null
  customTheme: string
  isCustom: boolean
  plan: PlanSlot[]
  quarter: string
  quarterTheme: string
}

type Step = 'checking' | 'proposing' | 'themes' | 'confirming' | 'plans' | 'done'

const QUARTER_THEMES: Record<string, string> = {
  Q1: 'The Awakening — recognition, discomfort, honest questioning',
  Q2: 'The Turning — decision, courage, the moment of change',
  Q3: 'The Becoming — identity shift, new strengths, unexpected losses',
  Q4: 'The Integration — wisdom, legacy, what the whole journey means',
}

// ── Main component ───────────────────────────────────────────────────
export default function PlanningSessionModal({
  onClose,
  onComplete,
  // FIX 2: accept the flag from DashboardPage — when week 1's Mon–Fri
  // are all approved, we show 3 forward weeks instead of 2
  week1MonFriApproved = false,
}: {
  onClose: () => void
  onComplete: () => void
  week1MonFriApproved?: boolean
}) {
  // FIX 2: pass flag into getForwardPlanWeeks so it returns 2 or 3 weeks
  const forwardWeeks = getForwardPlanWeeks(new Date(), week1MonFriApproved)

  const [step, setStep]               = useState<Step>('checking')
  const [error, setError]             = useState<string | null>(null)
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0)

  const [weeks, setWeeks] = useState<WeekState[]>(
    forwardWeeks.map(fw => ({
      meta: fw,
      weekId: null,
      existing: null,
      confirmChange: false,
      proposalRounds: [],
      activeRound: 0,
      selectedTheme: null,
      customTheme: '',
      isCustom: false,
      plan: [],
      quarter: getQuarter(new Date(fw.start)),
      quarterTheme: QUARTER_THEMES[getQuarter(new Date(fw.start))],
    }))
  )

  // ── Propose themes for ONE specific week ──────────────────────────
  const proposeThemesForWeek = useCallback(async (weekIndex: number) => {
    setStep('proposing')
    setError(null)

    const w = weeks[weekIndex]

    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'propose_themes',
          weekNumber: w.meta.weekNumber,
          year: w.meta.year,
          quarter: w.quarter,
          quarterTheme: w.quarterTheme,
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Theme proposal failed (${res.status}): ${text || 'Check Vercel function logs'}`)
      }

      const json = await res.json()
      const newThemes: ThemeOption[] = json?.themes ?? []

      setWeeks(prev => prev.map((pw, i) =>
        i === weekIndex
          ? {
              ...pw,
              proposalRounds: [...pw.proposalRounds, newThemes],
              activeRound: pw.proposalRounds.length,
            }
          : pw
      ))
      setStep('themes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to propose themes')
      setStep('themes')
    }
  }, [weeks])

  // ── Check existing weeks on open, then propose for unplanned ones ──
  useEffect(() => {
    async function checkAndPropose() {
      try {
        const settingsPromise = fetch('/api/settings')
          .then(r => r.ok ? r.json() : null).catch(() => null)
        const statusPromises = forwardWeeks.map(fw =>
          fetch(`/api/weeks/status?weekNumber=${fw.weekNumber}&year=${fw.year}`)
            .then(r => r.ok ? r.json() : { week: null })
            .catch(() => ({ week: null }))
        )
        const [settingsRes, ...results] = await Promise.all([settingsPromise, ...statusPromises])
        // Use arc-relative quarter from settings (13-week quarters from live_date).
        // Falls back to calendar quarter if settings unavailable.
        const arcQ: string | null = settingsRes?.derived?.arcQuarter ?? null

        setWeeks(prev => prev.map((w, i) => {
          const q = arcQ ?? w.quarter
          return {
            ...w,
            quarter: q,
            quarterTheme: QUARTER_THEMES[q] ?? w.quarterTheme,
            existing: results[i]?.week ?? null,
          }
        }))
        const firstNewIndex = results.findIndex(
          (r: { week: { status: string } | null }) => !r?.week || r.week.status !== 'confirmed'
        )
        if (firstNewIndex >= 0) {
          setCurrentWeekIndex(firstNewIndex)
          proposeThemesForWeek(firstNewIndex)
        } else {
          setStep('themes')
        }
      } catch {
        proposeThemesForWeek(0)
      }
    }
    checkAndPropose()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goToNextWeek = () => {
    if (currentWeekIndex < weeks.length - 1) {
      const nextIndex = currentWeekIndex + 1
      setCurrentWeekIndex(nextIndex)
      if (weeks[nextIndex].proposalRounds.length === 0) {
        proposeThemesForWeek(nextIndex)
      } else {
        setStep('themes')
      }
    }
  }

  const goToPrevWeek = () => {
    if (currentWeekIndex > 0) {
      setCurrentWeekIndex(currentWeekIndex - 1)
      setStep('themes')
    }
  }

  const generatePlans = useCallback(async () => {
    setStep('confirming')
    setError(null)

    try {
      const results = await Promise.all(
        weeks.map(async w => {
          const theme = w.isCustom ? w.customTheme : w.selectedTheme?.theme ?? ''
          if (!theme) return { weekId: null, plan: [] }

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
          if (!createRes.ok) {
            const text = await createRes.text()
            throw new Error(`Failed to create week (${createRes.status}): ${text || 'Check Vercel logs'}`)
          }
          const { weekId } = await createRes.json()

          const planRes = await fetch('/api/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generate_plan', weekId, theme }),
          })
          if (!planRes.ok) {
            const text = await planRes.text()
            throw new Error(`Failed to generate plan (${planRes.status}): ${text || 'Check Vercel logs'}`)
          }
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

  const currentWeek    = weeks[currentWeekIndex]
  const isLastWeek     = currentWeekIndex === weeks.length - 1

  const weekIsResolved = (w: WeekState) =>
    (w.existing?.status === 'confirmed' && !w.confirmChange) ||
    (w.isCustom && w.customTheme.trim().length > 0) ||
    w.selectedTheme !== null

  const allConfirmed   = weeks.every(weekIsResolved)
  const currentConfirmed = weekIsResolved(currentWeek)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden animate-in">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800 shrink-0">
          <div>
            <p className="section-label mb-0.5">Planning Session</p>
            <h2 className="font-display text-xl text-cream">
              {step === 'checking'   ? 'Checking your plan...' :
               step === 'proposing'  ? 'Finding theme ideas...' :
               step === 'themes'     ? `Choose theme — Week ${currentWeekIndex + 1} of ${weeks.length}` :
               step === 'confirming' ? 'Building your plan...' :
               step === 'plans'      ? 'Review your plan' :
               'Plan confirmed'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {weeks.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    step === 'themes' && currentWeekIndex === i ? 'w-6 bg-gold-500' :
                    (weeks[i].selectedTheme || weeks[i].isCustom) ? 'w-4 bg-gold-500/50' :
                    'w-4 bg-ink-700'
                  )}
                />
              ))}
              <div className={cn(
                'h-1.5 rounded-full transition-all duration-300 ml-1',
                step === 'plans' || step === 'done' ? 'w-6 bg-gold-500' : 'w-4 bg-ink-700'
              )} />
            </div>
            <button onClick={onClose} className="btn-ghost p-2"><X size={16} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {step === 'proposing' && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
                <Loader2 size={20} className="text-gold-500 animate-spin" />
              </div>
              <p className="text-cream text-sm">Finding theme ideas for Week {currentWeekIndex + 1}...</p>
              <p className="text-xs text-ink-500">Reading your narrative arc and recent posts</p>
            </div>
          )}

          {step === 'themes' && currentWeek && (
            <div className="p-6 space-y-5">
              {error && (
                <div className="card px-4 py-3 border-red-800/30 bg-red-900/10 flex items-start gap-2">
                  <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {currentWeek.existing?.status === 'confirmed' && !currentWeek.confirmChange && (
                <div className="card px-4 py-4 border-amber-700/30 bg-amber-900/10 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-amber-300 font-medium">This week already has a plan</p>
                      <p className="text-xs text-amber-400/70 mt-0.5">Theme: "{currentWeek.existing.theme}"</p>
                      <p className="text-xs text-ink-400 mt-1">
                        {currentWeek.existing.approvedCount}/{currentWeek.existing.totalPosts} posts approved
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { if (!isLastWeek) goToNextWeek(); else generatePlans() }}
                      className="btn-primary text-xs px-3 py-2"
                    >
                      Keep this plan
                    </button>
                    <button
                      onClick={() => {
                        setWeeks(prev => prev.map((w, i) =>
                          i === currentWeekIndex ? { ...w, confirmChange: true } : w
                        ))
                        proposeThemesForWeek(currentWeekIndex)
                      }}
                      className="btn-secondary text-xs px-3 py-2"
                    >
                      Change theme
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <p className="section-label">
                    Week {currentWeek.meta.weekNumber} · {formatDay(new Date(currentWeek.meta.start))}
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    {currentWeek.quarter} · {currentWeek.quarterTheme.split(' — ')[0]}
                  </p>
                </div>
                {currentConfirmed && (
                  <span className="badge badge-approved">
                    <CheckCircle2 size={10} /> Theme selected
                  </span>
                )}
              </div>

              {currentWeek.proposalRounds.length > 1 && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-ink-500 mr-1">Proposals:</span>
                  {currentWeek.proposalRounds.map((_, ri) => (
                    <button
                      key={ri}
                      onClick={() => setWeeks(prev => prev.map((pw, i) =>
                        i === currentWeekIndex ? { ...pw, activeRound: ri } : pw
                      ))}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                        currentWeek.activeRound === ri ? 'bg-ink-700 text-cream' : 'text-ink-500 hover:text-cream'
                      )}
                    >
                      Round {ri + 1}
                    </button>
                  ))}
                </div>
              )}

              {(currentWeek.proposalRounds[currentWeek.activeRound] ?? []).length > 0 ? (
                <div className="space-y-2">
                  {(currentWeek.proposalRounds[currentWeek.activeRound] ?? []).map((theme, ti) => (
                    <button
                      key={ti}
                      onClick={() => setWeeks(prev => prev.map((pw, i) =>
                        i === currentWeekIndex
                          ? { ...pw, selectedTheme: theme, isCustom: false }
                          : pw
                      ))}
                      className={cn(
                        'w-full text-left card px-4 py-3 transition-all border',
                        currentWeek.selectedTheme?.theme === theme.theme && !currentWeek.isCustom
                          ? 'border-gold-500 bg-gold-500/5'
                          : 'hover:border-ink-500'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-cream">{theme.theme}</p>
                          <p className="text-xs text-ink-400 mt-0.5">{theme.rationale}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-xs text-ink-500">{PILLAR_LABELS[theme.primary_pillar] ?? theme.primary_pillar}</span>
                            <span className="text-ink-700">·</span>
                            <span className="text-xs text-ink-500">{theme.primary_audience}</span>
                          </div>
                        </div>
                        <div className={cn(
                          'w-4 h-4 rounded-full border shrink-0 mt-0.5 flex items-center justify-center',
                          currentWeek.selectedTheme?.theme === theme.theme && !currentWeek.isCustom
                            ? 'border-gold-500 bg-gold-500'
                            : 'border-ink-600'
                        )}>
                          {currentWeek.selectedTheme?.theme === theme.theme && !currentWeek.isCustom && (
                            <div className="w-1.5 h-1.5 rounded-full bg-ink-900" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="card py-6 text-center">
                  <p className="text-sm text-ink-500">No proposals yet. Use the custom theme option below.</p>
                </div>
              )}

              <CustomThemeInput
                value={currentWeek.customTheme}
                isCustom={currentWeek.isCustom}
                onChange={val => setWeeks(prev => prev.map((pw, i) =>
                  i === currentWeekIndex
                    ? { ...pw, customTheme: val, isCustom: val.trim().length > 0, selectedTheme: null }
                    : pw
                ))}
              />
            </div>
          )}

          {step === 'confirming' && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
                <Loader2 size={20} className="text-gold-500 animate-spin" />
              </div>
              <p className="text-cream text-sm">Building your {weeks.length}-week plan...</p>
              <p className="text-xs text-ink-500">Creating posts with narrative continuity</p>
            </div>
          )}

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

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
              <div className="w-12 h-12 rounded-xl bg-emerald-900/30 border border-emerald-700/30 flex items-center justify-center">
                <CheckCircle2 size={20} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-cream font-medium">Your plan is confirmed</p>
                <p className="text-sm text-ink-400 mt-1">
                  {weeks.reduce((a, w) => a + w.plan.filter(p => p.day !== 'saturday').length, 0)} posts
                  planned across {weeks.length} weeks
                </p>
              </div>
              <p className="text-xs text-ink-500 max-w-xs">
                Go to each post and click "Generate" to create the draft.
                Saturday posts are generated on the day with real market data.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-ink-800 shrink-0">
          <button onClick={onClose} className="btn-ghost text-sm">
            {step === 'done' ? 'Close' : 'Cancel'}
          </button>

          <div className="flex items-center gap-3">
            {step === 'themes' && (
              <>
                <button onClick={() => proposeThemesForWeek(currentWeekIndex)} className="btn-secondary text-sm">
                  <RotateCcw size={14} /> New proposals
                </button>
                {currentWeekIndex > 0 && (
                  <button onClick={goToPrevWeek} className="btn-secondary text-sm">
                    <ChevronLeft size={14} /> Week {currentWeekIndex}
                  </button>
                )}
                {!isLastWeek ? (
                  <button onClick={goToNextWeek} disabled={!currentConfirmed} className="btn-primary">
                    Week {currentWeekIndex + 2} <ChevronRight size={15} />
                  </button>
                ) : (
                  <button onClick={generatePlans} disabled={!allConfirmed} className="btn-primary">
                    Generate plans <ChevronRight size={15} />
                  </button>
                )}
              </>
            )}
            {step === 'plans' && (
              <>
                <button onClick={() => { setCurrentWeekIndex(0); setStep('themes') }} className="btn-secondary text-sm">
                  <ChevronLeft size={14} /> Back to themes
                </button>
                <button onClick={() => { setStep('done'); setTimeout(onComplete, 1500) }} className="btn-primary">
                  <CheckCircle2 size={15} /> Confirm plan
                </button>
              </>
            )}
            {step === 'done' && (
              <button onClick={onComplete} className="btn-primary">
                View my plan <ChevronRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CustomThemeInput({ value, isCustom, onChange }: { value: string; isCustom: boolean; onChange: (val: string) => void }) {
  const [expanded, setExpanded] = useState(isCustom)
  return (
    <div>
      {!expanded ? (
        <button onClick={() => setExpanded(true)} className="btn-ghost text-xs w-full justify-center border border-ink-700 border-dashed">
          <Pencil size={12} /> Write my own theme instead
        </button>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="e.g. The Weight of Unfinished Conversations"
            className="input text-sm"
            autoFocus
          />
          <p className="text-xs text-ink-500">Be specific — the more evocative the theme, the better the posts.</p>
          {!isCustom && (
            <button onClick={() => { setExpanded(false); onChange('') }} className="text-xs text-ink-500 hover:text-cream-muted transition-colors">
              Back to proposals
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function WeekPlanReview({ week, weekIndex }: { week: WeekState; weekIndex: number }) {
  const theme = week.isCustom ? week.customTheme : week.selectedTheme?.theme
  return (
    <div className="space-y-3">
      <div>
        <p className="section-label">Week {week.meta.weekNumber} · {formatDay(new Date(week.meta.start))}</p>
        <h3 className="font-display text-lg text-cream mt-0.5">{theme}</h3>
      </div>
      {week.plan.length === 0 ? (
        <div className="card py-6 text-center"><p className="text-sm text-ink-500">Plan not generated. Please go back and try again.</p></div>
      ) : (
        <div className="space-y-2">
          {[...week.plan]
            .sort((a, b) => {
              const order: Record<string, number> = { monday:0, tuesday:1, wednesday:2, thursday:3, friday:4, saturday:5 }
              return (order[a.day] ?? 0) - (order[b.day] ?? 0)
            })
            .map((slot, si) => (
              <div key={si} className={cn('card px-4 py-3 flex items-start gap-4', slot.day === 'saturday' && 'opacity-60 border-dashed')}>
                <div className="w-20 shrink-0">
                  <p className="text-xs font-medium text-cream capitalize">{slot.day}</p>
                  <p className="text-xs text-ink-400 mt-0.5">{FORMAT_LABELS[slot.format] ?? slot.format}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-xs font-medium mb-0.5',
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
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
