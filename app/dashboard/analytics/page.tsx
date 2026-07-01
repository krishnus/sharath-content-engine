'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, Eye, Heart, MessageSquare, Share2, BarChart2,
  Loader2, AlertCircle, ExternalLink, Sparkles, ClipboardList,
  RefreshCw, CheckCircle2,
} from 'lucide-react'
import { cn, PILLAR_LABELS } from '@/lib/utils/helpers'
import dynamic from 'next/dynamic'

const AnalyticsCheckinModal = dynamic(() => import('@/components/AnalyticsCheckinModal'), { ssr: false })

const FORMAT_LABELS: Record<string, string> = {
  long_form_article: 'Long-form article',
  text_post:         'Text post',
  carousel:          'Carousel',
  market_insights:   'Market insights',
}

const FORMAT_BAR: Record<string, string> = {
  long_form_article: 'bg-violet-500',
  text_post:         'bg-blue-500',
  carousel:          'bg-amber-500',
  market_insights:   'bg-emerald-500',
}

const PILLAR_BAR: Record<string, string> = {
  vedic_leadership:        'bg-violet-500',
  banker_coach:            'bg-blue-500',
  coaching_transformation: 'bg-emerald-500',
  financial_intelligence:  'bg-amber-500',
  inner_work:              'bg-pink-500',
}

type InsightItem = {
  category: string
  insight: string
  recommendation: string
  confidence: 'high' | 'medium' | 'low'
}

type AnalyticsData = {
  hasLinkedInData: boolean
  totalPublished: number
  postsNeedingCheckin: number
  totals: { impressions: number; likes: number; comments: number; shares: number; reposts: number }
  avgEngagementRate: number
  trend: { impressions: number; likes: number; comments: number; shares: number; engagement_rate: number }
  byPillar: Array<{ pillar: string; posts: number; impressions: number; likes: number; comments: number; avg_engagement_rate: number }>
  byFormat: Array<{ format: string; posts: number; impressions: number; likes: number; comments: number; avg_engagement_rate: number }>
  recentPosts: Array<{
    id: string; day: string; pillar: string; format: string; theme: string
    impressions: number; likes: number; comments: number; reposts: number
    engagement_rate: number; dm_note: string | null; has_manual_entry: boolean
    linkedin_url: string | null; published_at: string | null
  }>
  latestInsight: {
    id: string; generated_at: string; insights: InsightItem[]
    post_count: number; period_start: string | null; period_end: string | null
  } | null
}

type BreakdownMetric = 'likes' | 'comments' | 'avg_engagement_rate'

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

const CONFIDENCE_DOT: Record<string, string> = {
  high:   'bg-emerald-500',
  medium: 'bg-amber-500',
  low:    'bg-ink-500',
}

