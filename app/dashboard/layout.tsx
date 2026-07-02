'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays, BookOpen, Sparkles, BarChart2,
  Settings, ChevronRight, Flame, Calendar, PenLine,
} from 'lucide-react'
import { cn } from '@/lib/utils/helpers'
import { useState, useEffect } from 'react'

const NAV = [
  { href: '/dashboard',           label: 'Forward Plan',   icon: CalendarDays, exact: true },
  { href: '/dashboard/calendar',  label: 'Calendar',       icon: Calendar },
  { href: '/dashboard/arc',       label: 'Story Arc',      icon: BookOpen },
  { href: '/dashboard/rules',     label: 'Voice Rules',    icon: Sparkles },
  { href: '/dashboard/analytics',  label: 'Analytics',      icon: BarChart2 },
  { href: '/dashboard/free-form',  label: 'Random Post',    icon: PenLine },
  { href: '/dashboard/settings',   label: 'Settings',       icon: Settings },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-screen overflow-hidden bg-ink-950">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 flex flex-col border-r border-ink-800 bg-ink-900">

        {/* Logo */}
        <div className="px-5 py-6 border-b border-ink-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-gold-500/10 border border-gold-500/30 flex items-center justify-center">
              <Flame size={14} className="text-gold-500" />
            </div>
            <div>
              <p className="font-display text-sm text-cream font-medium leading-none">Sharath</p>
              <p className="text-xs text-ink-400 mt-0.5">Content Engine</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group',
                  active
                    ? 'bg-ink-700 text-cream'
                    : 'text-ink-400 hover:bg-ink-800 hover:text-cream'
                )}
              >
                <item.icon size={16} className={active ? 'text-gold-500' : 'text-ink-500 group-hover:text-ink-300'} />
                <span className="flex-1 font-medium">{item.label}</span>
                {active && <ChevronRight size={12} className="text-ink-500" />}
              </Link>
            )
          })}
        </nav>

        {/* Bottom: buffer health pill */}
        <div className="px-4 py-4 border-t border-ink-800">
          <BufferHealthPill />
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

// ── Buffer health pill — now fetches real approved post count ────────
function BufferHealthPill() {
  const [approved, setApproved] = useState(0)
  const [total, setTotal]       = useState(0)

  useEffect(() => {
    fetch('/api/plan')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.weeks) return
        let app = 0, tot = 0
        for (const fw of data.weeks) {
          if (!fw.data) continue
          for (const post of fw.data.posts ?? []) {
            tot++
            if (['approved', 'scheduled', 'published'].includes(post.status)) app++
          }
        }
        setApproved(app)
        setTotal(tot)
      })
      .catch(() => {})
  }, [])

  const pct    = total > 0 ? Math.round((approved / total) * 100) : 0
  const colour = pct >= 80 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-400">Buffer health</span>
        <span className="text-xs font-mono text-cream-muted">{approved}/{total}</span>
      </div>
      <div className="h-1.5 bg-ink-700 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', colour)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-ink-500">{approved} posts ready</p>
    </div>
  )
}
