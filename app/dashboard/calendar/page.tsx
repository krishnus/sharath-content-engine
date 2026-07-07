'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  addWeeks, format, startOfISOWeek, parseISO, addDays,
} from 'date-fns'
import {
  ChevronLeft, ChevronRight, Loader2, AlertCircle, X,
  Bookmark, ArrowLeft, ArrowRight, Sparkles, RotateCcw,
  CheckCircle2, Send, PenLine, Database,
} from 'lucide-react'
import Link from 'next/link'
import { cn, PILLAR_LABELS, FORMAT_LABELS } from '@/lib/utils/helpers'
import SaturdayInsightsModal from '@/components/SaturdayInsightsModal'

// Parse YYYY-MM-DD safely without UTC shift
function parseDateStr(s: string): Date {
  return parseISO(s.includes('T') ? s : `${s}T00:00:00`)
}

// ── Types ───────────────────────────────────────────────────────────────
type SlotPost = {
  id: string
  day: string
  pillar: string
  format: string
  status: string
  hook_idea: string | null
  target_word_count: number | null
  hasDraft: boolean
  thread_planted: string | null
}

type WeekSlot = {
  id: string | null
  week_number: number
  year: number
  week_start: string
  theme: string | null
  quarter: string | null
  status: string
  open_thread: string | null
  posts: SlotPost[]
}

type ThemeOption = {
  theme: string
  rationale: string
  primary_pillar: string
  primary_audience: string
  open_thread_link: string | null
}

type DrawerPost = {
  post: SlotPost
  week: WeekSlot
  postDate: Date
}

type SatModalData = {
  postId: string; weekId: string; weekTheme: string
  quarter: string; openThread: string | null; targetWordCount: number
}

// ── Constants ───────────────────────────────────────────────────────────
const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
  thursday: 'Thu', friday: 'Fri', saturday: 'Sat',
}
const DAY_SUBTITLES: Record<string, string> = {
  monday: 'Coaching story', tuesday: 'Wealth mgmt',
  wednesday: 'Vedic / Banker', thursday: 'Carousel',
  friday: 'Fin. wellness', saturday: 'Market insights',
}
const DAY_OFFSET: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5,
}
const QUARTER_THEMES: Record<string, string> = {
  Q1: 'The Awakening — recognition, discomfort, honest questioning',
  Q2: 'The Turning — decision, courage, the moment of change',
  Q3: 'The Becoming — identity shift, new strengths, unexpected losses',
  Q4: 'The Integration — wisdom, legacy, what the whole journey means',
}

// Arc-quarter colours mirror the Story Arc page for visual consistency
const QUARTER_COLORS: Record<string, string> = {
  Q1: 'text-violet-400',
  Q2: 'text-amber-400',
  Q3: 'text-emerald-400',
  Q4: 'text-blue-400',
}

// Compute arc-relative quarter for any week given the live_date.
// Each arc quarter = 13 weeks from live_date (not calendar quarters).
function getArcQuarter(weekStartStr: string, liveDateStr: string | null): string {
  if (!liveDateStr) return 'Q1'
  const liveMs = new Date(`${liveDateStr}T00:00:00`).getTime()
  const weekMs = new Date(`${weekStartStr}T00:00:00`).getTime()
  const daysSinceLive = Math.max(0, Math.floor((weekMs - liveMs) / 86400000))
  const idx = Math.min(3, Math.floor(Math.floor(daysSinceLive / 7) / 13))
  return (['Q1', 'Q2', 'Q3', 'Q4'] as const)[idx]
}

// ── Style maps ──────────────────────────────────────────────────────────
const PILLAR_TAG: Record<string, string> = {
  vedic_leadership:        'bg-violet-900/50 text-violet-300',
  banker_coach:            'bg-blue-900/50 text-blue-300',
  coaching_transformation: 'bg-teal-900/50 text-teal-300',
  financial_intelligence:  'bg-amber-900/50 text-amber-300',
  inner_work:              'bg-stone-800 text-stone-400',
}
const PILLAR_SHORT: Record<string, string> = {
  vedic_leadership: 'Vedic', banker_coach: 'Banker',
  coaching_transformation: 'Coaching', financial_intelligence: 'Finance',
  inner_work: 'Inner',
}

function statusChip(status: string, hasDraft: boolean) {
  if (status === 'published')            return { label: 'Published',     cls: 'bg-emerald-900/50 text-emerald-400' }
  if (status === 'approved')             return { label: 'Approved',      cls: 'bg-teal-900/50 text-teal-400' }
  if (status === 'scheduled')            return { label: 'Scheduled',     cls: 'bg-sky-900/50 text-sky-400' }
  if (status === 'edited')               return { label: 'Edited',        cls: 'bg-violet-900/50 text-violet-400' }
  if (status === 'awaiting_market_data') return { label: 'Awaiting data', cls: 'bg-red-900/50 text-red-400' }
  if (status === 'draft' && !hasDraft)   return { label: 'Planned',       cls: 'bg-stone-800 text-stone-300' }
  if (status === 'draft')                return { label: 'Draft',         cls: 'bg-amber-900/50 text-amber-400' }
  return { label: status, cls: 'bg-stone-800 text-stone-300' }
}

