'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addDays } from 'date-fns'
import {
  Plus, CheckCircle2, Clock, AlertCircle,
  Loader2, CalendarDays, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn, PILLAR_LABELS, FORMAT_LABELS, DAY_ORDER, formatDay } from '@/lib/utils/helpers'
import Link from 'next/link'
import SundaySessionModal from '@/components/SundaySessionModal'

type Post = {
  id: string
  day: string
  pillar: string
  format: string
  status: string
  narrative_position: string | null
  target_audience: string | null
  target_word_count: number | null
  hook_idea: string | null
  scheduled_at: string | null
  approved_at: string | null
}

type Week = {
  id: string
  year: number
  week_number: number
  week_start: string
  theme: string | null
  quarter: string | null
  status: string
  open_thread: string | null
  posts: Post[]
}

type ForwardWeek = {
  meta: { weekNumber: number; year: number; start: Date }
  data: Week | null
}

export default function DashboardPage() {
  const [weeks, setWeeks]           = useState<ForwardWeek[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [showSession, setShowSession] = useState(false)
  const today = new Date()

  const fetchPlan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/plan')
      if (!res.ok) throw new Error(`Failed to fetch plan: ${res.status}`)
      const json = await res.json()
      setWeeks(json.weeks ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plan')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPlan() }, [fetchPlan])

  const hasAnyData    = weeks.some(w => w.data !== null)
  const approvedCount = weeks.flatMap(w => w.data?.posts ?? []).filter(p => p.status === 'approved').length
  const totalNonSat   = weeks.flatMap(w => w.data?.posts ?? []).filter(p => p.day !== 'saturday').length

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-8">

      {/* Sunday Session Modal */}
      {showSession && (
        <SundaySessionModal
          onClose={() => setShowSession(false)}
          onComplete={() => { setShowSession(false); fetchPlan() }}
        />
      )}

      <div className="flex items-start justify-between">
        <div>
          <p className="section-label mb-2">Forward Plan</p>
          <h1 className="display-heading text-3xl">
            {format(today, 'EEEE, d MMMM yyyy')}
          </h1>
          <p className="text-sm text-ink-400 mt-1">
            Planning weeks of {formatDay(addDays(today, 7))} and {formatDay(addDays(today, 14))}
          </p>
        </div>

        {hasAnyData && (
          <button className="btn-primary" onClick={() => setShowSession(true)}>
            <Plus size={15} />
            New Sunday Session
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="flex items-center gap-3 text-ink-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading your plan...</span>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="card px-5 py-4 border-red-800/30 bg-red-900/10">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchPlan} className="btn-secondary text-xs mt-3">Try again</button>
        </div>
      )}

      {!loading && !error && !hasAnyData && <EmptyState onStart={() => setShowSession(true)} />}

      {!loading && !error && hasAnyData && weeks.map((fw, i) => (
        <WeekPanel
          key={`${fw.meta.year}-${fw.meta.weekNumber}`}
          forwardWeek={fw}
          weekIndex={i}
          onRefresh={fetchPlan}
          onStartSession={() => setShowSession(true)}
        />
      ))}
    </div>
  )
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 animate-in">
      <div className="w-14 h-14 rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
        <CalendarDays size={24} className="text-gold-500" />
      </div>
      <div className="space-y-2">
        <h2 className="font-display text-2xl text-cream">No plan yet</h2>
        <p className="text-sm text-ink-400 max-w-sm">
          Every Sunday, plan the next 2 weeks of content here —
          themes, posts, and drafts in one session.
        </p>
      </div>
      <div className="card px-6 py-5 text-left max-w-sm w-full space-y-3">
        <p className="section-label">Your first Sunday session</p>
        <ol className="space-y-2 text-sm text-cream-muted">
          <li className="flex gap-2"><span className="text-gold-500 font-medium">1.</span> Choose a theme for each of the 2 forward weeks</li>
          <li className="flex gap-2"><span className="text-gold-500 font-medium">2.</span> The engine maps out 6 posts per week</li>
          <li className="flex gap-2"><span className="text-gold-500 font-medium">3.</span> Generate and approve all 10 Mon–Fri drafts</li>
        </ol>
      </div>
      <button className="btn-primary" onClick={onStart}>
        <Plus size={15} />
        Start Sunday Session
      </button>
      <p className="text-xs text-ink-500">~60–90 minutes · Sets up 2 weeks of content</p>
    </div>
  )
}

