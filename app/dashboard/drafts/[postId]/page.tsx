'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Zap, Eye, EyeOff, CheckCheck,
  Loader2, AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'
import { cn, countWords, PILLAR_LABELS, FORMAT_LABELS } from '@/lib/utils/helpers'

// ── Mock post data — replace with Supabase fetch ─────────────────────
type MockPostData = {
  id: string
  day: string
  pillar: string
  format: string
  status: string
  narrative_position: string
  target_audience: string
  target_word_count: number
  hook_idea: string
  week: { theme: string; quarter: string }
  originalDraft: string
  currentDraft: string
}

const MOCK_POST: MockPostData = {
  id: '3',
  day: 'wednesday',
  pillar: 'vedic_leadership',
  format: 'long_form_article',
  status: 'draft',
  narrative_position: 'complication',
  target_audience: 'Category A',
  target_word_count: 950,
  hook_idea: 'Ranchhordas: the name for Krishna that most people never learn',
  week: { theme: 'The Courage to Walk Away — Lessons from Ranchhordas', quarter: 'Q2' },
  originalDraft: '',
  currentDraft: '',
}

export default function DraftEditorPage() {
  const params  = useParams()
  const router  = useRouter()
  const postId  = params.postId as string

  const [post]            = useState(MOCK_POST)
  const [content, setContent]     = useState(post.currentDraft)
  const [originalContent]         = useState(post.originalDraft)
  const [showOriginal, setShowOriginal] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [isGenerating, setIsGenerating]  = useState(false)
  const [isApproving, setIsApproving]    = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [approved, setApproved]   = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Live word count
  useEffect(() => {
    setWordCount(countWords(content))
  }, [content])

  // Auto-save on change (debounced 800ms)
  const handleContentChange = useCallback((value: string) => {
    setContent(value)
    setHasUnsavedChanges(true)
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      // TODO: POST /api/drafts/save with { postId, content, wordCount }
      setHasUnsavedChanges(false)
    }, 800)
  }, [])

  // Generate draft
  const handleGenerate = async () => {
    setIsGenerating(true)
    setGenerateError(null)
    setContent('')

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          weekId: 'mock-week-id', // TODO: real weekId
          day: post.day,
          pillar: post.pillar,
          format: post.format,
          theme: post.week.theme,
          targetAudience: post.target_audience,
          targetWordCount: post.target_word_count,
          hookIdea: post.hook_idea,
          narrativePosition: post.narrative_position,
          quarter: post.week.quarter,
          stream: true,
        }),
      })

      if (!res.ok) throw new Error('Generation failed')

      // Stream response into textarea
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          accumulated += decoder.decode(value, { stream: true })
          setContent(accumulated)
          // Auto-scroll textarea to bottom
          if (textareaRef.current) {
            textareaRef.current.scrollTop = textareaRef.current.scrollHeight
          }
        }
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  // Approve post
  const handleApprove = async () => {
    if (!content.trim()) return
    setIsApproving(true)

    try {
      await fetch('/api/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })
      setApproved(true)
      setTimeout(() => router.push('/dashboard'), 1200)
    } catch (err) {
      console.error('Approval failed', err)
    } finally {
      setIsApproving(false)
    }
  }

  // Word count colour
  const { min, max } = getWordCountRange(post.format)
  const wcStatus =
    wordCount === 0 ? 'empty' :
    wordCount < min  ? 'short' :
    wordCount > max  ? 'over'  : 'ok'

  const hookPreview = content.slice(0, 210)
  const hookComplete = hookPreview.length < 210

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-ink-800 bg-ink-900 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="btn-ghost px-2 py-1.5">
            <ArrowLeft size={15} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-xs font-medium capitalize',
                post.pillar === 'vedic_leadership'        && 'pillar-vedic',
                post.pillar === 'banker_coach'             && 'pillar-banker',
                post.pillar === 'coaching_transformation'  && 'pillar-coaching',
                post.pillar === 'financial_intelligence'   && 'pillar-financial',
                post.pillar === 'inner_work'               && 'pillar-inner',
              )}>
                {PILLAR_LABELS[post.pillar]}
              </span>
              <span className="text-ink-600">·</span>
              <span className="text-xs text-ink-400 capitalize">{post.day}</span>
              <span className="text-ink-600">·</span>
              <span className="text-xs text-ink-400">{FORMAT_LABELS[post.format]}</span>
            </div>
            <p className="text-sm text-cream-muted truncate max-w-sm mt-0.5">{post.hook_idea}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Word count */}
          <div className="text-right hidden sm:block">
            <p className={cn(
              'text-sm font-mono font-medium',
              wcStatus === 'ok'    && 'word-count-ok',
              wcStatus === 'short' && 'word-count-warning',
              wcStatus === 'over'  && 'word-count-error',
              wcStatus === 'empty' && 'text-ink-500',
            )}>
              {wordCount} words
            </p>
            <p className="text-xs text-ink-500">target {min}–{max}</p>
          </div>

          {/* Diff toggle */}
          {originalContent && (
            <button
              onClick={() => setShowOriginal(v => !v)}
              className="btn-ghost"
              title={showOriginal ? 'Show edited' : 'Show original'}
            >
              {showOriginal ? <EyeOff size={15} /> : <Eye size={15} />}
              <span className="text-xs">{showOriginal ? 'Hide original' : 'Compare'}</span>
            </button>
          )}

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="btn-secondary"
          >
            {isGenerating
              ? <Loader2 size={15} className="animate-spin" />
              : <Zap size={15} />
            }
            {isGenerating ? 'Generating...' : content ? 'Regenerate' : 'Generate draft'}
          </button>

          {/* Approve */}
          <button
            onClick={handleApprove}
            disabled={!content || isApproving || approved || wcStatus === 'empty'}
            className="btn-primary"
          >
            {approved
              ? <><CheckCheck size={15} /> Approved</>
              : isApproving
                ? <><Loader2 size={15} className="animate-spin" /> Approving...</>
                : <><CheckCheck size={15} /> Approve</>
            }
          </button>
        </div>
      </header>

      {/* ── Editor area ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">

        {/* Editor panel */}
        <div className={cn(
          'flex flex-col overflow-hidden transition-all duration-300',
          showOriginal ? 'w-1/2' : 'w-full'
        )}>

          {/* Hook check banner */}
          {content && (
            <div className={cn(
              'px-6 py-2 text-xs border-b shrink-0 flex items-center gap-2',
              hookComplete
                ? 'bg-emerald-900/20 border-emerald-800/30 text-emerald-400'
                : 'bg-amber-900/20 border-amber-800/30 text-amber-400'
            )}>
              {hookComplete
                ? <><CheckCheck size={12} /> Hook fits within 210 chars — scroll-stopping hook confirmed</>
                : <><AlertTriangle size={12} /> Hook extends past 210 chars — LinkedIn will truncate the opening</>
              }
            </div>
          )}

          {/* Context bar */}
          <div className="px-6 py-2 border-b border-ink-800 bg-ink-950/50 shrink-0">
            <p className="text-xs text-ink-400">
              <span className="text-gold-500 font-medium">Theme:</span>{' '}
              {post.week.theme}
              {' · '}
              <span className="text-gold-500 font-medium">Arc:</span>{' '}
              {post.week.quarter} · {post.narrative_position?.replace(/_/g, ' ')}
            </p>
          </div>

          {/* Textarea */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {generateError && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/20 border border-red-800/30 text-sm text-red-400">
                {generateError}
              </div>
            )}

            {!content && !isGenerating && (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <p className="text-ink-500 text-sm mb-3">No draft yet for this post.</p>
                <button onClick={handleGenerate} className="btn-primary">
                  <Zap size={15} />
                  Generate draft
                </button>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => handleContentChange(e.target.value)}
              className="editor-content w-full"
              placeholder={isGenerating ? 'Generating...' : 'Draft will appear here...'}
              disabled={isGenerating}
              spellCheck
            />

            {/* Save indicator */}
            {hasUnsavedChanges && (
              <p className="text-xs text-ink-500 mt-2 text-right">Saving...</p>
            )}
          </div>
        </div>

        {/* Original comparison panel */}
        {showOriginal && (
          <div className="w-1/2 border-l border-ink-800 flex flex-col overflow-hidden">
            <div className="px-6 py-2 border-b border-ink-800 bg-ink-950/50 shrink-0">
              <p className="text-xs text-ink-400">Original generated draft</p>
            </div>
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div className="editor-content text-ink-400 whitespace-pre-wrap pointer-events-none">
                {originalContent || <span className="italic text-ink-600">No original draft stored.</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function getWordCountRange(format: string): { min: number; max: number } {
  switch (format) {
    case 'long_form_article': return { min: 900, max: 1100 }
    case 'text_post':         return { min: 180, max: 250 }
    case 'market_insights':   return { min: 180, max: 250 }
    case 'carousel':          return { min: 120, max: 250 }
    default:                  return { min: 180, max: 1100 }
  }
}
