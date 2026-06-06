'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles, ToggleLeft, ToggleRight, Trash2, Plus,
  Loader2, X, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils/helpers'
import type { VoiceRule, RuleCategory } from '@/lib/supabase/types'

const CATEGORY_CONFIG: Record<RuleCategory, { label: string; colour: string }> = {
  avoid_phrase:       { label: 'Avoid phrase',       colour: 'text-red-400 bg-red-900/20 border-red-700/30' },
  prefer_phrase:      { label: 'Prefer phrase',      colour: 'text-emerald-400 bg-emerald-900/20 border-emerald-700/30' },
  structural_pattern: { label: 'Structural pattern', colour: 'text-blue-400 bg-blue-900/20 border-blue-700/30' },
  cta_adjustment:     { label: 'CTA adjustment',     colour: 'text-amber-400 bg-amber-900/20 border-amber-700/30' },
  tone_calibration:   { label: 'Tone calibration',   colour: 'text-violet-400 bg-violet-900/20 border-violet-700/30' },
  opening_style:      { label: 'Opening style',      colour: 'text-teal-400 bg-teal-900/20 border-teal-700/30' },
  closing_style:      { label: 'Closing style',      colour: 'text-pink-400 bg-pink-900/20 border-pink-700/30' },
}

const CATEGORIES = Object.keys(CATEGORY_CONFIG) as RuleCategory[]

