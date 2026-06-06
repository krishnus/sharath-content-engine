'use client'

import { useState } from 'react'
import {
  X, CheckCircle2, XCircle, Sparkles,
  ChevronDown, ChevronUp, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils/helpers'
import type { RuleCategory } from '@/lib/supabase/types'

export type CandidateRule = {
  category: RuleCategory
  rule_text: string
  example_before: string | null
  example_after: string | null
}

const CATEGORY_CONFIG: Record<RuleCategory, { label: string; colour: string }> = {
  avoid_phrase:       { label: 'Avoid phrase',       colour: 'text-red-400 bg-red-900/20 border-red-700/30' },
  prefer_phrase:      { label: 'Prefer phrase',      colour: 'text-emerald-400 bg-emerald-900/20 border-emerald-700/30' },
  structural_pattern: { label: 'Structural pattern', colour: 'text-blue-400 bg-blue-900/20 border-blue-700/30' },
  cta_adjustment:     { label: 'CTA adjustment',     colour: 'text-amber-400 bg-amber-900/20 border-amber-700/30' },
  tone_calibration:   { label: 'Tone calibration',   colour: 'text-violet-400 bg-violet-900/20 border-violet-700/30' },
  opening_style:      { label: 'Opening style',      colour: 'text-teal-400 bg-teal-900/20 border-teal-700/30' },
  closing_style:      { label: 'Closing style',      colour: 'text-pink-400 bg-pink-900/20 border-pink-700/30' },
}

export default function CandidateRulesModal({
  candidates,
  sourcePostId,
  onClose,
  onSaved,
}: {
  candidates: CandidateRule[]
  sourcePostId: string
  onClose: () => void
  onSaved: (savedCount: number) => void
}) {
  // Each candidate starts as accepted — user can discard individually
  const [accepted, setAccepted] = useState<boolean[]>(() => candidates.map(() => true))
  const [expanded, setExpanded] = useState<boolean[]>(() => candidates.map(() => false))
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const acceptedCount = accepted.filter(Boolean).length

  const toggle = (i: number) =>
    setAccepted(prev => prev.map((v, idx) => (idx === i ? !v : v)))

  const toggleExpand = (i: number) =>
    setExpanded(prev => prev.map((v, idx) => (idx === i ? !v : v)))

  const handleSave = async () => {
    const toSave = candidates.filter((_, i) => accepted[i])
    if (!toSave.length) { onSaved(0); onClose(); return }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/rules/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: toSave, sourcePostId }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Failed to save rules (${res.status}): ${text}`)
      }
      const { saved } = await res.json()
      onSaved(saved)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-xl max-h-[85vh] flex flex-col bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden animate-in">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-ink-800 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-gold-500/10 border border-gold-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles size={15} className="text-gold-500" />
            </div>
            <div>
              <h2 className="font-display text-lg text-cream">Voice rules detected</h2>
              <p className="text-xs text-ink-400 mt-0.5">
                The engine found {candidates.length} pattern{candidates.length !== 1 ? 's' : ''} in your edits.
                Accept the ones that reflect your voice — discard the rest.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 shrink-0 ml-3">
            <X size={15} />
          </button>
        </div>

        {/* Rules list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {candidates.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-ink-500">No patterns detected in this edit.</p>
              <p className="text-xs text-ink-600 mt-1">
                The AI couldn't identify a consistent voice pattern from this change.
              </p>
            </div>
          ) : (
            candidates.map((rule, i) => {
              const cfg      = CATEGORY_CONFIG[rule.category]
              const isAccepted = accepted[i]
              const isExpanded = expanded[i]
              const hasExamples = rule.example_before || rule.example_after

              return (
                <div
                  key={i}
                  className={cn(
                    'rounded-xl border transition-all duration-200',
                    isAccepted
                      ? 'bg-ink-800 border-ink-600'
                      : 'bg-ink-900 border-ink-800 opacity-50'
                  )}
                >
                  <div className="flex items-start gap-3 px-4 py-3">
                    {/* Accept / discard toggle */}
                    <button
                      onClick={() => toggle(i)}
                      className="shrink-0 mt-0.5 transition-colors"
                      title={isAccepted ? 'Discard this rule' : 'Accept this rule'}
                    >
                      {isAccepted
                        ? <CheckCircle2 size={18} className="text-emerald-400" />
                        : <XCircle size={18} className="text-ink-600" />
                      }
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={cn('badge border text-xs', cfg.colour)}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className={cn(
                        'text-sm transition-colors',
                        isAccepted ? 'text-cream' : 'text-ink-500'
                      )}>
                        {rule.rule_text}
                      </p>

                      {/* Expand to show examples */}
                      {hasExamples && (
                        <button
                          onClick={() => toggleExpand(i)}
                          className="flex items-center gap-1 mt-2 text-xs text-ink-500 hover:text-cream-muted transition-colors"
                        >
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          {isExpanded ? 'Hide' : 'Show'} examples
                        </button>
                      )}

                      {isExpanded && hasExamples && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {rule.example_before && (
                            <div className="bg-red-900/10 border border-red-800/20 rounded-lg p-2.5">
                              <p className="text-xs text-red-400 mb-1">Before</p>
                              <p className="text-xs text-cream-muted italic">
                                "{rule.example_before}"
                              </p>
                            </div>
                          )}
                          {rule.example_after && (
                            <div className="bg-emerald-900/10 border border-emerald-800/20 rounded-lg p-2.5">
                              <p className="text-xs text-emerald-400 mb-1">After</p>
                              <p className="text-xs text-cream-muted italic">
                                "{rule.example_after}"
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-red-900/10 border border-red-800/30">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-ink-800 shrink-0">
          <button onClick={onClose} className="btn-ghost text-sm">
            Skip
          </button>
          <div className="flex items-center gap-3">
            {candidates.length > 0 && (
              <p className="text-xs text-ink-400">
                {acceptedCount} of {candidates.length} selected
              </p>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary"
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Saving...</>
                : <><CheckCircle2 size={14} /> Save {acceptedCount > 0 ? `${acceptedCount} rule${acceptedCount !== 1 ? 's' : ''}` : 'nothing'}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