function WeekPanel({
  forwardWeek, weekIndex, onRefresh, onStartSession,
}: {
  forwardWeek: ForwardWeek
  weekIndex: number
  onRefresh: () => void
  onStartSession: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const { meta, data: week } = forwardWeek
  const weekStartDate  = new Date(meta.start)
  const posts          = week?.posts ?? []
  const approvedCount  = posts.filter(p => p.status === 'approved').length
  const totalNonSat    = posts.filter(p => p.day !== 'saturday').length
  const sortedPosts    = [...posts].sort((a, b) => (DAY_ORDER[a.day] ?? 0) - (DAY_ORDER[b.day] ?? 0))

  return (
    <section className="space-y-3 animate-in" style={{ animationDelay: `${weekIndex * 60}ms` }}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <p className="section-label">
              Week {meta.weekNumber} · {formatDay(weekStartDate)} – {formatDay(addDays(weekStartDate, 5))}
            </p>
            {week && (
              <span className={cn('badge', week.status === 'confirmed' ? 'badge-approved' : 'badge-draft')}>
                {week.status === 'confirmed' ? 'Confirmed' : 'Draft'}
              </span>
            )}
          </div>
          {week?.theme
            ? <h2 className="font-display text-xl text-cream">{week.theme}</h2>
            : <h2 className="font-display text-xl text-ink-500 italic">Theme not yet set</h2>
          }
        </div>

        <div className="flex items-center gap-4">
          {totalNonSat > 0 && (
            <div className="text-right hidden sm:block">
              <p className="text-xs text-ink-400">{approvedCount}/{totalNonSat} approved</p>
              <div className="mt-1 h-1 w-20 bg-ink-700 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full',
                    approvedCount === totalNonSat ? 'bg-emerald-400' :
                    approvedCount > 0 ? 'bg-amber-400' : 'bg-ink-600'
                  )}
                  style={{ width: `${(approvedCount / totalNonSat) * 100}%` }}
                />
              </div>
            </div>
          )}
          {!week?.theme && (
            <button
              className="btn-primary text-xs px-3 py-2"
              onClick={e => { e.stopPropagation(); onStartSession() }}
            >
              <Plus size={13} />
              Set theme
            </button>
          )}
          <span className="text-ink-500">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2">
          {sortedPosts.length === 0 ? (
            <div className="card py-8 text-center">
              <p className="text-ink-500 text-sm">
                {week?.theme ? 'No posts generated yet.' : 'Set a theme to generate the week plan.'}
              </p>
            </div>
          ) : (
            sortedPosts.map(post => <PostRow key={post.id} post={post} />)
          )}
        </div>
      )}
    </section>
  )
}

function PostRow({ post }: { post: Post }) {
  const isSaturday = post.day === 'saturday'
  return (
    <div className={cn('card-hover flex items-center gap-4 px-4 py-3', isSaturday && 'opacity-60 border-dashed')}>
      <div className="w-24 shrink-0">
        <p className="text-xs font-medium text-cream capitalize">{post.day}</p>
        <p className="text-xs text-ink-400 mt-0.5">{FORMAT_LABELS[post.format] ?? post.format}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-medium mb-0.5',
          post.pillar === 'vedic_leadership'       && 'pillar-vedic',
          post.pillar === 'banker_coach'            && 'pillar-banker',
          post.pillar === 'coaching_transformation' && 'pillar-coaching',
          post.pillar === 'financial_intelligence'  && 'pillar-financial',
          post.pillar === 'inner_work'              && 'pillar-inner',
        )}>
          {PILLAR_LABELS[post.pillar] ?? post.pillar}
        </p>
        {post.hook_idea && <p className="text-sm text-cream-muted truncate">{post.hook_idea}</p>}
      </div>
      <div className="hidden lg:block w-28 shrink-0">
        <p className="text-xs text-ink-400">{post.target_audience}</p>
      </div>
      <div className="hidden lg:block w-14 shrink-0 text-right">
        <p className="text-xs font-mono text-ink-500">{post.target_word_count}w</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={post.status} />
        {!isSaturday && post.status !== 'published' && (
          <Link href={`/dashboard/drafts/${post.id}`} className="btn-ghost text-xs px-2.5 py-1.5">
            {post.status === 'draft' ? 'Generate' : 'Open'}
          </Link>
        )}
        {isSaturday && <span className="text-xs text-ink-500 px-2">Saturday AM</span>}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    awaiting_market_data: { label: 'Awaiting',  className: 'badge-awaiting',  icon: <Clock size={10} /> },
    draft:                { label: 'Draft',     className: 'badge-draft',     icon: null },
    edited:               { label: 'Edited',    className: 'badge-edited',    icon: null },
    approved:             { label: 'Approved',  className: 'badge-approved',  icon: <CheckCircle2 size={10} /> },
    scheduled:            { label: 'Scheduled', className: 'badge-scheduled', icon: <Clock size={10} /> },
    published:            { label: 'Published', className: 'badge-published', icon: <CheckCircle2 size={10} /> },
    publish_failed:       { label: 'Failed',    className: 'badge-failed',    icon: <AlertCircle size={10} /> },
  }
  const { label, className, icon } = config[status] ?? config['draft']
  return <span className={className}>{icon}{label}</span>
}
