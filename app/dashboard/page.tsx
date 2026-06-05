'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addDays, isSaturday, addWeeks, startOfISOWeek } from 'date-fns'
import {
  Plus, CheckCircle2, Clock, AlertCircle,
  Loader2, CalendarDays, ChevronDown, ChevronUp, TrendingUp,
} from 'lucide-react'
import { cn, PILLAR_LABELS, FORMAT_LABELS, DAY_ORDER, formatDay } from '@/lib/utils/helpers'
import Link from 'next/link'
import PlanningSessionModal from '@/components/PlanningSessionModal'
import SaturdayInsightsModal from '@/components/SaturdayInsightsModal'

const BUFFER_WARNING_DAYS = 14

type Post = {
  id: string; day: string; pillar: string; format: string; status: string
  narrative_position: string | null; target_audience: string | null
  target_word_count: number | null; hook_idea: string | null
  scheduled_at: string | null; approved_at: string | null; week_id: string
}
type Week = {
  id: string; year: number; week_number: number; week_start: string
  theme: string | null; quarter: string | null; status: string
  open_thread: string | null; posts: Post[]
}
type ForwardWeek = { meta: { weekNumber: number; year: number; start: Date }; data: Week | null }
type SaturdayModalData = {
  postId: string; weekId: string; weekTheme: string
  quarter: string; openThread: string | null; targetWordCount: number
}

// ── FIX 3 helper ────────────────────────────────────────────────────
/**
 * Calculate buffer days as the number of calendar days from today
 * through the last day that has an approved/published post.
 *
 * Previously used `daysAhead` = days to `week_start` of the latest
 * planned week, which showed ~7 when week 2 started in 7 days — even
 * though posts ran through Saturday of week 2 (~14 days out).
 */
