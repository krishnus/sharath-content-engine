'use client'

import { useState } from 'react'
import { X, CheckCheck, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/helpers'

export type VersionEntry = {
  id: string
  version: number
  wordCount: number
  createdAt: string
  isApproved: boolean
  preview: string
}

type Props = {
  versions: VersionEntry[]       // non-original drafts in ascending version order
  currentVersionId: string | null
  onApprove: (draftId: string, displayNum: number) => Promise<void>
  onClose: () => void
}

export default function VersionPickerModal({ versions, currentVersionId, onApprove, onClose }: Props) {
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const highestId = versions[versions.length - 1]?.id ?? null

  // Assign human-facing version numbers (V1, V2...) by position in ascending order,
  // then reverse so newest appears at the top of the list.
  const labeled = versions.map((v, i) => ({ ...v, displayNum: i + 1 }))
  const descending = [...labeled].reverse()

  async function handleApprove(id: string, displayNum: number) {
    setApprovingId(id)
    try {
      await onApprove(id, displayNum)
    } finally {
      setApprovingId(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-ink-900 border border-ink-700 rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-cream">Which version do you want to approve?</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              {versions.length} versions — select the one that goes forward.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-500 hover:text-cream transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        {/* Version cards */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {descending.map(v => {
            const isCurrent = v.id === (currentVersionId ?? highestId)
            const isApproving = approvingId === v.id
            const alreadyApproved = v.isApproved
            const anyApproving = approvingId !== null

            const dateStr = new Date(v.createdAt).toLocaleString('en-IN', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })

            return (
              <div
                key={v.id}
                className={cn(
                  'border rounded-xl p-4 transition-colors',
                  alreadyApproved
                    ? 'border-gold-600/40 bg-gold-900/10'
                    : isCurrent
                      ? 'border-ink-600 bg-ink-800/50'
                      : 'border-ink-700 bg-ink-800/20'
                )}
              >
                {/* Card header row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-sm font-semibold text-cream font-mono shrink-0">
                      V{v.displayNum}
                    </span>
                    {isCurrent && !alreadyApproved && (
                      <span className="px-1.5 py-0.5 text-xs bg-ink-700 text-ink-300 rounded font-medium shrink-0">
                        Current
                      </span>
                    )}
                    {alreadyApproved && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-gold-900/40 text-gold-400 rounded font-medium shrink-0">
                        <CheckCheck size={10} /> Approved
                      </span>
                    )}
                    <span className="text-xs text-ink-500 shrink-0">
                      {v.wordCount}w · {dateStr}
                    </span>
                  </div>
                  <button
                    onClick={() => handleApprove(v.id, v.displayNum)}
                    disabled={anyApproving || alreadyApproved}
                    className={cn(
                      'btn-primary text-xs px-3 py-1.5 shrink-0 whitespace-nowrap',
                      alreadyApproved && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {isApproving
                      ? <Loader2 size={12} className="animate-spin" />
                      : alreadyApproved
                        ? 'Already approved'
                        : 'Approve this version'
                    }
                  </button>
                </div>

                {/* Content preview */}
                <p className="text-xs text-ink-400 leading-5 line-clamp-3 whitespace-pre-wrap">
                  {v.preview.trim()}
                  {v.preview.length >= 300 && <span className="text-ink-600">…</span>}
                </p>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
