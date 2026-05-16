'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils/helpers'

type DiffOp = { type: 'same' | 'add' | 'del'; text: string }

function tokenise(text: string): string[] {
  return text.split(/(\s+)/).filter(t => t.length > 0)
}

function computeDiff(original: string, edited: string): DiffOp[] {
  const a = tokenise(original)
  const b = tokenise(edited)
  const m = a.length
  const n = b.length

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1])

  const ops: DiffOp[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) {
      ops.unshift({ type: 'same', text: a[i-1] }); i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      ops.unshift({ type: 'add', text: b[j-1] }); j--
    } else {
      ops.unshift({ type: 'del', text: a[i-1] }); i--
    }
  }
  return ops
}

export default function DiffView({
  original,
  edited,
  className,
}: {
  original: string
  edited: string
  className?: string
}) {
  const diff = useMemo(() => computeDiff(original, edited), [original, edited])

  const addCount = diff.filter(op => op.type === 'add').length
  const delCount = diff.filter(op => op.type === 'del').length
  const hasChanges = addCount > 0 || delCount > 0

  if (!hasChanges) {
    return (
      <div className={cn('flex items-center justify-center text-sm text-ink-500 py-12', className)}>
        No changes — both versions are identical.
      </div>
    )
  }

  // Left panel: original text — show deletions in red, skip additions
  const leftTokens  = diff.filter(op => op.type !== 'add')
  // Right panel: edited text — show additions in green, skip deletions
  const rightTokens = diff.filter(op => op.type !== 'del')

  return (
    <div className={cn('flex flex-col overflow-hidden', className)}>

      {/* Legend bar */}
      <div className="flex items-center gap-5 px-5 py-2 border-b border-ink-800 bg-ink-950/40 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-500/25 border border-red-500/50 inline-block" />
          <span className="text-xs text-red-400">{delCount} removed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-500/25 border border-emerald-500/50 inline-block" />
          <span className="text-xs text-emerald-400">{addCount} added</span>
        </div>
        <span className="text-xs text-ink-600 ml-auto">Word-level split diff</span>
      </div>

      {/* Split panels */}
      <div className="flex flex-1 overflow-hidden divide-x divide-ink-800">

        {/* LEFT: Original with deletions */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 py-1.5 bg-red-900/10 border-b border-red-800/20 shrink-0">
            <p className="text-xs text-red-400 font-medium">Original</p>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <p className="text-sm leading-7 text-cream whitespace-pre-wrap">
              {leftTokens.map((op, i) =>
                op.type === 'del' ? (
                  <del key={i} className="bg-red-500/15 text-red-400 line-through decoration-red-500/60 rounded px-0.5">
                    {op.text}
                  </del>
                ) : (
                  <span key={i}>{op.text}</span>
                )
              )}
            </p>
          </div>
        </div>

        {/* RIGHT: Edited with additions */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 py-1.5 bg-emerald-900/10 border-b border-emerald-800/20 shrink-0">
            <p className="text-xs text-emerald-400 font-medium">Edited</p>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <p className="text-sm leading-7 text-cream whitespace-pre-wrap">
              {rightTokens.map((op, i) =>
                op.type === 'add' ? (
                  <mark key={i} className="bg-emerald-500/20 text-emerald-200 rounded px-0.5 border-b border-emerald-500/40 not-italic">
                    {op.text}
                  </mark>
                ) : (
                  <span key={i}>{op.text}</span>
                )
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
