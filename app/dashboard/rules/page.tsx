'use client'

import { useState } from 'react'
import { Sparkles, ToggleLeft, ToggleRight, Trash2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils/helpers'

type RuleCategory = 'avoid_phrase' | 'prefer_phrase' | 'structural_pattern' | 'cta_adjustment' | 'tone_calibration' | 'opening_style' | 'closing_style'

type Rule = {
  id: string
  category: RuleCategory
  rule_text: string
  example_before: string | null
  example_after: string | null
  source_post_id: string | null
  active: boolean
  approved_at: string
  created_at: string
}

const CATEGORY_CONFIG: Record<RuleCategory, { label: string; colour: string }> = {
  avoid_phrase:       { label: 'Avoid phrase',       colour: 'text-red-400 bg-red-900/20 border-red-700/30' },
  prefer_phrase:      { label: 'Prefer phrase',      colour: 'text-emerald-400 bg-emerald-900/20 border-emerald-700/30' },
  structural_pattern: { label: 'Structural pattern', colour: 'text-blue-400 bg-blue-900/20 border-blue-700/30' },
  cta_adjustment:     { label: 'CTA adjustment',     colour: 'text-amber-400 bg-amber-900/20 border-amber-700/30' },
  tone_calibration:   { label: 'Tone calibration',  colour: 'text-violet-400 bg-violet-900/20 border-violet-700/30' },
  opening_style:      { label: 'Opening style',      colour: 'text-teal-400 bg-teal-900/20 border-teal-700/30' },
  closing_style:      { label: 'Closing style',      colour: 'text-pink-400 bg-pink-900/20 border-pink-700/30' },
}

// Mock rules — replace with Supabase query
const MOCK_RULES: Rule[] = [
  { id: '1', category: 'avoid_phrase',       rule_text: 'Never open with "In today\'s fast-paced world" or any variant.', example_before: 'In today\'s fast-paced world, leaders face many challenges.', example_after: 'I was in a session last week when a Chairman said something that stopped me.', source_post_id: null, active: true, approved_at: '2026-05-12T07:00:00Z', created_at: '2026-05-12T07:00:00Z' },
  { id: '2', category: 'prefer_phrase',      rule_text: 'Open Pillar 1 posts with a specific mythological character name, not the story title.', example_before: 'The Mahabharata teaches us about courage...', example_after: 'Ranchhordas — the name most people never learn for Lord Krishna...', source_post_id: null, active: true, approved_at: '2026-05-14T07:00:00Z', created_at: '2026-05-14T07:00:00Z' },
  { id: '3', category: 'closing_style',      rule_text: 'End Category B posts with a single question — never a statement and a question together.', example_before: 'This is where the real work begins. What would you do differently?', example_after: 'What would you do differently if you knew you were ready?', source_post_id: null, active: true, approved_at: '2026-05-16T07:00:00Z', created_at: '2026-05-16T07:00:00Z' },
  { id: '4', category: 'tone_calibration',   rule_text: 'Finance posts (Pillar 4A) must include at least one specific data point — no general statements about markets.', example_before: 'Markets have been volatile recently.', example_after: 'The Nifty50 dropped 2.3% this week — and the narrative shifted faster than the numbers.', source_post_id: null, active: true, approved_at: '2026-05-17T07:00:00Z', created_at: '2026-05-17T07:00:00Z' },
  { id: '5', category: 'structural_pattern', rule_text: 'In long-form articles, the Vedic reference should appear in the second third — not the opening and not the close.', example_before: null, example_after: null, source_post_id: null, active: false, approved_at: '2026-05-10T07:00:00Z', created_at: '2026-05-10T07:00:00Z' },
]

export default function RulesPage() {
  const [rules, setRules]               = useState(MOCK_RULES)
  const [filterCategory, setFilter]     = useState<RuleCategory | 'all'>('all')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')

  const activeCount   = rules.filter(r => r.active).length
  const inactiveCount = rules.filter(r => !r.active).length

  const filtered = rules
    .filter(r => filterCategory === 'all' || r.category === filterCategory)
    .filter(r => filterActive === 'all' ? true : filterActive === 'active' ? r.active : !r.active)

  const toggleRule = async (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r))
    // TODO: PATCH /api/rules/[id] { active: !current }
  }

  const deleteRule = async (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id))
    // TODO: DELETE /api/rules/[id]
  }

  return (
    <div className="px-8 py-8 max-w-4xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="section-label mb-2">Voice Rules</p>
          <h1 className="display-heading text-3xl">Rules Library</h1>
          <p className="text-sm text-ink-400 mt-1">
            {activeCount} active · {inactiveCount} inactive · fed into every generation
          </p>
        </div>
        <button className="btn-secondary">
          <Plus size={15} />
          Add rule manually
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {(Object.entries(CATEGORY_CONFIG) as Array<[RuleCategory, typeof CATEGORY_CONFIG.avoid_phrase]>)
          .map(([cat, cfg]) => {
            const count = rules.filter(r => r.category === cat && r.active).length
            if (count === 0) return null
            return (
              <button
                key={cat}
                onClick={() => setFilter(filterCategory === cat ? 'all' : cat)}
                className={cn(
                  'card px-3 py-3 text-left transition-all border',
                  filterCategory === cat ? cfg.colour : 'border-ink-700 hover:border-ink-600'
                )}
              >
                <p className="text-xs font-medium">{cfg.label}</p>
                <p className="text-xl font-mono font-light text-cream mt-0.5">{count}</p>
              </button>
            )
          }).filter(Boolean)}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        {(['all', 'active', 'inactive'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterActive(f)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              filterActive === f
                ? 'bg-ink-700 text-cream'
                : 'text-ink-400 hover:text-cream'
            )}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        {filterCategory !== 'all' && (
          <button
            onClick={() => setFilter('all')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gold-500 hover:bg-gold-500/10 transition-colors ml-1"
          >
            Clear category filter
          </button>
        )}
      </div>

      {/* Rules list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="card py-12 text-center">
            <Sparkles size={24} className="mx-auto mb-3 text-ink-600" />
            <p className="text-ink-500 text-sm">No rules match this filter.</p>
            <p className="text-xs text-ink-600 mt-1">Rules are created automatically when you edit and approve posts.</p>
          </div>
        ) : (
          filtered.map(rule => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={() => toggleRule(rule.id)}
              onDelete={() => deleteRule(rule.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function RuleCard({
  rule, onToggle, onDelete
}: {
  rule: Rule
  onToggle: () => void
  onDelete: () => void
}) {
  const cfg = CATEGORY_CONFIG[rule.category]

  return (
    <div className={cn(
      'card p-4 transition-all',
      !rule.active && 'opacity-50'
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('badge border text-xs', cfg.colour)}>
              {cfg.label}
            </span>
            <span className="text-xs text-ink-500">
              Added {new Date(rule.approved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>

          <p className="text-sm text-cream">{rule.rule_text}</p>

          {rule.example_before && rule.example_after && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-red-900/10 border border-red-800/20 rounded-lg p-2.5">
                <p className="text-xs text-red-400 mb-1">Before</p>
                <p className="text-xs text-cream-muted italic">"{rule.example_before}"</p>
              </div>
              <div className="bg-emerald-900/10 border border-emerald-800/20 rounded-lg p-2.5">
                <p className="text-xs text-emerald-400 mb-1">After</p>
                <p className="text-xs text-cream-muted italic">"{rule.example_after}"</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onToggle}
            className="btn-ghost p-2"
            title={rule.active ? 'Deactivate rule' : 'Activate rule'}
          >
            {rule.active
              ? <ToggleRight size={18} className="text-emerald-400" />
              : <ToggleLeft size={18} className="text-ink-500" />
            }
          </button>
          <button
            onClick={onDelete}
            className="btn-ghost p-2 hover:text-red-400"
            title="Delete rule permanently"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
