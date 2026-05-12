'use client'

import { useState } from 'react'
import { TrendingUp, Eye, Heart, MessageSquare, Share2, BarChart2 } from 'lucide-react'
import { cn, PILLAR_LABELS } from '@/lib/utils/helpers'

// Mock performance data — replace with Supabase query
const MOCK_STATS = {
  totals: { impressions: 42800, likes: 1240, comments: 387, shares: 203 },
  trend:  { impressions: +18, likes: +24, comments: +11, shares: +31 }, // % change vs prev period
  byPillar: [
    { pillar: 'coaching_transformation', impressions: 14200, likes: 487, comments: 162, shares: 89,  posts: 8 },
    { pillar: 'vedic_leadership',        impressions: 11400, likes: 392, comments: 118, shares: 67,  posts: 9 },
    { pillar: 'banker_coach',            impressions:  8900, likes: 198, comments:  54, shares: 28,  posts: 6 },
    { pillar: 'financial_intelligence',  impressions:  5800, likes: 124, comments:  39, shares: 14,  posts: 11 },
    { pillar: 'inner_work',              impressions:  2500, likes:  39, comments:  14, shares:  5,  posts: 4 },
  ],
  recentPosts: [
    { id: '1', day: 'monday',   theme: 'The Courage to Walk Away', pillar: 'coaching_transformation', impressions: 3240, likes: 98, comments: 34, publishedAt: '2026-05-18' },
    { id: '2', day: 'tuesday',  theme: 'The Courage to Walk Away', pillar: 'financial_intelligence',  impressions: 1820, likes: 42, comments: 11, publishedAt: '2026-05-19' },
    { id: '3', day: 'wednesday',theme: 'The Courage to Walk Away', pillar: 'vedic_leadership',        impressions: 2890, likes: 87, comments: 29, publishedAt: '2026-05-20' },
  ],
}

const STAT_CARDS = [
  { key: 'impressions', label: 'Impressions', icon: Eye,           colour: 'text-blue-400',    bg: 'bg-blue-900/20' },
  { key: 'likes',       label: 'Likes',       icon: Heart,         colour: 'text-pink-400',    bg: 'bg-pink-900/20' },
  { key: 'comments',    label: 'Comments',    icon: MessageSquare, colour: 'text-amber-400',   bg: 'bg-amber-900/20' },
  { key: 'shares',      label: 'Shares',      icon: Share2,        colour: 'text-emerald-400', bg: 'bg-emerald-900/20' },
] as const

type StatKey = typeof STAT_CARDS[number]['key']

export default function AnalyticsPage() {
  const [primaryMetric, setPrimaryMetric] = useState<StatKey>('impressions')
  const stats = MOCK_STATS

  const maxPillarValue = Math.max(...stats.byPillar.map(p => p[primaryMetric]))

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <p className="section-label mb-2">Analytics</p>
        <h1 className="display-heading text-3xl">Performance</h1>
        <p className="text-sm text-ink-400 mt-1">Last 30 days · All published posts</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(({ key, label, icon: Icon, colour, bg }) => {
          const value = stats.totals[key]
          const trend = stats.trend[key]
          const isSelected = primaryMetric === key

          return (
            <button
              key={key}
              onClick={() => setPrimaryMetric(key)}
              className={cn(
                'card p-4 text-left transition-all border',
                isSelected ? 'border-ink-500 bg-ink-700' : 'hover:border-ink-600'
              )}
            >
              <div className={cn('inline-flex p-2 rounded-lg mb-3', bg)}>
                <Icon size={16} className={colour} />
              </div>
              <p className="text-2xl font-mono font-light text-cream">
                {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
              </p>
              <p className="text-xs text-ink-400 mt-0.5">{label}</p>
              <p className={cn('text-xs mt-2 font-medium', trend > 0 ? 'text-emerald-400' : 'text-red-400')}>
                {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% vs last period
              </p>
            </button>
          )
        })}
      </div>

      {/* Pillar performance */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="section-label mb-1">By Pillar</p>
            <p className="text-sm text-cream">
              {STAT_CARDS.find(s => s.key === primaryMetric)?.label} breakdown
            </p>
          </div>
          <BarChart2 size={18} className="text-ink-500" />
        </div>

        <div className="space-y-4">
          {[...stats.byPillar]
            .sort((a, b) => b[primaryMetric] - a[primaryMetric])
            .map(row => {
              const pct = maxPillarValue > 0 ? (row[primaryMetric] / maxPillarValue) * 100 : 0
              const value = row[primaryMetric]
              const pillarColour =
                row.pillar === 'vedic_leadership'        ? 'bg-violet-500' :
                row.pillar === 'banker_coach'             ? 'bg-blue-500' :
                row.pillar === 'coaching_transformation'  ? 'bg-emerald-500' :
                row.pillar === 'financial_intelligence'   ? 'bg-amber-500' :
                'bg-pink-500'

              return (
                <div key={row.pillar} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-cream-muted">{PILLAR_LABELS[row.pillar]}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-ink-500">{row.posts} posts</span>
                      <span className="text-sm font-mono text-cream">
                        {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-ink-700 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', pillarColour)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
        </div>

        {/* Insight callout */}
        <div className="pt-4 border-t border-ink-800">
          <div className="flex items-start gap-2">
            <TrendingUp size={14} className="text-gold-500 mt-0.5 shrink-0" />
            <p className="text-xs text-ink-400">
              <span className="text-cream-muted font-medium">Coaching Transformation</span> posts generate{' '}
              <span className="text-emerald-400 font-medium">2.4× more impressions</span> per post than Financial Intelligence —
              confirming its role as your highest-converting pillar.
              Maintain at minimum 1 per week.
            </p>
          </div>
        </div>
      </div>

      {/* Recent posts table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-800">
          <p className="section-label">Recent Posts</p>
        </div>
        <div className="divide-y divide-ink-800">
          {stats.recentPosts.map(post => (
            <div key={post.id} className="flex items-center gap-4 px-5 py-3 hover:bg-ink-800/50 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-cream truncate">{post.theme}</p>
                <p className={cn(
                  'text-xs mt-0.5',
                  post.pillar === 'vedic_leadership'       ? 'pillar-vedic' :
                  post.pillar === 'banker_coach'            ? 'pillar-banker' :
                  post.pillar === 'coaching_transformation' ? 'pillar-coaching' :
                  post.pillar === 'financial_intelligence'  ? 'pillar-financial' :
                  'pillar-inner'
                )}>
                  {PILLAR_LABELS[post.pillar]} · {post.day.charAt(0).toUpperCase() + post.day.slice(1)}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-6 text-right shrink-0">
                {[
                  { label: 'Impr.', value: post.impressions },
                  { label: 'Likes', value: post.likes },
                  { label: 'Cmts', value: post.comments },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs font-mono text-cream">{value >= 1000 ? `${(value/1000).toFixed(1)}k` : value}</p>
                    <p className="text-xs text-ink-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