export default function RulesPage() {
  const [rules, setRules]               = useState<VoiceRule[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [filterCategory, setFilter]     = useState<RuleCategory | 'all'>('all')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [showAddModal, setShowAddModal] = useState(false)

  const fetchRules = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/rules')
      if (!res.ok) throw new Error(`Failed to load rules (${res.status})`)
      const json = await res.json()
      setRules(json.rules ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

  const toggleRule = async (rule: VoiceRule) => {
    // Optimistic update
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: !r.active } : r))
    try {
      const res = await fetch('/api/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, active: !rule.active }),
      })
      if (!res.ok) throw new Error('Toggle failed')
      const { rule: updated } = await res.json()
      setRules(prev => prev.map(r => r.id === updated.id ? updated : r))
    } catch {
      // Revert on failure
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: rule.active } : r))
    }
  }

  const deleteRule = async (id: string) => {
    // Optimistic remove
    setRules(prev => prev.filter(r => r.id !== id))
    try {
      const res = await fetch('/api/rules', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        // Restore on failure — refetch to get accurate state
        fetchRules()
      }
    } catch {
      fetchRules()
    }
  }

  const onRuleAdded = (rule: VoiceRule) => {
    setRules(prev => [rule, ...prev])
    setShowAddModal(false)
  }

  const activeCount   = rules.filter(r => r.active).length
  const inactiveCount = rules.filter(r => !r.active).length

  const filtered = rules
    .filter(r => filterCategory === 'all' || r.category === filterCategory)
    .filter(r =>
      filterActive === 'all'      ? true :
      filterActive === 'active'   ? r.active :
      !r.active
    )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={18} className="animate-spin text-ink-400" />
        <span className="text-sm text-ink-400 ml-3">Loading rules...</span>
      </div>
    )
  }

  return (
    <div className="px-8 py-8 max-w-4xl mx-auto space-y-8">

      {/* Add Rule Modal */}
      {showAddModal && (
        <AddRuleModal
          onClose={() => setShowAddModal(false)}
          onSaved={onRuleAdded}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="section-label mb-2">Voice Rules</p>
          <h1 className="display-heading text-3xl">Rules Library</h1>
          <p className="text-sm text-ink-400 mt-1">
            {activeCount} active · {inactiveCount} inactive · fed into every generation
          </p>
        </div>
        <button className="btn-secondary" onClick={() => setShowAddModal(true)}>
          <Plus size={15} /> Add rule manually
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="card px-4 py-3 border-red-800/30 bg-red-900/10 flex items-center gap-2">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchRules} className="ml-auto btn-secondary text-xs px-3 py-1.5">
            Retry
          </button>
        </div>
      )}

      {/* Category stat tiles */}
      {rules.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {(Object.entries(CATEGORY_CONFIG) as [RuleCategory, typeof CATEGORY_CONFIG.avoid_phrase][])
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
      )}

      {/* Filters */}
      {rules.length > 0 && (
        <div className="flex items-center gap-2">
          {(['all', 'active', 'inactive'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterActive(f)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filterActive === f ? 'bg-ink-700 text-cream' : 'text-ink-400 hover:text-cream'
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
              Clear filter ×
            </button>
          )}
        </div>
      )}

      {/* Rules list */}
      <div className="space-y-3">
        {rules.length === 0 ? (
          <div className="card py-16 text-center">
            <Sparkles size={24} className="mx-auto mb-3 text-ink-600" />
            <p className="text-ink-500 text-sm">No rules yet.</p>
            <p className="text-xs text-ink-600 mt-1 max-w-xs mx-auto">
              Rules are created automatically when you edit and approve posts.
              You can also add them manually above.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card py-12 text-center">
            <p className="text-ink-500 text-sm">No rules match this filter.</p>
          </div>
        ) : (
          filtered.map(rule => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={() => toggleRule(rule)}
              onDelete={() => deleteRule(rule.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── Rule Card ──────────────────────────────────────────────────────────
function RuleCard({
  rule, onToggle, onDelete,
}: {
  rule: VoiceRule
  onToggle: () => void
  onDelete: () => void
}) {
  const cfg = CATEGORY_CONFIG[rule.category]
  const [expanded, setExpanded] = useState(false)
  const hasExamples = rule.example_before || rule.example_after

  return (
    <div className={cn('card p-4 transition-all', !rule.active && 'opacity-50')}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('badge border text-xs', cfg.colour)}>{cfg.label}</span>
            <span className="text-xs text-ink-500">
              Added {new Date(rule.approved_at).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric'
              })}
            </span>
            {rule.source_post_id && (
              <span className="text-xs text-ink-600 italic">· from edit</span>
            )}
          </div>

          <p className="text-sm text-cream">{rule.rule_text}</p>

          {hasExamples && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-xs text-ink-500 hover:text-cream-muted transition-colors"
            >
              {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {expanded ? 'Hide' : 'Show'} examples
            </button>
          )}

          {expanded && hasExamples && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              {rule.example_before && (
                <div className="bg-red-900/10 border border-red-800/20 rounded-lg p-2.5">
                  <p className="text-xs text-red-400 mb-1">Before</p>
                  <p className="text-xs text-cream-muted italic">"{rule.example_before}"</p>
                </div>
              )}
              {rule.example_after && (
                <div className="bg-emerald-900/10 border border-emerald-800/20 rounded-lg p-2.5">
                  <p className="text-xs text-emerald-400 mb-1">After</p>
                  <p className="text-xs text-cream-muted italic">"{rule.example_after}"</p>
                </div>
              )}
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

// ── Add Rule Modal ─────────────────────────────────────────────────────
function AddRuleModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (rule: VoiceRule) => void
}) {
  const [category, setCategory]           = useState<RuleCategory>('prefer_phrase')
  const [ruleText, setRuleText]           = useState('')
  const [exampleBefore, setExampleBefore] = useState('')
  const [exampleAfter, setExampleAfter]   = useState('')
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState<string | null>(null)

  const handleSave = async () => {
    if (!ruleText.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          rule_text:      ruleText.trim(),
          example_before: exampleBefore.trim() || null,
          example_after:  exampleAfter.trim() || null,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Failed to save (${res.status}): ${text}`)
      }
      const { rule } = await res.json()
      onSaved(rule)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden animate-in">

        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800">
          <h2 className="font-display text-lg text-cream">Add rule manually</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={15} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="section-label">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as RuleCategory)}
              className="input text-sm w-full"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{CATEGORY_CONFIG[cat].label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="section-label">Rule</label>
            <textarea
              value={ruleText}
              onChange={e => setRuleText(e.target.value)}
              placeholder="Describe the rule precisely — e.g. 'Never open a Pillar 3 post with a question. Always open with a statement of fact.'"
              className="input text-sm w-full min-h-[80px] resize-none"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="section-label">Example — Before <span className="text-ink-600 font-normal">(optional)</span></label>
              <textarea
                value={exampleBefore}
                onChange={e => setExampleBefore(e.target.value)}
                placeholder="What to avoid..."
                className="input text-sm w-full min-h-[64px] resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="section-label">Example — After <span className="text-ink-600 font-normal">(optional)</span></label>
              <textarea
                value={exampleAfter}
                onChange={e => setExampleAfter(e.target.value)}
                placeholder="What to write instead..."
                className="input text-sm w-full min-h-[64px] resize-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-ink-800">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!ruleText.trim() || saving}
            className="btn-primary"
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Saving...</>
              : 'Save rule'
            }
          </button>
        </div>
      </div>
    </div>
  )
}