function calcBufferDays(weeks: ForwardWeek[], today: Date): number {
  const approvedDates: Date[] = []

  for (const fw of weeks) {
    if (!fw.data) continue
    for (const post of fw.data.posts) {
      if (post.status !== 'approved' && post.status !== 'published') continue
      // Derive the post's calendar date from week_start + day offset
      const weekMon = startOfISOWeek(new Date(fw.data.week_start))
      const dayOffset = DAY_ORDER[post.day] ?? 0
      const postDate  = addDays(weekMon, dayOffset)
      if (postDate >= today) approvedDates.push(postDate)
    }
  }

  if (!approvedDates.length) return 0

  const latest = approvedDates.reduce((a, b) => (a > b ? a : b))
  return Math.floor((latest.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

// ── FIX 2 helper ────────────────────────────────────────────────────
/**
 * Returns true when all Mon–Fri posts (days 0–4) of the FIRST
 * forward week are approved/published.
 * When true, the planning modal and API will expose a 3rd forward week.
 */
function isWeek1MonFriApproved(weeks: ForwardWeek[]): boolean {
  const week1 = weeks[0]
  if (!week1?.data) return false
  const monFri = week1.data.posts.filter(p => p.day !== 'saturday')
  return monFri.length >= 5 && monFri.every(p => p.status === 'approved' || p.status === 'published')
}

export default function DashboardPage() {
  const [weeks, setWeeks]             = useState<ForwardWeek[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [showSession, setShowSession] = useState(false)
  const [saturdayModal, setSaturdayModal] = useState<SaturdayModalData | null>(null)
  const today = new Date()
  const todayIsSaturday = isSaturday(today)

  const fetchPlan = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/plan')
      if (!res.ok) throw new Error(`Failed to fetch plan: ${res.status}`)
      setWeeks((await res.json()).weeks ?? [])
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load plan') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchPlan() }, [fetchPlan])

  const hasAnyData = weeks.some(w => w.data !== null)

  // FIX 3: buffer = days to last approved post date, not days to week_start
  const bufferDays = calcBufferDays(weeks, today)
  const showBufferWarning = !loading && (!hasAnyData || bufferDays < BUFFER_WARNING_DAYS)

  // FIX 2: expose to PlanningSessionModal so it can unlock week 3
  const week1MonFriApproved = isWeek1MonFriApproved(weeks)

  const pendingSaturdayPost = todayIsSaturday
    ? weeks.flatMap(w => (w.data?.posts ?? []).map(p => ({ ...p, week: w.data! }))).find(p => p.day === 'saturday' && p.status === 'awaiting_market_data')
    : null

  const openSaturdayModal = (post: Post & { week: Week }) => setSaturdayModal({
    postId: post.id, weekId: post.week.id, weekTheme: post.week.theme ?? '',
    quarter: post.week.quarter ?? 'Q2', openThread: post.week.open_thread,
    targetWordCount: post.target_word_count ?? 220,
  })

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-6">
      {showSession && (
        <PlanningSessionModal
          week1MonFriApproved={week1MonFriApproved}
          onClose={() => setShowSession(false)}
          onComplete={() => { setShowSession(false); fetchPlan() }}
        />
      )}
      {saturdayModal && <SaturdayInsightsModal {...saturdayModal} onClose={() => setSaturdayModal(null)} />}

      {/* Saturday due-today banner */}
      {pendingSaturdayPost && (
        <div className="card px-5 py-4 border-amber-700/30 bg-amber-900/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-900/30 border border-amber-700/30 flex items-center justify-center shrink-0">
              <TrendingUp size={15} className="text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-amber-300 font-medium">Saturday Market Insights due today</p>
              <p className="text-xs text-amber-400/70 mt-0.5">Add this week's market events and generate your post — publish by 11 AM IST</p>
            </div>
          </div>
          <button onClick={() => openSaturdayModal(pendingSaturdayPost as Post & { week: Week })} className="btn-primary shrink-0">
            <TrendingUp size={14} /> Write Saturday post
          </button>
        </div>
      )}

      {/* Buffer warning — FIX 3: now uses real calendar-day buffer */}
      {showBufferWarning && !pendingSaturdayPost && (
        <div className="card px-4 py-3 border-amber-700/30 bg-amber-900/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-amber-400 shrink-0" />
            <p className="text-sm text-amber-300">
              {!hasAnyData
                ? 'No content planned yet — start a planning session.'
                : `Buffer low — ${bufferDays} days ahead. Aim for 14+.`}
            </p>
          </div>
          <button onClick={() => setShowSession(true)} className="btn-primary text-xs px-3 py-2 shrink-0">Plan now</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="section-label mb-2">Forward Plan</p>
          <h1 className="display-heading text-3xl">{format(today, 'EEEE, d MMMM yyyy')}</h1>
        </div>
        {hasAnyData && <button className="btn-primary" onClick={() => setShowSession(true)}><Plus size={15} /> Plan ahead</button>}
      </div>

      {loading && <div className="flex items-center justify-center py-24"><Loader2 size={18} className="animate-spin text-ink-400" /><span className="text-sm text-ink-400 ml-3">Loading...</span></div>}
      {!loading && error && <div className="card px-5 py-4 border-red-800/30 bg-red-900/10"><p className="text-sm text-red-400">{error}</p><button onClick={fetchPlan} className="btn-secondary text-xs mt-3">Try again</button></div>}
      {!loading && !error && !hasAnyData && <EmptyState onStart={() => setShowSession(true)} />}
      {!loading && !error && hasAnyData && weeks.map((fw, i) => (
        <WeekPanel key={`${fw.meta.year}-${fw.meta.weekNumber}`} forwardWeek={fw} weekIndex={i} onRefresh={fetchPlan} onStartSession={() => setShowSession(true)} onOpenSaturdayModal={openSaturdayModal} />
      ))}
    </div>
  )
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 animate-in">
      <div className="w-14 h-14 rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center"><CalendarDays size={24} className="text-gold-500" /></div>
      <div className="space-y-2">
        <h2 className="font-display text-2xl text-cream">No content planned yet</h2>
        <p className="text-sm text-ink-400 max-w-sm">Start a planning session whenever you have time.</p>
      </div>
      <button className="btn-primary" onClick={onStart}><Plus size={15} /> Start planning session</button>
    </div>
  )
}

function WeekPanel({ forwardWeek, weekIndex, onRefresh, onStartSession, onOpenSaturdayModal }: {
  forwardWeek: ForwardWeek; weekIndex: number; onRefresh: () => void
  onStartSession: () => void; onOpenSaturdayModal: (post: Post & { week: Week }) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const { meta, data: week } = forwardWeek
  const weekStartDate = new Date(meta.start)
  const posts = week?.posts ?? []

  // FIX 1: count ALL posts (including Saturday) for both numerator and denominator.
  // Previously totalNonSat excluded Saturday, making a 6-post week show "6/5".
  const approvedCount = posts.filter(p => p.status === 'approved' || p.status === 'published').length
  const totalPosts    = posts.length  // ← was: posts.filter(p => p.day !== 'saturday').length

  const sortedPosts = [...posts].sort((a,b) => (DAY_ORDER[a.day]??0)-(DAY_ORDER[b.day]??0))

  return (
    <section className="space-y-3 animate-in" style={{ animationDelay: `${weekIndex*60}ms` }}>
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <p className="section-label">Week {meta.weekNumber} · {formatDay(weekStartDate)} – {formatDay(addDays(weekStartDate, 5))}</p>
            {week && <span className={cn('badge', week.status === 'confirmed' ? 'badge-approved' : 'badge-draft')}>{week.status === 'confirmed' ? 'Confirmed' : 'Draft'}</span>}
          </div>
          {week?.theme ? <h2 className="font-display text-xl text-cream">{week.theme}</h2> : <h2 className="font-display text-xl text-ink-500 italic">Theme not yet set</h2>}
        </div>
        <div className="flex items-center gap-4">
          {/* FIX 1: use totalPosts (all days) not totalNonSat */}
          {totalPosts > 0 && (
            <div className="text-right hidden sm:block">
              <p className="text-xs text-ink-400">{approvedCount}/{totalPosts} approved</p>
              <div className="mt-1 h-1 w-20 bg-ink-700 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full', approvedCount===totalPosts?'bg-emerald-400':approvedCount>0?'bg-amber-400':'bg-ink-600')} style={{width:`${(approvedCount/totalPosts)*100}%`}} />
              </div>
            </div>
          )}
          {!week?.theme && <button className="btn-primary text-xs px-3 py-2" onClick={e=>{e.stopPropagation();onStartSession()}}><Plus size={13}/> Set theme</button>}
          <span className="text-ink-500">{expanded?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</span>
        </div>
      </div>
      {expanded && (
        <div className="space-y-2">
          {sortedPosts.length === 0
            ? <div className="card py-8 text-center"><p className="text-ink-500 text-sm">{week?.theme?'No posts generated yet.':'Set a theme to generate the week plan.'}</p></div>
            : sortedPosts.map(post => <PostRow key={post.id} post={post} week={week!} onOpenSaturdayModal={onOpenSaturdayModal} />)
          }
        </div>
      )}
    </section>
  )
}

function PostRow({ post, week, onOpenSaturdayModal }: { post: Post; week: Week; onOpenSaturdayModal: (p: Post & {week:Week}) => void }) {
  const isSat  = post.day === 'saturday'
  const satDue = isSat && post.status === 'awaiting_market_data'
  return (
    <div className={cn('card-hover flex items-center gap-4 px-4 py-3', isSat&&!satDue&&'opacity-60 border-dashed', satDue&&'border-amber-700/40 bg-amber-900/5')}>
      <div className="w-24 shrink-0"><p className="text-xs font-medium text-cream capitalize">{post.day}</p><p className="text-xs text-ink-400 mt-0.5">{FORMAT_LABELS[post.format]??post.format}</p></div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-medium mb-0.5',post.pillar==='vedic_leadership'&&'pillar-vedic',post.pillar==='banker_coach'&&'pillar-banker',post.pillar==='coaching_transformation'&&'pillar-coaching',post.pillar==='financial_intelligence'&&'pillar-financial',post.pillar==='inner_work'&&'pillar-inner')}>
          {PILLAR_LABELS[post.pillar]??post.pillar}
        </p>
        {post.hook_idea && <p className="text-sm text-cream-muted truncate">{post.hook_idea}</p>}
      </div>
      <div className="hidden lg:block w-28 shrink-0"><p className="text-xs text-ink-400">{post.target_audience}</p></div>
      <div className="hidden lg:block w-14 shrink-0 text-right"><p className="text-xs font-mono text-ink-500">{post.target_word_count}w</p></div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={post.status} />
        {!isSat && post.status !== 'published' && <Link href={`/dashboard/drafts/${post.id}`} className="btn-ghost text-xs px-2.5 py-1.5">{post.status==='draft'?'Generate':'Open'}</Link>}
        {satDue && <button onClick={() => onOpenSaturdayModal({...post,week})} className="btn-primary text-xs px-2.5 py-1.5"><TrendingUp size={12}/> Add market data</button>}
        {isSat && !satDue && post.status!=='awaiting_market_data' && <Link href={`/dashboard/drafts/${post.id}`} className="btn-ghost text-xs px-2.5 py-1.5">Open</Link>}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string,{label:string;className:string;icon:React.ReactNode}> = {
    awaiting_market_data:{label:'Awaiting',className:'badge-awaiting',icon:<Clock size={10}/>},
    draft:{label:'Draft',className:'badge-draft',icon:null},
    edited:{label:'Edited',className:'badge-edited',icon:null},
    approved:{label:'Approved',className:'badge-approved',icon:<CheckCircle2 size={10}/>},
    scheduled:{label:'Scheduled',className:'badge-scheduled',icon:<Clock size={10}/>},
    published:{label:'Published',className:'badge-published',icon:<CheckCircle2 size={10}/>},
    publish_failed:{label:'Failed',className:'badge-failed',icon:<AlertCircle size={10}/>},
  }
  const {label,className,icon} = cfg[status]??cfg['draft']
  return <span className={className}>{icon}{label}</span>
}
