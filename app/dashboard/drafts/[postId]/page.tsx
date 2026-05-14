'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Zap, Eye, EyeOff, CheckCheck,
  Loader2, AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'
import { cn, countWords, PILLAR_LABELS, FORMAT_LABELS, getQuarter } from '@/lib/utils/helpers'

type PostData = {
  id: string
  day: string
  pillar: string
  format: string
  status: string
  narrative_position: string | null
  target_audience: string | null
  target_word_count: number | null
  hook_idea: string | null
  week_id: string
  weeks: {
    id: string
    theme: string | null
    quarter: string | null
    open_thread: string | null
    week_number: number
    week_start: string
  }
}

// Strip AI metadata lines from displayed content
// WORD_COUNT:, CORE_INSIGHT: etc. are saved to story_log — never shown to user
function stripMetadata(raw: string): string {
  const metaKeys = ['WORD_COUNT:', 'CORE_INSIGHT:', 'CALLBACK_USED:', 'THREAD_PLANTED:', 'REFERENCES:']
  const lines = raw.split('\n')
  const firstMetaLine = lines.findIndex(l => metaKeys.some(k => l.trim().startsWith(k)))
  const content = firstMetaLine > -1 ? lines.slice(0, firstMetaLine) : lines
  return content.join('\n').trim()
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

export default function DraftEditorPage() {
  const params = useParams()
  const router = useRouter()
  const postId = params.postId as string

  const [post, setPost]                       = useState<PostData | null>(null)
  const [loadingPost, setLoadingPost]         = useState(true)
  const [loadError, setLoadError]             = useState<string | null>(null)
  const [content, setContent]                 = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [wordCount, setWordCount]             = useState(0)
  const [showOriginal, setShowOriginal]       = useState(false)
  const [isGenerating, setIsGenerating]       = useState(false)
  const [generateError, setGenerateError]     = useState<string | null>(null)
  const [isApproving, setIsApproving]         = useState(false)
  const [approved, setApproved]               = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const textareaRef  = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Load real post data from Supabase on mount
  useEffect(() => {
    async function load() {
      setLoadingPost(true)
      try {
        const res = await fetch(`/api/posts/${postId}`)
        if (!res.ok) throw new Error(`Failed to load post (${res.status})`)
        const json = await res.json()
        setPost(json.post)
        const clean = stripMetadata(json.currentContent ?? '')
        setContent(clean)
        setOriginalContent(stripMetadata(json.originalContent ?? ''))
        setWordCount(countWords(clean))
        setApproved(json.post?.status === 'approved')
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load post')
      } finally {
        setLoadingPost(false)
      }
    }
    load()
  }, [postId])

  useEffect(() => { setWordCount(countWords(content)) }, [content])

  const handleContentChange = useCallback((value: string) => {
    setContent(value)
    setHasUnsavedChanges(true)
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch('/api/drafts/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId, content: value }),
        })
        setHasUnsavedChanges(false)
      } catch { /* silent fail */ }
    }, 800)
  }, [postId])

  const handleGenerate = useCallback(async () => {
    if (!post) return
    setIsGenerating(true)
    setGenerateError(null)
    setContent('')

    const quarter = post.weeks?.quarter ?? getQuarter(new Date())

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          weekId:            post.week_id,
          day:               post.day,
          pillar:            post.pillar,
          format:            post.format,
          theme:             post.weeks?.theme ?? '',
          targetAudience:    post.target_audience ?? 'Category B',
          targetWordCount:   post.target_word_count ?? 950,
          hookIdea:          post.hook_idea,
          narrativePosition: post.narrative_position ?? 'chapter_opening',
          quarter,
          stream: true,
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Generation failed (${res.status}): ${text}`)
      }

      const reader  = res.body?.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          accumulated += decoder.decode(value, { stream: true })
          setContent(stripMetadata(accumulated))
          if (textareaRef.current) {
            textareaRef.current.scrollTop = textareaRef.current.scrollHeight
          }
        }
      }

      const clean = stripMetadata(accumulated)
      setContent(clean)
      setOriginalContent(clean)

    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }, [post, postId])

  const handleApprove = useCallback(async () => {
    if (!content.trim()) return
    setIsApproving(true)
    try {
      const res = await fetch('/api/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })
      if (!res.ok) throw new Error('Approval failed')
      setApproved(true)
      setTimeout(() => router.push('/dashboard'), 1200)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Approval failed')
    } finally {
      setIsApproving(false)
    }
  }, [content, postId, router])

  const { min, max } = getWordCountRange(post?.format ?? '')
  const wcStatus =
    wordCount === 0 ? 'empty' :
    wordCount < min  ? 'short' :
    wordCount > max  ? 'over'  : 'ok'

  const hookComplete = content.length > 0 && content.slice(0, 210).length < 210

  if (loadingPost) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex items-center gap-3 text-ink-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading post...</span>
        </div>
      </div>
    )
  }

  if (loadError || !post) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-sm text-red-400">{loadError ?? 'Post not found'}</p>
        <Link href="/dashboard" className="btn-secondary text-sm">
          <ArrowLeft size={14} /> Back to dashboard
        </Link>
      </div>
    )
  }

  const week = post.weeks

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-ink-800 bg-ink-900 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="btn-ghost px-2 py-1.5">
            <ArrowLeft size={15} />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn(
                'text-xs font-medium',
                post.pillar === 'vedic_leadership'       && 'pillar-vedic',
                post.pillar === 'banker_coach'            && 'pillar-banker',
                post.pillar === 'coaching_transformation' && 'pillar-coaching',
                post.pillar === 'financial_intelligence'  && 'pillar-financial',
                post.pillar === 'inner_work'              && 'pillar-inner',
              )}>
                {PILLAR_LABELS[post.pillar] ?? post.pillar}
              </span>
              <span className="text-ink-600">·</span>
              <span className="text-xs text-ink-400 capitalize">{post.day}</span>
              <span className="text-ink-600">·</span>
              <span className="text-xs text-ink-400">{FORMAT_LABELS[post.format] ?? post.format}</span>
              <span className="text-ink-600">·</span>
              <span className="text-xs text-ink-400">{post.target_audience}</span>
            </div>
            {post.hook_idea && (
              <p className="text-sm text-cream-muted truncate max-w-lg mt-0.5">{post.hook_idea}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
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

          {originalContent && originalContent !== content && (
            <button onClick={() => setShowOriginal(v => !v)} className="btn-ghost">
              {showOriginal ? <EyeOff size={15} /> : <Eye size={15} />}
              <span className="text-xs hidden sm:inline">
                {showOriginal ? 'Hide original' : 'Compare'}
              </span>
            </button>
          )}

          <button
            onClick={handleGenerate}
            disabled={isGenerating || approved}
            className="btn-secondary"
          >
            {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            {isGenerating ? 'Generating...' : content ? 'Regenerate' : 'Generate draft'}
          </button>

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

      {/* Context bar */}
      <div className="px-6 py-2 border-b border-ink-800 bg-ink-950/50 shrink-0 flex items-center gap-4">
        <p className="text-xs text-ink-400 truncate flex-1">
          <span className="text-gold-500 font-medium">Theme:</span>{' '}
          {week?.theme ?? 'No theme set'}
          {week?.quarter && (
            <>{' · '}<span className="text-gold-500 font-medium">Arc:</span>{' '}{week.quarter} · {post.narrative_position?.replace(/_/g, ' ')}</>
          )}
        </p>
        {week?.open_thread && (
          <p className="text-xs text-ink-500 truncate max-w-sm hidden lg:block">
            <span className="text-amber-400">Open thread:</span> "{week.open_thread}"
          </p>
        )}
      </div>

      {/* Hook check */}
      {content && (
        <div className={cn(
          'px-6 py-2 text-xs border-b shrink-0 flex items-center gap-2',
          hookComplete
            ? 'bg-emerald-900/20 border-emerald-800/30 text-emerald-400'
            : 'bg-amber-900/20 border-amber-800/30 text-amber-400'
        )}>
          {hookComplete
            ? <><CheckCheck size={12} /> Hook fits within 210 chars</>
            : <><AlertTriangle size={12} /> Hook extends past 210 chars — LinkedIn will truncate</>
          }
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-hidden flex">
        <div className={cn(
          'flex flex-col overflow-hidden transition-all duration-300',
          showOriginal && originalContent ? 'w-1/2' : 'w-full'
        )}>
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
                  <Zap size={15} /> Generate draft
                </button>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => handleContentChange(e.target.value)}
              className="editor-content w-full"
              placeholder={isGenerating ? 'Generating...' : 'Draft will appear here...'}
              disabled={isGenerating || approved}
              spellCheck
            />
            {hasUnsavedChanges && (
              <p className="text-xs text-ink-500 mt-2 text-right">Saving...</p>
            )}
          </div>
        </div>

        {showOriginal && originalContent && (
          <div className="w-1/2 border-l border-ink-800 flex flex-col overflow-hidden">
            <div className="px-6 py-2 border-b border-ink-800 bg-ink-950/50 shrink-0">
              <p className="text-xs text-ink-400">Original generated draft</p>
            </div>
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div className="editor-content text-ink-400 whitespace-pre-wrap pointer-events-none">
                {originalContent}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