// ── Main component ──────────────────────────────────────────────────────
export default function CalendarPage() {
  const today       = new Date()
  const todayStr    = format(today, 'yyyy-MM-dd')

  // windowOffset: 0 = default view (current week ±2). Each ±1 shift = 1 week.
  // Prev/Next buttons shift by 2 at a time.
  const [windowOffset, setWindowOffset]     = useState(0)
  const [weeks, setWeeks]                   = useState<WeekSlot[]>([])
  const [arcThemes, setArcThemes]           = useState<Record<string, string>>({})
  const [liveDate, setLiveDate]             = useState<string | null>(null)
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState<string | null>(null)
  const [refreshKey, setRefreshKey]         = useState(0)

  // Drawer
  const [drawer, setDrawer]                 = useState<DrawerPost | null>(null)

  // Theme picker
  const [pickerWeek, setPickerWeek]         = useState<WeekSlot | null>(null)
  const [pickerStep, setPickerStep]         = useState<'loading' | 'proposals' | 'generating' | 'done'>('loading')
  const [pickerError, setPickerError]       = useState<string | null>(null)
  const [proposals, setProposals]           = useState<ThemeOption[]>([])
  const [selectedTheme, setSelectedTheme]   = useState<ThemeOption | null>(null)
  const [customTheme, setCustomTheme]       = useState('')
  const [useCustom, setUseCustom]           = useState(false)

  // Per-week "generate plan" loading (for muted banner Generate plan button)
  const [genPlanLoading, setGenPlanLoading] = useState<string | null>(null)  // weekId

  // Saturday modal
  const [satModal, setSatModal]             = useState<SatModalData | null>(null)

  // Compute context window start: 3 weeks before current ISO week + windowOffset
  const contextMonday = startOfISOWeek(addWeeks(today, -3 + windowOffset))
  const windowStartStr = format(contextMonday, 'yyyy-MM-dd')

  const fetchCalendar = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/calendar?windowStart=${windowStartStr}`)
      if (!res.ok) throw new Error(`Failed to load (${res.status})`)
      const json = await res.json()
      // Normalize posts: flatten drafts[] → hasDraft, story_log[] → thread_planted
      type RawPost = {
        id: string; day: string; pillar: string; format: string; status: string
        hook_idea: string | null; target_word_count: number | null
        drafts: Array<{ id: string }>
        story_log: Array<{ thread_planted: string | null }>
      }
      type RawWeek = Omit<WeekSlot, 'posts'> & { posts: RawPost[] }
      const normalised: WeekSlot[] = (json.weeks ?? []).map((w: RawWeek) => ({
        ...w,
        posts: (w.posts ?? []).map((p: RawPost) => ({
          id: p.id, day: p.day, pillar: p.pillar, format: p.format,
          status: p.status, hook_idea: p.hook_idea, target_word_count: p.target_word_count,
          hasDraft:       (p.drafts?.length ?? 0) > 0,
          thread_planted: p.story_log?.[0]?.thread_planted ?? null,
        })),
      }))
      setWeeks(normalised)
      setArcThemes(json.arcThemes ?? {})
      setLiveDate(json.liveDate ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar')
    } finally {
      setLoading(false)
    }
  }, [windowStartStr, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchCalendar() }, [fetchCalendar])

  // weeks[0] = context (hidden, for threading), weeks[1..5] = displayed
  const displayWeeks = weeks.slice(1)
  const contextWeek  = weeks[0] ?? null

  // ── Stats bar — all posts in currently displayed weeks ─────────────
  const stats = { published: 0, scheduled: 0, approved: 0, draft: 0, planned: 0 }
  for (const week of displayWeeks) {
    for (const post of week.posts) {
      if (post.status === 'published')                                         stats.published++
      else if (post.status === 'scheduled')                                    stats.scheduled++
      else if (post.status === 'approved')                                     stats.approved++
      else if (post.status === 'edited' || (post.status === 'draft' && post.hasDraft)) stats.draft++
      else                                                                     stats.planned++
    }
  }

  // ── Theme picker helpers ────────────────────────────────────────────
  const openThemePicker = useCallback(async (week: WeekSlot) => {
    setPickerWeek(week)
    setPickerStep('loading')
    setPickerError(null)
    setProposals([])
    setSelectedTheme(null)
    setCustomTheme('')
    setUseCustom(false)

    const q = week.quarter ?? getArcQuarter(week.week_start, liveDate)
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:       'propose_themes',
          weekNumber:   week.week_number,
          year:         week.year,
          quarter:      q,
          quarterTheme: arcThemes[q] ?? QUARTER_THEMES[q] ?? '',
        }),
      })
      if (!res.ok) throw new Error(`Theme proposal failed (${res.status})`)
      const json = await res.json()
      setProposals(json.themes ?? [])
      setPickerStep('proposals')
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : 'Failed to get theme proposals')
      setPickerStep('proposals')
    }
  }, [])

  const confirmTheme = useCallback(async () => {
    if (!pickerWeek) return
    const theme = useCustom ? customTheme.trim() : selectedTheme?.theme ?? ''
    if (!theme) return

    setPickerStep('generating')
    setPickerError(null)
    try {
      const q = pickerWeek.quarter ?? getArcQuarter(pickerWeek.week_start, liveDate)
      // Create or upsert the week
      const createRes = await fetch('/api/weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekNumber: pickerWeek.week_number, year: pickerWeek.year, quarter: q, theme }),
      })
      if (!createRes.ok) throw new Error(`Week create failed (${createRes.status})`)
      const { weekId } = await createRes.json()

      // Generate 6-slot plan
      const planRes = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_plan', weekId, theme }),
      })
      if (!planRes.ok) throw new Error(`Plan generation failed (${planRes.status})`)

      setPickerStep('done')
      setTimeout(() => {
        setPickerWeek(null)
        setRefreshKey(k => k + 1)
      }, 800)
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : 'Failed to generate plan')
      setPickerStep('proposals')
    }
  }, [pickerWeek, useCustom, customTheme, selectedTheme])

  const generatePlanForWeek = useCallback(async (week: WeekSlot) => {
    if (!week.id || !week.theme) return
    setGenPlanLoading(week.id)
    try {
      const planRes = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_plan', weekId: week.id, theme: week.theme }),
      })
      if (!planRes.ok) throw new Error(`Plan generation failed (${planRes.status})`)
      setRefreshKey(k => k + 1)
    } catch {
      // surface error in-banner? For now silent fail + refresh
      setRefreshKey(k => k + 1)
    } finally {
      setGenPlanLoading(null)
    }
  }, [])

  // Determine incoming thread for each displayed week
  function getIncomingThread(weekIndex: number): string | null {
    // weekIndex is the index in displayWeeks (0-4)
    // displayWeeks[0]'s incoming = contextWeek.open_thread
    // displayWeeks[n]'s incoming = displayWeeks[n-1].open_thread
    if (weekIndex === 0) return contextWeek?.open_thread ?? null
    return displayWeeks[weekIndex - 1]?.open_thread ?? null
  }
  function getPrevWeekNumber(weekIndex: number): number {
    if (weekIndex === 0) return contextWeek?.week_number ?? 0
    return displayWeeks[weekIndex - 1]?.week_number ?? 0
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-ink-900 border-b border-ink-800 px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-lg text-cream">Content Calendar</h1>
          <span className="text-sm font-medium text-cream/70">
            {format(today, 'EEEE, d MMMM yyyy')}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setWindowOffset(o => o - 2)}
            className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
          >
            <ChevronLeft size={13} /> Prev 2 weeks
          </button>
          <button
            onClick={() => setWindowOffset(0)}
            className={cn('text-xs px-3 py-1.5 rounded-lg border transition-colors',
              windowOffset === 0
                ? 'bg-gold-500/10 border-gold-500/40 text-gold-400'
                : 'btn-secondary'
            )}
          >
            Today
          </button>
          <button
            onClick={() => setWindowOffset(o => o + 2)}
            className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
          >
            Next 2 weeks <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* ── Stats bar — currently displayed weeks ──────────────────── */}
      <div className="shrink-0 grid grid-cols-5 divide-x divide-ink-800 border-b border-ink-800 bg-ink-900/50">
        {[
          { label: 'Published',  count: stats.published,  dot: 'bg-emerald-400' },
          { label: 'Scheduled',  count: stats.scheduled,  dot: 'bg-sky-400' },
          { label: 'Approved',   count: stats.approved,   dot: 'bg-teal-400' },
          { label: 'In draft',   count: stats.draft,      dot: 'bg-amber-400' },
          { label: 'Planned',    count: stats.planned,    dot: 'bg-stone-500' },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-2.5 px-5 py-2.5">
            <div className={cn('w-2 h-2 rounded-full shrink-0', s.dot)} />
            <div>
              <div className="text-base font-semibold text-cream leading-none">{s.count}</div>
              <div className="text-xs text-ink-500 mt-0.5">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Error ──────────────────────────────────────────────────── */}
      {error && (
        <div className="shrink-0 flex items-center gap-2 px-6 py-2 bg-red-900/10 border-b border-red-800/30">
          <AlertCircle size={13} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-400">{error}</p>
          <button onClick={fetchCalendar} className="ml-auto text-xs text-red-400 underline">Retry</button>
        </div>
      )}

      {/* ── Calendar area ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Sticky column header */}
        <div
          className="sticky top-0 z-20 bg-ink-900 border-b border-ink-700 grid"
          style={{ gridTemplateColumns: '72px repeat(6, minmax(0, 1fr))' }}
        >
          <div className="py-2 px-2 text-xs font-medium text-ink-600 uppercase tracking-wider" />
          {DAY_NAMES.map(day => {
            const isCurrentDay = format(today, 'EEEE').toLowerCase() === day
            return (
              <div
                key={day}
                className={cn(
                  'py-2 px-2 text-center border-l border-ink-800',
                  isCurrentDay && 'bg-gold-500/5'
                )}
              >
                <div className={cn('text-xs font-semibold uppercase tracking-wider',
                  day === 'monday' || day === 'wednesday' ? 'text-blue-400' :
                  day === 'saturday' ? 'text-amber-400' : 'text-ink-400',
                  isCurrentDay && 'text-gold-400'
                )}>
                  {DAY_LABELS[day]}
                </div>
                <div className="text-xs text-ink-400 mt-0.5 normal-case tracking-normal font-normal">
                  {DAY_SUBTITLES[day]}
                </div>
              </div>
            )
          })}
        </div>

        {/* Week blocks */}
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3">
            <Loader2 size={16} className="animate-spin text-ink-400" />
            <span className="text-sm text-ink-400">Loading calendar…</span>
          </div>
        ) : (
          <div>
            {displayWeeks.map((week, wi) => (
              <WeekBlock
                key={`${week.week_start}-${refreshKey}`}
                week={week}
                weekIndex={wi}
                incomingThread={getIncomingThread(wi)}
                prevWeekNumber={getPrevWeekNumber(wi)}
                todayStr={todayStr}
                genPlanLoading={genPlanLoading}
                liveDate={liveDate}
                arcThemes={arcThemes}
                onOpenPicker={openThemePicker}
                onGeneratePlan={generatePlanForWeek}
                onClickPost={(post, postDate) => setDrawer({ post, week, postDate })}
                onSaturdayModal={setSatModal}
              />
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="px-4 py-3 border-t border-ink-800 flex items-center flex-wrap gap-x-5 gap-y-1.5 bg-ink-900/30">
          {[
            { dot: 'bg-emerald-400', label: 'Published' },
            { dot: 'bg-teal-400',    label: 'Approved' },
            { dot: 'bg-amber-400',   label: 'Draft' },
            { dot: 'bg-stone-500',   label: 'Planned' },
            { dot: 'bg-red-400',     label: 'Awaiting data' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={cn('w-1.5 h-1.5 rounded-full', l.dot)} />
              <span className="text-xs text-ink-500">{l.label}</span>
            </div>
          ))}
          <div className="w-px h-3 bg-ink-700 mx-1" />
          {[
            { bar: 'bg-teal-600', label: 'Thread planted' },
            { bar: 'bg-blue-600', label: 'Thread picked up' },
            { bar: 'bg-stone-700', label: 'Thread pending' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={cn('w-4 h-1 rounded', l.bar)} />
              <span className="text-xs text-ink-500">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Post detail drawer ──────────────────────────────────────── */}
      {drawer && (
        <PostDrawer
          entry={drawer}
          onClose={() => setDrawer(null)}
        />
      )}

      {/* ── Theme picker modal ──────────────────────────────────────── */}
      {pickerWeek && (
        <ThemePickerModal
          week={pickerWeek}
          step={pickerStep}
          proposals={proposals}
          selectedTheme={selectedTheme}
          customTheme={customTheme}
          useCustom={useCustom}
          error={pickerError}
          incomingThread={getIncomingThread(displayWeeks.findIndex(w => w.week_start === pickerWeek.week_start))}
          liveDate={liveDate}
          arcThemes={arcThemes}
          onSelectTheme={t => { setSelectedTheme(t); setUseCustom(false) }}
          onCustomTheme={v => { setCustomTheme(v); setUseCustom(v.trim().length > 0); setSelectedTheme(null) }}
          onRefreshProposals={() => openThemePicker(pickerWeek)}
          onConfirm={confirmTheme}
          onClose={() => setPickerWeek(null)}
        />
      )}

      {/* ── Saturday modal ──────────────────────────────────────────── */}
      {satModal && (
        <SaturdayInsightsModal
          {...satModal}
          onClose={() => setSatModal(null)}
        />
      )}
    </div>
  )
}

// ── WeekBlock ────────────────────────────────────────────────────────────
function WeekBlock({
  week, weekIndex, incomingThread, prevWeekNumber, todayStr,
  genPlanLoading, liveDate, arcThemes, onOpenPicker, onGeneratePlan, onClickPost, onSaturdayModal,
}: {
  week: WeekSlot
  weekIndex: number
  incomingThread: string | null
  prevWeekNumber: number
  todayStr: string
  genPlanLoading: string | null
  liveDate: string | null
  arcThemes: Record<string, string>
  onOpenPicker: (week: WeekSlot) => void
  onGeneratePlan: (week: WeekSlot) => void
  onClickPost: (post: SlotPost, postDate: Date) => void
  onSaturdayModal: (data: SatModalData) => void
}) {
  // Arc-relative quarter for this week (used for display and passed to DayCell)
  const arcQ = week.quarter ?? getArcQuarter(week.week_start, liveDate)

  // Classify week state
  const hasTheme  = !!week.theme
  const hasPosts  = week.posts.length > 0
  const isLoading = genPlanLoading === week.id

  // Progress counts
  const published = week.posts.filter(p => p.status === 'published').length
  const scheduled = week.posts.filter(p => p.status === 'scheduled').length
  const approved  = week.posts.filter(p => p.status === 'approved').length
  const inDraft   = week.posts.filter(p => p.status === 'edited' || (p.status === 'draft' && p.hasDraft)).length
  const planned   = week.posts.filter(p => (p.status === 'draft' && !p.hasDraft) || p.status === 'awaiting_market_data').length
  const allDone   = hasPosts && published === week.posts.length

  const progressSummary = [
    published > 0 && `${published} published`,
    scheduled > 0 && `${scheduled} scheduled`,
    approved  > 0 && `${approved} approved`,
    inDraft   > 0 && `${inDraft} in draft`,
    planned   > 0 && `${planned} planned`,
  ].filter(Boolean).join(' · ')

  // Current week: the week containing today
  const weekMonday = parseDateStr(week.week_start)
  const weekSaturday = addDays(weekMonday, 5)
  const isCurrent = format(weekMonday, 'yyyy-MM-dd') <= todayStr && todayStr <= format(weekSaturday, 'yyyy-MM-dd')

  // Outgoing thread: this week's open_thread (shown in thread strip)
  const outgoingThread = week.open_thread

  return (
    <div className={cn('border-b border-ink-800', isCurrent && 'bg-gold-500/[0.02]')}>

      {/* ── Row 1: Theme ── */}
      <div className="grid" style={{ gridTemplateColumns: '72px 1fr' }}>
        {/* Week meta */}
        <div className="border-r border-ink-800 px-2 py-2 flex flex-col justify-center gap-0.5">
          <span className="text-xs font-semibold text-cream">Wk {week.week_number}</span>
          <span className="text-xs text-ink-400">
            {format(weekMonday, 'd MMM')}–{format(weekSaturday, 'd MMM')}
          </span>
          <span className={cn('text-[10px] font-semibold leading-none', QUARTER_COLORS[arcQ] ?? 'text-ink-500')}>
            {arcQ}
          </span>
          <span className="text-[9px] text-ink-600 leading-none truncate">
            {(arcThemes[arcQ] ?? QUARTER_THEMES[arcQ] ?? '').split(' — ')[0].replace('The ', '')}
          </span>
          {isCurrent && (
            <span className="text-xs bg-blue-900/60 text-blue-400 px-1.5 py-0.5 rounded mt-0.5 w-fit">
              Current
            </span>
          )}
        </div>

        {/* Theme banner */}
        {!hasTheme ? (
          /* Empty state */
          <div className="px-4 flex items-center border-b border-ink-800/50">
            <button
              onClick={() => onOpenPicker(week)}
              className="flex items-center gap-1.5 text-xs text-ink-500 border border-dashed border-ink-700 px-3 py-1.5 rounded-full hover:border-blue-700 hover:text-blue-400 hover:bg-blue-900/20 transition-all"
            >
              <Sparkles size={11} />
              Choose theme for this week
            </button>
          </div>
        ) : !hasPosts ? (
          /* Theme set, plan not generated */
          <div className="px-4 flex items-center gap-3 border-b border-ink-800/50 bg-stone-900/40 border-l-2 border-l-stone-600">
            <Bookmark size={12} className="text-stone-500 shrink-0" />
            <span className="text-xs font-medium text-stone-400 flex-1 truncate">{week.theme}</span>
            <button
              onClick={() => onGeneratePlan(week)}
              disabled={isLoading}
              className="shrink-0 flex items-center gap-1.5 text-xs btn-secondary px-3 py-1.5"
            >
              {isLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              Generate plan
            </button>
          </div>
        ) : allDone ? (
          /* All published */
          <div className="px-4 flex items-center gap-3 border-b border-ink-800/50 bg-emerald-900/20 border-l-2 border-l-emerald-600">
            <Bookmark size={12} className="text-emerald-500 shrink-0" />
            <span className="text-xs font-medium text-emerald-300 flex-1 truncate">{week.theme}</span>
            <span className="text-xs text-emerald-500 shrink-0">6 / 6 published</span>
          </div>
        ) : (
          /* In progress */
          <div className="px-4 flex items-center gap-3 border-b border-ink-800/50 bg-blue-900/10 border-l-2 border-l-blue-700">
            <Bookmark size={12} className="text-blue-400 shrink-0" />
            <span className="text-xs font-medium text-blue-300 flex-1 truncate">{week.theme}</span>
            <span className="text-xs text-blue-500 shrink-0 whitespace-nowrap">
              {progressSummary}
            </span>
          </div>
        )}
      </div>

      {/* ── Row 2: Thread strip — incoming only ── */}
      {incomingThread && (
        <div className="grid border-b border-ink-800/40" style={{ gridTemplateColumns: '72px 1fr' }}>
          <div className="border-r border-ink-800" />
          <div className="flex items-center gap-2 px-3 py-1 min-h-[26px] bg-blue-900/10">
            <span className="text-xs text-blue-500 font-medium whitespace-nowrap shrink-0">
              Thread Planted from Week {prevWeekNumber}
            </span>
            <ArrowRight size={11} className="text-blue-500 shrink-0" />
            <span className="text-xs text-ink-300 italic truncate">"{incomingThread}"</span>
          </div>
        </div>
      )}

      {/* ── Row 3: Day cells ── */}
      <div className="grid" style={{ gridTemplateColumns: '72px repeat(6, minmax(0, 1fr))' }}>
        <div className="border-r border-ink-800 bg-ink-900/20" />
        {DAY_NAMES.map(dayName => {
          const postDate = addDays(weekMonday, DAY_OFFSET[dayName])
          const dateStr  = format(postDate, 'yyyy-MM-dd')
          const isToday  = dateStr === todayStr
          const post     = week.posts.find(p => p.day === dayName) ?? null
          const locked   = !hasTheme || !hasPosts

          return (
            <DayCell
              key={dayName}
              dayName={dayName}
              post={post}
              postDate={postDate}
              isToday={isToday}
              locked={locked}
              hasTheme={hasTheme}
              week={week}
              arcQ={arcQ}
              onClick={() => { if (post) onClickPost(post, postDate) }}
              onSaturdayModal={onSaturdayModal}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── DayCell ──────────────────────────────────────────────────────────────
function DayCell({
  dayName, post, postDate, isToday, locked, hasTheme, week, arcQ, onClick, onSaturdayModal,
}: {
  dayName: string
  post: SlotPost | null
  postDate: Date
  isToday: boolean
  locked: boolean
  hasTheme: boolean
  week: WeekSlot
  arcQ: string
  onClick: () => void
  onSaturdayModal: (data: SatModalData) => void
}) {
  if (locked || !post) {
    return (
      <div className={cn(
        'border-l border-ink-800 px-2 py-2.5 min-h-[80px] flex items-start',
        !hasTheme ? 'opacity-40' : '',
        isToday && 'bg-gold-500/[0.03]',
      )}>
        <span className="text-xs text-ink-500 mt-1">
          {!hasTheme ? 'Set theme first' : !post ? 'Generate plan first' : ''}
        </span>
      </div>
    )
  }

  const chip = statusChip(post.status, post.hasDraft)

  // Action
  let action: React.ReactNode = null
  if (post.status === 'awaiting_market_data' && week.id) {
    action = (
      <button
        onClick={e => {
          e.stopPropagation()
          onSaturdayModal({
            postId:          post.id,
            weekId:          week.id!,
            weekTheme:       week.theme ?? '',
            quarter:         week.quarter ?? arcQ,
            openThread:      week.open_thread,
            targetWordCount: post.target_word_count ?? 220,
          })
        }}
        className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 mt-1"
      >
        <Database size={10} /> Enter market data
      </button>
    )
  } else if (post.status === 'approved') {
    action = (
      <Link
        href={`/dashboard/drafts/${post.id}?from=calendar`}
        onClick={e => e.stopPropagation()}
        className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 mt-1"
      >
        <Send size={10} /> Publish now
      </Link>
    )
  } else if (post.status === 'published') {
    action = (
      <Link
        href={`/dashboard/drafts/${post.id}?from=calendar`}
        onClick={e => e.stopPropagation()}
        className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 mt-1"
      >
        <CheckCircle2 size={10} /> View post
      </Link>
    )
  } else if (post.hasDraft || post.status === 'edited') {
    action = (
      <Link
        href={`/dashboard/drafts/${post.id}?from=calendar`}
        onClick={e => e.stopPropagation()}
        className="flex items-center gap-1 text-xs text-ink-400 hover:text-cream mt-1"
      >
        <PenLine size={10} /> Open editor
      </Link>
    )
  } else {
    action = (
      <Link
        href={`/dashboard/drafts/${post.id}?from=calendar`}
        onClick={e => e.stopPropagation()}
        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1"
      >
        <Sparkles size={10} /> Generate
      </Link>
    )
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'border-l border-ink-800 px-2 py-2.5 min-h-[80px] flex flex-col gap-1 text-left',
        'hover:bg-ink-800/30 transition-colors cursor-pointer',
        isToday && 'bg-gold-500/[0.04] hover:bg-gold-500/[0.07]',
        post.status === 'published' && 'opacity-75',
      )}
    >
      {/* Pillar tag */}
      <span className={cn(
        'text-xs font-medium px-1.5 py-0.5 rounded w-fit',
        PILLAR_TAG[post.pillar] ?? 'bg-stone-800 text-stone-400'
      )}>
        {PILLAR_SHORT[post.pillar] ?? post.pillar}
      </span>

      {/* Hook idea */}
      <span className="text-xs text-ink-300 leading-snug line-clamp-2 flex-1">
        {post.hook_idea ?? FORMAT_LABELS[post.format] ?? post.format}
      </span>

      {/* Status chip */}
      <span className={cn('text-xs px-1.5 py-0.5 rounded w-fit', chip.cls)}>
        {chip.label}
      </span>

      {/* Action */}
      {action}
    </button>
  )
}

// ── PostDrawer ────────────────────────────────────────────────────────────
function PostDrawer({ entry, onClose }: { entry: DrawerPost; onClose: () => void }) {
  const { post, week, postDate } = entry
  const chip = statusChip(post.status, post.hasDraft)

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-ink-900 border-t border-ink-700 shadow-2xl z-40 animate-in slide-in-from-bottom-2 duration-200">
      <div className="px-6 py-4 flex items-start gap-6 max-w-full">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={cn(
              'text-xs font-medium px-2 py-0.5 rounded',
              PILLAR_TAG[post.pillar] ?? 'bg-stone-800 text-stone-400'
            )}>
              {PILLAR_LABELS[post.pillar] ?? post.pillar}
            </span>
            <span className="text-xs text-ink-500 capitalize">{post.day}</span>
            <span className="text-xs text-ink-600">{FORMAT_LABELS[post.format] ?? post.format}</span>
            <span className={cn('text-xs px-2 py-0.5 rounded', chip.cls)}>{chip.label}</span>
            <span className="text-xs text-ink-600">{format(postDate, 'd MMM yyyy')}</span>
          </div>
          {week.theme && (
            <p className="text-xs text-ink-500 mb-1">Wk {week.week_number} — {week.theme}</p>
          )}
          <p className="text-sm text-cream">
            {post.hook_idea ?? 'No hook idea set'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={`/dashboard/drafts/${post.id}?from=calendar`} className="btn-primary text-sm">
            {post.status === 'published'              ? 'View post' :
             post.status === 'approved'               ? 'Open to publish' :
             post.status === 'awaiting_market_data'   ? 'Enter market data' :
             post.hasDraft                            ? 'Open editor' :
             'Generate'}
          </Link>
          <button onClick={onClose} className="btn-ghost p-2"><X size={15} /></button>
        </div>
      </div>
    </div>
  )
}

// ── ThemePickerModal ──────────────────────────────────────────────────────
function ThemePickerModal({
  week, step, proposals, selectedTheme, customTheme, useCustom, error,
  incomingThread, liveDate, arcThemes, onSelectTheme, onCustomTheme, onRefreshProposals, onConfirm, onClose,
}: {
  week: WeekSlot
  step: 'loading' | 'proposals' | 'generating' | 'done'
  proposals: ThemeOption[]
  selectedTheme: ThemeOption | null
  customTheme: string
  useCustom: boolean
  error: string | null
  incomingThread: string | null
  liveDate: string | null
  arcThemes: Record<string, string>
  onSelectTheme: (t: ThemeOption) => void
  onCustomTheme: (v: string) => void
  onRefreshProposals: () => void
  onConfirm: () => void
  onClose: () => void
}) {
  const [showCustom, setShowCustom] = useState(false)
  const confirmed = useCustom ? customTheme.trim().length > 0 : selectedTheme !== null

  const weekMonday = parseDateStr(week.week_start)
  const q = week.quarter ?? getArcQuarter(week.week_start, liveDate)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-ink-800 shrink-0">
          <div>
            <p className="text-xs text-ink-500 uppercase tracking-wider font-medium">Week {week.week_number}</p>
            <h2 className="font-display text-lg text-cream mt-0.5">Choose theme</h2>
            <p className="text-xs text-ink-400 mt-0.5">
              <span className={QUARTER_COLORS[q] ?? ''}>{q}</span>
              {' · '}
              {(arcThemes[q] ?? QUARTER_THEMES[q] ?? '').split(' — ')[0]}
              {' · '}
              {format(weekMonday, 'd MMM')} – {format(addDays(weekMonday, 5), 'd MMM yyyy')}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 mt-0.5"><X size={15} /></button>
        </div>

        {/* Incoming thread callout */}
        {incomingThread && (step === 'proposals' || step === 'loading') && (
          <div className="mx-5 mt-4 px-3 py-2.5 bg-teal-900/20 border border-teal-800/40 rounded-lg flex items-start gap-2 shrink-0">
            <ArrowLeft size={12} className="text-teal-400 shrink-0 mt-0.5" />
            <p className="text-xs text-teal-300 italic">
              Picking up from Wk {week.week_number - 1}: "{incomingThread}"
            </p>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">

          {(step === 'loading') && (
            <div className="flex flex-col items-center py-10 gap-3">
              <Loader2 size={18} className="animate-spin text-gold-500" />
              <p className="text-sm text-ink-400">Finding theme ideas…</p>
            </div>
          )}

          {step === 'generating' && (
            <div className="flex flex-col items-center py-10 gap-3">
              <Loader2 size={18} className="animate-spin text-gold-500" />
              <p className="text-sm text-ink-400">Generating 6-post plan…</p>
              <p className="text-xs text-ink-600">Building narrative continuity</p>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center py-10 gap-3">
              <CheckCircle2 size={20} className="text-emerald-400" />
              <p className="text-sm text-cream">Plan created</p>
            </div>
          )}

          {step === 'proposals' && (
            <>
              {error && (
                <div className="flex items-start gap-2 px-3 py-2 bg-red-900/20 border border-red-800/30 rounded-lg">
                  <AlertCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              {proposals.map((t, i) => (
                <button
                  key={i}
                  onClick={() => { onSelectTheme(t); setShowCustom(false) }}
                  className={cn(
                    'w-full text-left px-4 py-3 rounded-xl border transition-all',
                    selectedTheme?.theme === t.theme && !useCustom
                      ? 'border-gold-500/60 bg-gold-500/5'
                      : 'border-ink-700 hover:border-ink-500 bg-ink-800/40'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'w-3.5 h-3.5 rounded-full border shrink-0 mt-0.5 flex items-center justify-center',
                      selectedTheme?.theme === t.theme && !useCustom
                        ? 'border-gold-500 bg-gold-500'
                        : 'border-ink-600'
                    )}>
                      {selectedTheme?.theme === t.theme && !useCustom && (
                        <div className="w-1.5 h-1.5 rounded-full bg-ink-900" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-cream">{t.theme}</p>
                      <p className="text-xs text-ink-400 mt-0.5 leading-snug">{t.rationale}</p>
                      <div className="flex gap-2 mt-1.5 flex-wrap">
                        <span className="text-xs text-ink-600">{PILLAR_LABELS[t.primary_pillar] ?? t.primary_pillar}</span>
                        <span className="text-ink-700">·</span>
                        <span className="text-xs text-ink-600">{t.primary_audience}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}

              {/* Custom theme */}
              {!showCustom ? (
                <button
                  onClick={() => setShowCustom(true)}
                  className="w-full text-xs text-ink-500 border border-dashed border-ink-700 py-2 rounded-lg hover:text-cream hover:border-ink-500 transition-colors"
                >
                  Write my own theme
                </button>
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={customTheme}
                    onChange={e => onCustomTheme(e.target.value)}
                    placeholder="e.g. The Weight of Unfinished Conversations"
                    className="input text-sm w-full"
                    autoFocus
                  />
                  <p className="text-xs text-ink-600">Be specific — evocative themes produce better posts.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {step === 'proposals' && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-ink-800 shrink-0">
            <button
              onClick={onRefreshProposals}
              className="btn-ghost text-xs flex items-center gap-1.5"
            >
              <RotateCcw size={12} /> New proposals
            </button>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
              <button
                onClick={onConfirm}
                disabled={!confirmed}
                className={cn('btn-primary text-sm', !confirmed && 'opacity-40 cursor-not-allowed')}
              >
                <Sparkles size={13} /> Confirm & generate plan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
