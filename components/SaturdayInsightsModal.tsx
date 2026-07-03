'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, TrendingUp, Loader2, ChevronRight,
  AlertCircle, Lightbulb,
} from 'lucide-react'
import { cn } from '@/lib/utils/helpers'

type SaturdayInsightsModalProps = {
  postId: string
  weekId: string
  weekTheme: string
  quarter: string
  openThread: string | null
  targetWordCount: number
  onClose: () => void
}

const EXAMPLES = [
  'RBI held rates but hawkish tone surprised — markets read it as a signal for longer pause',
  'IT sector outperformed; Infosys and TCS both beat estimates — visible rotation from FMCG',
  'FII selling accelerated mid-week on US jobs data, DII flows absorbed the dip by Friday',
]

export default function SaturdayInsightsModal({
  postId,
  weekId,
  weekTheme,
  quarter,
  openThread,
  targetWordCount,
  onClose,
}: SaturdayInsightsModalProps) {
  const router = useRouter()
  const [marketContext, setMarketContext] = useState('')
  const [isGenerating, setIsGenerating]  = useState(false)
  const [error, setError]                = useState<string | null>(null)
  const [step, setStep]                  = useState<'input' | 'generating'>('input')

  const wordCount  = marketContext.trim().split(/\s+/).filter(Boolean).length
  const canGenerate = true

  const handleGenerate = async () => {
    if (!canGenerate) return
    setIsGenerating(true)
    setError(null)
    setStep('generating')

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          weekId,
          day:               'saturday',
          pillar:            'financial_intelligence',
          format:            'market_insights',
          theme:             weekTheme,
          targetAudience:    '5-Swans HNI',
          targetWordCount:   targetWordCount || 220,
          hookIdea:          null,
          narrativePosition: 'bridge',
          quarter,
          marketContext,   // ← the real market data Sharath provides
          stream:          false,
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Generation failed (${res.status}): ${text || 'Check Vercel function logs'}`)
      }

      // Redirect to the editor for this post
      onClose()
      router.push(`/dashboard/drafts/${postId}`)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setStep('input')
      setIsGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg flex flex-col bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden animate-in">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-900/30 border border-amber-700/30 flex items-center justify-center">
              <TrendingUp size={15} className="text-amber-400" />
            </div>
            <div>
              <p className="section-label mb-0">Saturday · Market Insights</p>
              <p className="text-sm text-cream font-medium mt-0.5">
                {step === 'input' ? "Add qualitative context for this week" : "Generating your post..."}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-2">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">

          {step === 'generating' ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-amber-900/20 border border-amber-700/20 flex items-center justify-center">
                <Loader2 size={20} className="text-amber-400 animate-spin" />
              </div>
              <p className="text-cream text-sm">Writing your market insights post...</p>
              <p className="text-xs text-ink-500">Weaving your market data with this week's theme</p>
            </div>
          ) : (
            <>
              {/* Week context */}
              <div className="card px-4 py-3 space-y-1.5">
                <div>
                  <p className="text-xs text-ink-500">This week's theme</p>
                  <p className="text-xs text-cream-muted mt-0.5">{weekTheme}</p>
                </div>
                {openThread && (
                  <div>
                    <p className="text-xs text-amber-400/70">Open thread to bridge</p>
                    <p className="text-xs text-cream-muted mt-0.5">"{openThread}"</p>
                  </div>
                )}
              </div>

              {/* Auto-fetch notice */}
              <div className="flex items-start gap-2 px-3 py-3 rounded-lg bg-ink-800 border border-ink-700">
                <Lightbulb size={13} className="text-gold-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs text-cream-muted font-medium">Auto-fetched at generation time</p>
                  <p className="text-xs text-ink-400">Nifty 50, Sensex, Bank Nifty, USD/INR, Gold, Crude Oil, and S&amp;P 500 — live prices and weekly % changes are pulled automatically. You do not need to enter index levels.</p>
                </div>
              </div>

              {/* Qualitative context input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-cream uppercase tracking-wider">
                    Qualitative context <span className="text-ink-500 normal-case font-normal">(optional)</span>
                  </label>
                  <span className="text-xs font-mono text-ink-500">
                    {wordCount}w
                  </span>
                </div>

                <textarea
                  value={marketContext}
                  onChange={e => setMarketContext(e.target.value)}
                  placeholder={`Add colour the numbers can't give — RBI tone, FII sentiment, sector stories, earnings surprises.\n\nFor example:\n• ${EXAMPLES[0]}\n• ${EXAMPLES[1]}`}
                  rows={6}
                  className="input text-sm leading-6 resize-none"
                  autoFocus
                />

                <p className="text-xs text-ink-500">
                  What was the mood? What surprised the market? What did participants miss?
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 px-3 py-3 rounded-lg bg-red-900/20 border border-red-800/30">
                  <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {step === 'input' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-ink-800 shrink-0">
            <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || isGenerating}
              className="btn-primary"
            >
              Generate post
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
