'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils/helpers'

// ── Types ──────────────────────────────────────────────────────────────
type DiffOp = { type: 'same' | 'add' | 'del'; text: string }

// ── Word-level LCS diff ───────────────────────────────────────────────
// Tokenises on words + whitespace so spacing is preserved in the output.
function tokenise(text: string): string[] {
  return text.split(/(\s+)/).filter(t => t.length > 0)
}

function computeDiff(original: string, edited: string): DiffOp[] {
  const a = tokenise(original)
  const b = tokenise(edited)
  const m = a.length
  const n = b.length

  // LCS dynamic programming table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  // Backtrack to build diff ops
  const ops: DiffOp[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.unshift({ type: 'same', text: a[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'add', text: b[j - 1] })
      j--
    } else {
      ops.unshift({ type: 'del', text: a[i - 1] })
      i--
    }
  }

  return ops
}

// Collapse long runs of identical tokens into a summary
function collapseUnchanged(ops: DiffOp[], contextWords = 12): DiffOp[] {
  const result: DiffOp[] = []
  let i = 0
  while (i < ops.length) {
    if (ops[i].type !== 'same') {
      result.push(ops[i++])
      continue
    }

    // Collect this run of 'same' tokens
    const runStart = i
    while (i < ops.length && ops[i].type === 'same') i++
    const runEnd = i
    const run = ops.slice(runStart, runEnd)

    // Always show contextWords tokens either side of changes
    const showHead = run.slice(0, contextWords)
    const showTail = run.slice(-contextWords)
    const hiddenCount = run.length - showHead.length - showTail.length

    if (hiddenCount > 0) {
      showHead.forEach(op => result.push(op))
      result.push({ type: 'same', text: `\n\n··· ${hiddenCount} unchanged words ···\n\n` })
      showTail.forEach(op => result.push(op))
    } else {
      run.forEach(op => result.push(op))
    }
  }
  return result
}

// ── DiffView component ────────────────────────────────────────────────
export default function DiffView({
  original,
  edited,
  className,
}: {
  original: string
  edited: string
  className?: string
}) {
  const diff = useMemo(() => {
    const raw = computeDiff(original, edited)
    return collapseUnchanged(raw, 15)
  }, [original, edited])

  const hasChanges = diff.some(op => op.type !== 'same')

  if (!hasChanges) {
    return (
      <div className={cn('p-6 text-center text-ink-500 text-sm', className)}>
        No changes — original and edited versions are identical.
      </div>
    )
  }

  const addCount = diff.filter(op => op.type === 'add').length
  const delCount = diff.filter(op => op.type === 'del').length

  return (
    <div className={cn('flex flex-col', className)}>

      {/* Legend */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-ink-800 bg-ink-950/40 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/40 border border-emerald-500/60" />
          <span className="text-xs text-emerald-400">{addCount} added</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500/30 border border-red-500/50" />
          <span className="text-xs text-red-400">{delCount} removed</span>
        </div>
        <span className="text-xs text-ink-600 ml-auto">Word-level diff</span>
      </div>

      {/* Diff output */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="text-sm leading-7 font-body text-cream whitespace-pre-wrap">
          {diff.map((op, idx) => {
            if (op.type === 'same') {
              // Ellipsis placeholders get special styling
              if (op.text.includes('···')) {
                return (
                  <span
                    key={idx}
                    className="block text-xs text-ink-600 text-center my-2 italic"
                  >
                    {op.text.trim()}
                  </span>
                )
              }
              return <span key={idx}>{op.text}</span>
            }

            if (op.type === 'add') {
              return (
                <mark
                  key={idx}
                  className="bg-emerald-500/15 text-emerald-200 rounded px-0.5 border-b border-emerald-500/40 not-italic"
                >
                  {op.text}
                </mark>
              )
            }

            // op.type === 'del'
            return (
              <del
                key={idx}
                className="bg-red-500/10 text-red-400/70 rounded px-0.5 line-through decoration-red-500/50"
              >
                {op.text}
              </del>
            )
          })}
        </div>
      </div>
    </div>
  )
}