export default function AnalyticsPage() {
  const [data, setData]               = useState<AnalyticsData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [breakdownMetric, setBreakdownMetric] = useState<BreakdownMetric>('avg_engagement_rate')
  const [showCheckin, setShowCheckin]  = useState(false)
  const [generatingInsights, setGeneratingInsights] = useState(false)
  const [insightError, setInsightError] = useState<string | null>(null)

  const fetchAnalytics = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/analytics')
      if (!res.ok) throw new Error(`Failed to load analytics (${res.status})`)
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAnalytics() }, [fetchAnalytics])

  async function generateInsights() {
    setGeneratingInsights(true); setInsightError(null)
    try {
      const res = await fetch('/api/analytics/insights', { method: 'POST' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? `Failed (${res.status})`)
      }
      await fetchAnalytics()
    } catch (err) {
      setInsightError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGeneratingInsights(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={18} className="animate-spin text-ink-400" />
      <span className="text-sm text-ink-400 ml-3">Loading analytics…</span>
    </div>
  )

  if (error) return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <div className="card px-4 py-3 border-red-800/30 bg-red-900/10 flex items-center gap-2">
        <AlertCircle size={14} className="text-red-400 shrink-0" />
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={fetchAnalytics} className="ml-auto btn-secondary text-xs px-3 py-1.5">Retry</button>
      </div>
    </div>
  )

  if (!data || data.totalPublished === 0) {
    return (
      <div className="px-8 py-8 max-w-5xl mx-auto space-y-6">
        <div>
          <p className="section-label mb-2">Analytics</p>
          <h1 className="display-heading text-3xl">Performance</h1>
        </div>
        <div className="card py-16 text-center space-y-3">
          <BarChart2 size={28} className="mx-auto text-ink-600" />
          <p className="text-ink-400 text-sm">No published posts yet.</p>
          <p className="text-xs text-ink-600 max-w-xs mx-auto">
            Analytics populate once posts are published via LinkedIn. Connect LinkedIn in Settings to enable publishing.
          </p>
          <a href="/dashboard/settings" className="btn-secondary text-sm mx-auto w-fit">Go to Settings</a>
        </div>
      </div>
    )
  }

  const { totals, trend, byPillar, byFormat, recentPosts, latestInsight, postsNeedingCheckin, totalPublished, avgEngagementRate, hasLinkedInData } = data

  const maxPillarVal = Math.max(...byPillar.map(p => p[breakdownMetric] as number), 1)
  const maxFormatVal = Math.max(...byFormat.map(f => f[breakdownMetric] as number), 1)

  const breakdownLabel = breakdownMetric === 'avg_engagement_rate' ? 'Avg engagement rate' :
                         breakdownMetric === 'likes'               ? 'Total likes' : 'Total comments'

  const trendER = trend.engagement_rate

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="section-label mb-2">Analytics</p>
          <h1 className="display-heading text-3xl">Performance</h1>
          <p className="text-sm text-ink-400 mt-1">
            {totalPublished} published post{totalPublished !== 1 ? 's' : ''}
            {hasLinkedInData ? ' · Live LinkedIn data' : ' · Enter impressions via Weekly Check-in'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowCheckin(true)}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <ClipboardList size={14} />
            Weekly Check-in
            {postsNeedingCheckin > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs font-mono">
                {postsNeedingCheckin}
              </span>
            )}
          </button>
          <button
            onClick={generateInsights}
            disabled={generatingInsights}
            className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            {generatingInsights
              ? <Loader2 size={14} className="animate-spin" />
              : <Sparkles size={14} />
            }
            {latestInsight ? 'Refresh Insights' : 'Generate Insights'}
          </button>
        </div>
      </div>

      {/* Check-in banner */}
      {postsNeedingCheckin > 0 && (
        <div
          className="card px-4 py-3 border-amber-700/30 bg-amber-900/10 flex items-center gap-2 cursor-pointer hover:bg-amber-900/20 transition-colors"
          onClick={() => setShowCheckin(true)}
        >
          <AlertCircle size={14} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            <span className="font-medium">{postsNeedingCheckin} post{postsNeedingCheckin !== 1 ? 's' : ''}</span> from the last 14 days need impression data — open LinkedIn Creator Studio, then run the Weekly Check-in.
          </p>
          <button className="ml-auto text-xs text-amber-400 underline shrink-0">Enter now</button>
        </div>
      )}

      {insightError && (
        <div className="card px-4 py-3 border-red-800/30 bg-red-900/10 flex items-center gap-2">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{insightError}</p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Impressions */}
        <button
          onClick={() => setBreakdownMetric('avg_engagement_rate')}
          className={cn('card p-4 text-left transition-all border col-span-1',
            breakdownMetric === 'avg_engagement_rate' ? 'border-ink-500 bg-ink-700' : 'hover:border-ink-600'
          )}
        >
          <div className="inline-flex p-2 rounded-lg mb-3 bg-blue-900/20">
            <Eye size={16} className="text-blue-400" />
          </div>
          <p className="text-2xl font-mono font-light text-cream">{fmt(totals.impressions)}</p>
          <p className="text-xs text-ink-400 mt-0.5">Impressions</p>
          <p className="text-xs mt-2 text-ink-600 italic">manual entry</p>
        </button>

        {/* Likes */}
        <button
          onClick={() => setBreakdownMetric('likes')}
          className={cn('card p-4 text-left transition-all border',
            breakdownMetric === 'likes' ? 'border-ink-500 bg-ink-700' : 'hover:border-ink-600'
          )}
        >
          <div className="inline-flex p-2 rounded-lg mb-3 bg-pink-900/20">
            <Heart size={16} className="text-pink-400" />
          </div>
          <p className="text-2xl font-mono font-light text-cream">{fmt(totals.likes)}</p>
          <p className="text-xs text-ink-400 mt-0.5">Likes</p>
          {hasLinkedInData && (
            <p className={cn('text-xs mt-2 font-medium', trend.likes > 0 ? 'text-emerald-400' : trend.likes < 0 ? 'text-red-400' : 'text-ink-500')}>
              {trend.likes > 0 ? '↑' : trend.likes < 0 ? '↓' : '—'} {Math.abs(trend.likes)}% vs last 30d
            </p>
          )}
        </button>

        {/* Comments */}
        <button
          onClick={() => setBreakdownMetric('comments')}
          className={cn('card p-4 text-left transition-all border',
            breakdownMetric === 'comments' ? 'border-ink-500 bg-ink-700' : 'hover:border-ink-600'
          )}
        >
          <div className="inline-flex p-2 rounded-lg mb-3 bg-amber-900/20">
            <MessageSquare size={16} className="text-amber-400" />
          </div>
          <p className="text-2xl font-mono font-light text-cream">{fmt(totals.comments)}</p>
          <p className="text-xs text-ink-400 mt-0.5">Comments</p>
          {hasLinkedInData && (
            <p className={cn('text-xs mt-2 font-medium', trend.comments > 0 ? 'text-emerald-400' : trend.comments < 0 ? 'text-red-400' : 'text-ink-500')}>
              {trend.comments > 0 ? '↑' : trend.comments < 0 ? '↓' : '—'} {Math.abs(trend.comments)}% vs last 30d
            </p>
          )}
        </button>

        {/* Reposts */}
        <div className="card p-4">
          <div className="inline-flex p-2 rounded-lg mb-3 bg-emerald-900/20">
            <RefreshCw size={16} className="text-emerald-400" />
          </div>
          <p className="text-2xl font-mono font-light text-cream">{fmt(totals.reposts)}</p>
          <p className="text-xs text-ink-400 mt-0.5">Reposts</p>
          {hasLinkedInData && (
            <p className={cn('text-xs mt-2 font-medium', trend.shares > 0 ? 'text-emerald-400' : trend.shares < 0 ? 'text-red-400' : 'text-ink-500')}>
              {trend.shares > 0 ? '↑' : trend.shares < 0 ? '↓' : '—'} {Math.abs(trend.shares)}% vs last 30d
            </p>
          )}
        </div>

        {/* Engagement Rate */}
        <div className="card p-4 bg-gold-500/5 border-gold-500/20">
          <div className="inline-flex p-2 rounded-lg mb-3 bg-gold-500/10">
            <TrendingUp size={16} className="text-gold-500" />
          </div>
          <p className="text-2xl font-mono font-light text-cream">{fmtPct(avgEngagementRate)}</p>
          <p className="text-xs text-ink-400 mt-0.5">Avg engagement rate</p>
          {hasLinkedInData && totals.impressions > 0 && (
            <p className={cn('text-xs mt-2 font-medium', trendER > 0 ? 'text-emerald-400' : trendER < 0 ? 'text-red-400' : 'text-ink-500')}>
              {trendER > 0 ? '↑' : trendER < 0 ? '↓' : '—'} {Math.abs(trendER)}% vs last 30d
            </p>
          )}
          {totals.impressions === 0 && (
            <p className="text-xs mt-2 text-ink-600 italic">needs impressions</p>
          )}
        </div>
      </div>

      {/* AI Insights */}
      {latestInsight && (
        <div className="card p-6 space-y-4 border-gold-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-gold-500" />
              <p className="section-label">AI Performance Insights</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-xs text-ink-500">
                Based on {latestInsight.post_count} posts
                {latestInsight.period_start && ` · ${new Date(latestInsight.period_start).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}–${new Date(latestInsight.generated_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}`}
              </p>
              <button
                onClick={generateInsights}
                disabled={generatingInsights}
                className="text-xs text-ink-500 hover:text-gold-500 transition-colors disabled:opacity-40"
              >
                {generatingInsights ? <Loader2 size={12} className="animate-spin" /> : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {latestInsight.insights.map((item, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-lg bg-ink-800/50">
                <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', CONFIDENCE_DOT[item.confidence] ?? 'bg-ink-500')} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-cream-muted leading-snug">{item.insight}</p>
                  <p className="text-xs text-gold-500/80 mt-1">→ {item.recommendation}</p>
                </div>
                <span className="text-xs text-ink-600 shrink-0 capitalize">{item.category}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!latestInsight && !generatingInsights && (data?.recentPosts.filter(p => p.has_manual_entry).length ?? 0) >= 4 && (
        <div className="card p-6 text-center space-y-3 border-dashed border-ink-700">
          <Sparkles size={20} className="mx-auto text-ink-600" />
          <p className="text-sm text-ink-400">AI pattern analysis ready</p>
          <p className="text-xs text-ink-600">You have enough post data for the AI to identify what's working.</p>
          <button onClick={generateInsights} className="btn-secondary text-sm mx-auto">Generate insights</button>
        </div>
      )}

      {/* Breakdown selector + By Pillar + By Format side by side */}
      {(byPillar.length > 0 || byFormat.length > 0) && (
        <div className="space-y-4">
          {/* Metric selector */}
          <div className="flex items-center gap-2">
            <p className="text-xs text-ink-500 shrink-0">Sort by:</p>
            {(['avg_engagement_rate', 'likes', 'comments'] as BreakdownMetric[]).map(m => (
              <button
                key={m}
                onClick={() => setBreakdownMetric(m)}
                className={cn('text-xs px-3 py-1.5 rounded-lg border transition-all',
                  breakdownMetric === m
                    ? 'border-ink-500 bg-ink-700 text-cream'
                    : 'border-ink-800 text-ink-500 hover:border-ink-700 hover:text-ink-300'
                )}
              >
                {m === 'avg_engagement_rate' ? 'Eng. rate' : m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Pillar */}
            {byPillar.length > 0 && (
              <div className="card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="section-label">By Pillar</p>
                  <p className="text-xs text-ink-500">{breakdownLabel}</p>
                </div>
                <div className="space-y-3.5">
                  {[...byPillar].sort((a,b) => (b[breakdownMetric] as number) - (a[breakdownMetric] as number)).map(row => {
                    const val = row[breakdownMetric] as number
                    const pct = (val / maxPillarVal) * 100
                    return (
                      <div key={row.pillar} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-cream-muted">{PILLAR_LABELS[row.pillar] ?? row.pillar}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-ink-500">{row.posts}p</span>
                            <span className="text-sm font-mono text-cream">
                              {breakdownMetric === 'avg_engagement_rate' ? fmtPct(val) : fmt(val)}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-ink-700 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all duration-500', PILLAR_BAR[row.pillar] ?? 'bg-ink-500')} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* By Format */}
            {byFormat.length > 0 && (
              <div className="card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="section-label">By Format</p>
                  <p className="text-xs text-ink-500">{breakdownLabel}</p>
                </div>
                <div className="space-y-3.5">
                  {[...byFormat].sort((a,b) => (b[breakdownMetric] as number) - (a[breakdownMetric] as number)).map(row => {
                    const val = row[breakdownMetric] as number
                    const pct = (val / maxFormatVal) * 100
                    return (
                      <div key={row.format} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-cream-muted">{FORMAT_LABELS[row.format] ?? row.format}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-ink-500">{row.posts}p</span>
                            <span className="text-sm font-mono text-cream">
                              {breakdownMetric === 'avg_engagement_rate' ? fmtPct(val) : fmt(val)}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-ink-700 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all duration-500', FORMAT_BAR[row.format] ?? 'bg-ink-500')} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent posts */}
      {recentPosts.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-800 flex items-center justify-between">
            <p className="section-label">Recent Posts</p>
            <p className="text-xs text-ink-500">Sorted by most recent</p>
          </div>
          <div className="divide-y divide-ink-800">
            {recentPosts.map(post => (
              <div key={post.id} className="flex items-center gap-4 px-5 py-3 hover:bg-ink-800/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-cream truncate">{post.theme || '—'}</p>
                  <p className={cn('text-xs mt-0.5',
                    post.pillar === 'vedic_leadership'       ? 'pillar-vedic' :
                    post.pillar === 'banker_coach'            ? 'pillar-banker' :
                    post.pillar === 'coaching_transformation' ? 'pillar-coaching' :
                    post.pillar === 'financial_intelligence'  ? 'pillar-financial' :
                    'pillar-inner'
                  )}>
                    {PILLAR_LABELS[post.pillar]} · {post.day.charAt(0).toUpperCase() + post.day.slice(1)}
                    {post.published_at && (
                      <span className="text-ink-600 ml-2">
                        {new Date(post.published_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}
                      </span>
                    )}
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-4 text-right shrink-0">
                  <div>
                    <p className="text-xs font-mono text-cream">{fmt(post.impressions)}</p>
                    <p className="text-xs text-ink-500">Impr.</p>
                  </div>
                  <div>
                    <p className="text-xs font-mono text-cream">{fmt(post.likes)}</p>
                    <p className="text-xs text-ink-500">Likes</p>
                  </div>
                  <div>
                    <p className="text-xs font-mono text-cream">{fmt(post.comments)}</p>
                    <p className="text-xs text-ink-500">Cmts</p>
                  </div>
                  <div>
                    <p className={cn('text-xs font-mono', post.engagement_rate > 0 ? 'text-gold-500' : 'text-ink-600')}>
                      {post.engagement_rate > 0 ? fmtPct(post.engagement_rate) : '—'}
                    </p>
                    <p className="text-xs text-ink-500">ER</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {post.has_manual_entry
                    ? <CheckCircle2 size={12} className="text-emerald-400" />
                    : <div className="w-3 h-3 rounded-full border border-amber-600/50" />
                  }
                  {post.linkedin_url && (
                    <a href={post.linkedin_url} target="_blank" rel="noopener noreferrer" className="btn-ghost p-1">
                      <ExternalLink size={12} className="text-ink-500" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCheckin && (
        <AnalyticsCheckinModal
          onClose={() => setShowCheckin(false)}
          onSaved={() => { setShowCheckin(false); fetchAnalytics() }}
        />
      )}
    </div>
  )
}
