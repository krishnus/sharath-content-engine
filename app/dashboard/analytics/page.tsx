'use client'

import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, Eye, Heart, MessageSquare, Share2, BarChart2, Loader2, AlertCircle, ExternalLink } from 'lucide-react'
import { cn, PILLAR_LABELS } from '@/lib/utils/helpers'

const STAT_CARDS = [
  { key: 'impressions', label: 'Impressions', icon: Eye,           colour: 'text-blue-400',    bg: 'bg-blue-900/20'    },
  { key: 'likes',       label: 'Likes',       icon: Heart,         colour: 'text-pink-400',    bg: 'bg-pink-900/20'    },
  { key: 'comments',    label: 'Comments',    icon: MessageSquare, colour: 'text-amber-400',   bg: 'bg-amber-900/20'   },
  { key: 'shares',      label: 'Shares',      icon: Share2,        colour: 'text-emerald-400', bg: 'bg-emerald-900/20' },
] as const

type StatKey = typeof STAT_CARDS[number]['key']

type AnalyticsData = {
  hasLinkedInData: boolean
  totalPublished: number
  totals: Record<StatKey, number>
  trend: Record<StatKey, number>
  byPillar: Array<{ pillar: string; posts: number } & Record<StatKey, number>>
  recentPosts: Array<{
    id: string; day: string; pillar: string; theme: string
    impressions: number; likes: number; comments: number; shares: number
    linkedin_url: string | null; published_at: string | null
  }>
}

const PILLAR_BAR: Record<string, string> = {
  vedic_leadership:        'bg-violet-500',
  banker_coach:            'bg-blue-500',
  coaching_transformation: 'bg-emerald-500',
  financial_intelligence:  'bg-amber-500',
  inner_work:              'bg-pink-500',
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export default function AnalyticsPage() {
  const [data, setData]             = useState<AnalyticsData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [metric, setMetric]         = useState<StatKey>('impressions')

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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={18} className="animate-spin text-ink-400" />
      <span className="text-sm text-ink-400 ml-3">Loading analytics...</span>
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

  // Empty state — posts exist but LinkedIn not connected yet
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

  const { totals, trend, byPillar, recentPosts, hasLinkedInData, totalPublished } = data
  const maxPillar = Math.max(...byPillar.map(p => p[metric]), 1)

  // Best-performing pillar by selected metric
  const topPillar = [...byPillar].sort((a,b) => b[metric] - a[metric])[0]
  const secondPillar = [...byPillar].sort((a,b) => b[metric] - a[metric])[1]
  const ratio = secondPillar && secondPillar[metric] > 0
    ? (topPillar[metric] / secondPillar[metric]).toFixed(1)
    : null

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="section-label mb-2">Analytics</p>
          <h1 className="display-heading text-3xl">Performance</h1>
          <p className="text-sm text-ink-400 mt-1">
            {totalPublished} published post{totalPublished !== 1 ? 's' : ''}
            {hasLinkedInData ? ' · Live LinkedIn data' : ' · Connect LinkedIn to see engagement data'}
          </p>
        </div>
        {!hasLinkedInData && (
          <a href="/dashboard/settings" className="btn-secondary text-sm shrink-0">
            Connect LinkedIn
          </a>
        )}
      </div>

      {/* No LinkedIn data yet — show published posts count but grey engagement */}
      {!hasLinkedInData && (
        <div className="card px-4 py-3 border-amber-700/30 bg-amber-900/10 flex items-center gap-2">
          <AlertCircle size={14} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            {totalPublished} post{totalPublished !== 1 ? 's' : ''} published — engagement data will appear once LinkedIn is connected in Settings.
          </p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(({ key, label, icon: Icon, colour, bg }) => {
          const value   = totals[key]
          const trendVal = trend[key]
          const isSelected = metric === key
          return (
            <button
              key={key}
              onClick={() => setMetric(key)}
              className={cn(
                'card p-4 text-left transition-all border',
                isSelected ? 'border-ink-500 bg-ink-700' : 'hover:border-ink-600'
              )}
            >
              <div className={cn('inline-flex p-2 rounded-lg mb-3', bg)}>
                <Icon size={16} className={colour} />
              </div>
              <p className="text-2xl font-mono font-light text-cream">{fmt(value)}</p>
              <p className="text-xs text-ink-400 mt-0.5">{label}</p>
              {hasLinkedInData ? (
                <p className={cn('text-xs mt-2 font-medium', trendVal > 0 ? 'text-emerald-400' : trendVal < 0 ? 'text-red-400' : 'text-ink-500')}>
                  {trendVal > 0 ? '↑' : trendVal < 0 ? '↓' : '—'} {Math.abs(trendVal)}% vs last 30d
                </p>
              ) : (
                <p className="text-xs mt-2 text-ink-600">— no data yet</p>
              )}
            </button>
          )
        })}
      </div>

      {/* Pillar breakdown */}
      {byPillar.length > 0 && (
        <div className="card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="section-label mb-1">By Pillar</p>
              <p className="text-sm text-cream">
                {STAT_CARDS.find(s => s.key === metric)?.label} breakdown
              </p>
            </div>
            <BarChart2 size={18} className="text-ink-500" />
          </div>

          <div className="space-y-4">
            {[...byPillar].sort((a,b) => b[metric] - a[metric]).map(row => {
              const pct = (row[metric] / maxPillar) * 100
              return (
                <div key={row.pillar} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-cream-muted">{PILLAR_LABELS[row.pillar] ?? row.pillar}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-ink-500">{row.posts} post{row.posts !== 1 ? 's' : ''}</span>
                      <span className="text-sm font-mono text-cream">{fmt(row[metric])}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-ink-700 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', PILLAR_BAR[row.pillar] ?? 'bg-ink-500')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Dynamic insight */}
          {topPillar && ratio && hasLinkedInData && (
            <div className="pt-4 border-t border-ink-800">
              <div className="flex items-start gap-2">
                <TrendingUp size={14} className="text-gold-500 mt-0.5 shrink-0" />
                <p className="text-xs text-ink-400">
                  <span className="text-cream-muted font-medium">{PILLAR_LABELS[topPillar.pillar]}</span> posts generate{' '}
                  <span className="text-emerald-400 font-medium">{ratio}× more {metric}</span> per post than{' '}
                  {PILLAR_LABELS[secondPillar!.pillar]}.
                </p>
              </div>
            </div>
          )}
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
                {hasLinkedInData ? (
                  <div className="grid grid-cols-3 gap-6 text-right shrink-0">
                    {([['Impr.', post.impressions], ['Likes', post.likes], ['Cmts', post.comments]] as [string,number][]).map(([label, value]) => (
                      <div key={label}>
                        <p className="text-xs font-mono text-cream">{fmt(value)}</p>
                        <p className="text-xs text-ink-500">{label}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-ink-600 italic shrink-0">no data</span>
                )}
                {post.linkedin_url && (
                  <a href={post.linkedin_url} target="_blank" rel="noopener noreferrer" className="btn-ghost p-1.5 shrink-0">
                    <ExternalLink size={13} className="text-ink-500" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
