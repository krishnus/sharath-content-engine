'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Zap, GitCompare, CheckCheck,
  Loader2, AlertTriangle, ChevronDown, ChevronUp,
  Wand2, X, Hash, TrendingUp,
} from 'lucide-react'
import Link from 'next/link'
import { cn, countWords, PILLAR_LABELS, FORMAT_LABELS, getQuarter } from '@/lib/utils/helpers'
import DiffView from '@/components/DiffView'
import PublishPanel from '@/components/PublishPanel'
import MediaPanel from '@/components/MediaPanel'
import CandidateRulesModal, { type CandidateRule } from '@/components/CandidateRulesModal'
import VersionPickerModal, { type VersionEntry } from '@/components/VersionPickerModal'

const REQUIRED_MEDIA: Record<string, string> = {
  long_form_article: 'article_pdf',
  carousel:          'carousel_pdf',
  text_post:         'quote_png',
  market_insights:   'quote_png',
}

// ── Types ─────────────────────────────────────────────────────────────
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
  hashtags: string[]
  scheduled_at: string | null
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

type DraftVersion = VersionEntry

// Normalise a metadata line — strips bold markdown so "**KEY:** value" → "KEY: value"
const normMetaLine = (l: string) => l.replace(/^\*+\s*/, '').replace(/\*+\s*:/g, ':')

// Strip AI metadata from displayed content
function stripMetadata(raw: string): string {
  const metaKeys = ['WORD_COUNT:', 'CORE_INSIGHT:', 'CALLBACK_USED:', 'THREAD_PLANTED:', 'REFERENCES:', 'HASHTAGS:', 'LINKEDIN_CAPTION:', 'QUOTE:']
  const lines = raw.split('\n')
  const firstMetaLine = lines.findIndex(l => metaKeys.some(k => normMetaLine(l).startsWith(k)))
  return (firstMetaLine > -1 ? lines.slice(0, firstMetaLine) : lines).join('\n').trim()
}

// Extract hashtags from raw AI output
function extractHashtags(raw: string): string[] {
  const line = raw.split('\n').find(l => normMetaLine(l).startsWith('HASHTAGS:'))
  if (!line) return []
  return normMetaLine(line).replace('HASHTAGS:', '').trim().split(/\s+/).filter(h => h.startsWith('#'))
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

// ── Page ──────────────────────────────────────────────────────────────
export default function DraftEditorPage() {
  const params = useParams()
  const router = useRouter()
  const postId = params.postId as string

  const [post, setPost]                       = useState<PostData | null>(null)
  const [loadingPost, setLoadingPost]         = useState(true)
  const [loadError, setLoadError]             = useState<string | null>(null)
  const [content, setContent]                 = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [hashtags, setHashtags]               = useState<string[]>([])
  const [versions, setVersions]               = useState<DraftVersion[]>([])
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [wordCount, setWordCount]             = useState(0)
  const [showDiff, setShowDiff]               = useState(false)
  const [showContext, setShowContext]          = useState(false)
  const [showHookPreview, setShowHookPreview] = useState(false)
  const [isGenerating, setIsGenerating]       = useState(false)
  const [isFixingHook, setIsFixingHook]       = useState(false)
  const [generateError, setGenerateError]     = useState<string | null>(null)
  const [isApproving, setIsApproving]         = useState(false)
  const [approved, setApproved]               = useState(false)
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [candidateRules, setCandidateRules]         = useState<CandidateRule[]>([])
  const [showCandidates, setShowCandidates]         = useState(false)
  const [rulesSavedCount, setRulesSavedCount]       = useState<number | null>(null)
  const [mediaRefreshKey, setMediaRefreshKey]       = useState(0)
  const [hasRequiredMedia, setHasRequiredMedia]     = useState(false)
  const [showVersionPicker, setShowVersionPicker]   = useState(false)
  const [showMediaAdvisory, setShowMediaAdvisory]   = useState(false)
  const [approvedVersionNum, setApprovedVersionNum] = useState<number | null>(null)
  const [regenFeedback, setRegenFeedback]           = useState('')
  // Saturday market insights — market context that gates generation for market_insights posts
  const [satMarketContext, setSatMarketContext]     = useState('')

  const textareaRef       = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef      = useRef<ReturnType<typeof setTimeout>>()
  // Ref so the debounced auto-save always reads the latest hashtags without
  // requiring them as a useCallback dependency (avoids timer restarts on every tag change).
  const hashtagsRef       = useRef<string[]>([])
  const regenFeedbackRef  = useRef('')

  // Load real post data on mount
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
        setVersions(json.versions ?? [])
        setActiveVersionId(json.currentVersionId ?? null)
        // Hashtags are persisted on posts.hashtags — load from DB so they survive reloads
        const dbHashtags: string[] = json.post?.hashtags ?? []
        setHashtags(dbHashtags)
        setApproved(json.post?.status === 'approved' || json.post?.status === 'published' || json.post?.status === 'scheduled')
        if (json.post?.status === 'published' && json.post?.linkedin_url) {
          setPublishedUrl(json.post.linkedin_url)
        }
        const requiredType = REQUIRED_MEDIA[json.post?.format ?? '']
        const mediaExists = requiredType
          ? (json.media ?? []).some((m: { media_type: string }) => m.media_type === requiredType)
          : true
        setHasRequiredMedia(mediaExists)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load post')
      } finally {
        setLoadingPost(false)
      }
    }
    load()
  }, [postId])

  useEffect(() => { setWordCount(countWords(content)) }, [content])

  // Keep ref in sync so debounced auto-save always has the current set
  useEffect(() => { hashtagsRef.current = hashtags }, [hashtags])
  useEffect(() => { regenFeedbackRef.current = regenFeedback }, [regenFeedback])

  // Auto-save
  const handleContentChange = useCallback((value: string) => {
    setContent(value)
    setHasUnsavedChanges(true)
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch('/api/drafts/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Include current hashtags via ref so DB stays in sync if user edited them
          body: JSON.stringify({ postId, content: value, hashtags: hashtagsRef.current }),
        })
        setHasUnsavedChanges(false)
      } catch { /* silent */ }
    }, 800)
  }, [postId])

  // Generate draft
  const handleGenerate = useCallback(async () => {
    if (!post) return

    // Saturday market insights posts require real market data before generation
    if (post.format === 'market_insights' && satMarketContext.trim().length < 20) {
      setGenerateError('Add this week\'s market events (at least 20 characters) before generating.')
      return
    }

    setIsGenerating(true)
    setGenerateError(null)
    setContent('')
    setHashtags([])

    const quarter     = post.weeks?.quarter ?? getQuarter(new Date())
    const feedbackVal = regenFeedbackRef.current.trim()

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
          ...(post.format === 'market_insights' ? { marketContext: satMarketContext } : {}),
          ...(feedbackVal ? { feedback: feedbackVal } : {}),
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
      const tags  = extractHashtags(accumulated)
      setContent(clean)
      setOriginalContent(clean)
      setHashtags(tags)
      setRegenFeedback('')
      regenFeedbackRef.current = ''
      // saveDrafts runs server-side before the stream closes, so rawText (with
      // LINKEDIN_CAPTION + ARTICLE_TITLE) is already in the DB when we get here.
      // Incrementing the key forces MediaPanel to remount and re-fetch.
      setMediaRefreshKey(k => k + 1)

      // Refresh versions list — the new draft version was saved server-side
      // during the stream; the client won't know about it until we refetch.
      try {
        const refreshRes = await fetch(`/api/posts/${postId}`)
        if (refreshRes.ok) {
          const refreshJson = await refreshRes.json()
          setVersions(refreshJson.versions ?? [])
          setActiveVersionId(refreshJson.currentVersionId ?? null)
        }
      } catch { /* non-critical — versions visible on next load */ }

    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }, [post, postId, satMarketContext])

  // Fix hook — rewrite just the opening paragraph to fit 210 chars
  const handleFixHook = useCallback(async () => {
    if (!content || !post) return
    setIsFixingHook(true)
    try {
      const res = await fetch('/api/fix-hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, content, pillar: post.pillar }),
      })
      if (!res.ok) throw new Error('Hook fix failed')
      const { fixedContent } = await res.json()
      handleContentChange(fixedContent)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Hook fix failed')
    } finally {
      setIsFixingHook(false)
    }
  }, [content, post, postId, handleContentChange])

  // Core approval logic — shared by direct approval and version picker
  const runApproval = useCallback(async (draftId?: string, displayNum?: number) => {
    setIsApproving(true)
    try {
      const body: Record<string, string> = { postId }
      if (draftId) body.draftId = draftId
      const res = await fetch('/api/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Approval failed')
      const json = await res.json()
      setApproved(true)
      if (displayNum !== undefined) setApprovedVersionNum(displayNum)

      // Show advisory banner if media already exists — it may have been generated from a different version
      if (hasRequiredMedia) setShowMediaAdvisory(true)

      const candidates: CandidateRule[] = json.candidateRules ?? []
      if (candidates.length > 0) {
        setCandidateRules(candidates)
        setShowCandidates(true)
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Approval failed')
    } finally {
      setIsApproving(false)
    }
  }, [postId, hasRequiredMedia])

  // Approve button click — show version picker when 2+ non-original versions exist
  const handleApprove = useCallback(() => {
    if (!content.trim()) return
    if (versions.length >= 2) {
      setShowVersionPicker(true)
    } else {
      runApproval()
    }
  }, [content, versions, runApproval])

  // Called from the version picker after the user picks a version
  const handlePickedApprove = useCallback(async (draftId: string, displayNum: number) => {
    // Switch editor to the chosen version's content if it's not already active
    if (draftId !== activeVersionId) {
      const draftRes = await fetch(`/api/drafts/${draftId}`)
      if (draftRes.ok) {
        const draftJson = await draftRes.json()
        const clean = stripMetadata(draftJson.content ?? '')
        setContent(clean)
        setWordCount(countWords(clean))
        setActiveVersionId(draftId)
      }
    }
    await runApproval(draftId, displayNum)
    setShowVersionPicker(false)
    // Refresh versions list so isApproved flags update
    try {
      const refreshRes = await fetch(`/api/posts/${postId}`)
      if (refreshRes.ok) {
        const refreshJson = await refreshRes.json()
        setVersions(refreshJson.versions ?? [])
        setActiveVersionId(refreshJson.currentVersionId ?? null)
      }
    } catch { /* non-critical */ }
  }, [activeVersionId, postId, runApproval])

  const { min, max } = getWordCountRange(post?.format ?? '')
  const wcStatus =
    wordCount === 0 ? 'empty' :
    wordCount < min  ? 'short' :
    wordCount > max  ? 'over'  : 'ok'

  const firstLine      = content.split('\n')[0] ?? ''
  const hookCharCount  = firstLine.length
  const hookOver       = hookCharCount > 210
  const hasChanges     = content !== originalContent && originalContent.length > 0

  // ── Loading / error states ────────────────────────────────────────
  if (loadingPost) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={18} className="animate-spin text-ink-400" />
        <span className="text-sm text-ink-400 ml-3">Loading post...</span>
      </div>
    )
  }

  if (loadError || !post) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-sm text-red-400">{loadError ?? 'Post not found'}</p>
        <Link href="/dashboard" className="btn-secondary text-sm">
          <ArrowLeft size={14} /> Back
        </Link>
      </div>
    )
  }

  const week = post.weeks

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Candidate Rules Modal ────────────────────────────────── */}
      {showCandidates && (
        <CandidateRulesModal
          candidates={candidateRules}
          sourcePostId={postId}
          onClose={() => setShowCandidates(false)}
          onSaved={(count) => {
            setRulesSavedCount(count)
            setShowCandidates(false)
          }}
        />
      )}

      {/* ── Version Picker Modal ──────────────────────────────────── */}
      {showVersionPicker && (
        <VersionPickerModal
          versions={versions}
          currentVersionId={activeVersionId}
          onApprove={handlePickedApprove}
          onClose={() => setShowVersionPicker(false)}
        />
      )}

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-ink-800 bg-ink-900 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="btn-ghost px-2 py-1.5 shrink-0">
            <ArrowLeft size={15} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-xs font-medium',
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
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-4">
          {/* Word count */}
          <div className="text-right hidden md:block mr-1">
            <p className={cn('text-sm font-mono font-medium',
              wcStatus === 'ok'    && 'word-count-ok',
              wcStatus === 'short' && 'word-count-warning',
              wcStatus === 'over'  && 'word-count-error',
              wcStatus === 'empty' && 'text-ink-500',
            )}>
              {wordCount}w
            </p>
            <p className="text-xs text-ink-500">{min}–{max}</p>
          </div>

          {/* Version selector */}
          {versions.length > 1 && (
            <div className="hidden md:flex items-center gap-1 bg-ink-800 rounded-lg px-1.5 py-1">
              {versions.map((v, i) => (
                <button
                  key={v.id}
                  onClick={async () => {
                    const res = await fetch(`/api/drafts/${v.id}`)
                    if (res.ok) {
                      const json = await res.json()
                      const clean = stripMetadata(json.content ?? '')
                      setContent(clean)
                      setActiveVersionId(v.id)
                    }
                  }}
                  title={`Version ${v.version} — ${v.wordCount}w`}
                  className={cn(
                    'px-2 py-0.5 rounded text-xs font-mono transition-colors',
                    activeVersionId === v.id
                      ? 'bg-ink-600 text-cream'
                      : 'text-ink-500 hover:text-cream'
                  )}
                >
                  v{i + 1}
                </button>
              ))}
            </div>
          )}

          {/* Compare toggle */}
          {hasChanges && (
            <button
              onClick={() => setShowDiff(v => !v)}
              className={cn('btn-ghost', showDiff && 'bg-ink-700 text-cream')}
              title="Compare with original"
            >
              <GitCompare size={15} />
              <span className="text-xs hidden sm:inline">Compare</span>
            </button>
          )}

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || approved}
            className="btn-secondary"
          >
            {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            <span className="hidden sm:inline">
              {isGenerating
                ? 'Generating...'
                : content
                  ? regenFeedback.trim() ? 'Regenerate with feedback' : 'Regenerate'
                  : 'Generate draft'
              }
            </span>
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
                ? <><Loader2 size={15} className="animate-spin" /></>
                : <><CheckCheck size={15} /> Approve</>
            }
          </button>
        </div>
      </header>

      {/* ── Context bar — expandable ─────────────────────────────── */}
      <div className="border-b border-ink-800 bg-ink-950/50 shrink-0">
        <button
          onClick={() => setShowContext(v => !v)}
          className="w-full flex items-start justify-between px-5 py-2 text-left hover:bg-ink-800/30 transition-colors"
        >
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs text-ink-400">
              <span className="text-gold-500 font-medium">Theme:</span>{' '}
              {week?.theme ?? 'No theme set'}
              {week?.quarter && (
                <span className="text-ink-500">
                  {' · '}{week.quarter} · {post.narrative_position?.replace(/_/g, ' ')}
                </span>
              )}
            </p>
            {!showContext && post.hook_idea && (
              <p className="text-xs text-ink-500 mt-0.5">
                <span className="text-gold-500/70 font-medium">Hook:</span>{' '}
                {post.hook_idea}
              </p>
            )}
          </div>
          <span className="text-ink-600 mt-0.5 shrink-0">
            {showContext ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </span>
        </button>

        {showContext && (
          <div className="px-5 pb-3 space-y-2 border-t border-ink-800/50">
            {post.hook_idea && (
              <div>
                <p className="text-xs text-gold-500/70 font-medium mb-0.5">Hook idea</p>
                <p className="text-xs text-cream-muted">{post.hook_idea}</p>
              </div>
            )}
            {week?.open_thread && (
              <div>
                <p className="text-xs text-amber-400 font-medium mb-0.5">Open thread to honour</p>
                <p className="text-xs text-cream-muted">"{week.open_thread}"</p>
              </div>
            )}
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs text-ink-500 font-medium">Audience</p>
                <p className="text-xs text-cream-muted">{post.target_audience}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500 font-medium">Target length</p>
                <p className="text-xs text-cream-muted">{post.target_word_count} words</p>
              </div>
              <div>
                <p className="text-xs text-ink-500 font-medium">Position</p>
                <p className="text-xs text-cream-muted">{post.narrative_position?.replace(/_/g, ' ')}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Saturday market data input ───────────────────────────── */}
      {post.format === 'market_insights' && !approved && (
        <div className="border-b border-amber-700/30 bg-amber-900/10 shrink-0">
          <div className="px-5 py-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={13} className="text-amber-400 shrink-0" />
              <p className="text-xs font-medium text-amber-300">This week&apos;s market events</p>
              <span className={cn(
                'ml-auto text-xs font-mono',
                satMarketContext.trim().split(/\s+/).filter(Boolean).length >= 15
                  ? 'text-emerald-400'
                  : 'text-ink-500'
              )}>
                {satMarketContext.trim().split(/\s+/).filter(Boolean).length}w
              </span>
            </div>
            <textarea
              value={satMarketContext}
              onChange={e => setSatMarketContext(e.target.value)}
              placeholder="Nifty/Sensex moves, RBI announcements, sector rotations, FII flows — be specific with numbers and sector names."
              rows={3}
              className="input text-xs leading-5 resize-none w-full"
            />
            <p className="text-xs text-ink-500">Required before generating. The AI uses only what you provide here — it never fabricates market data.</p>
          </div>
        </div>
      )}

      {/* ── Hook warning — actionable ────────────────────────────── */}
      {content && hookOver && (
        <div className="border-b border-amber-800/30 bg-amber-900/10 shrink-0">
          <div className="flex items-center justify-between px-5 py-2 gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={13} className="text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300">
                Opening line is <span className="font-medium">{hookCharCount} characters</span> —
                LinkedIn shows only the first 210 before "...more".
                The hook needs to be shorter.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowHookPreview(v => !v)}
                className="text-xs text-amber-400 hover:text-amber-300 transition-colors underline underline-offset-2"
              >
                {showHookPreview ? 'Hide preview' : 'Show 210 chars'}
              </button>
              <button
                onClick={handleFixHook}
                disabled={isFixingHook}
                className="btn-secondary text-xs px-2.5 py-1.5"
              >
                {isFixingHook
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Wand2 size={12} />
                }
                Fix hook
              </button>
            </div>
          </div>

          {showHookPreview && (
            <div className="px-5 pb-3 space-y-1">
              <p className="text-xs text-ink-500">What LinkedIn shows:</p>
              <div className="bg-ink-800 rounded-lg p-3 text-sm text-cream-muted">
                <span className="text-cream">{firstLine.slice(0, 210)}</span>
                <span className="text-ink-500">...more</span>
              </div>
              <div className="bg-ink-800 rounded-lg p-3 text-sm text-amber-400/70 border border-dashed border-amber-700/30">
                <span className="line-through opacity-60">{firstLine.slice(210)}</span>
                <span className="text-amber-400/50 ml-1 not-italic text-xs">(hidden by LinkedIn)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hook OK banner */}
      {content && !hookOver && (
        <div className="px-5 py-1.5 border-b border-emerald-800/20 bg-emerald-900/10 shrink-0 flex items-center gap-2">
          <CheckCheck size={11} className="text-emerald-400" />
          <p className="text-xs text-emerald-400">
            Hook is {hookCharCount} chars — fits the 210 char LinkedIn preview
          </p>
        </div>
      )}

      {/* ── Media advisory banner ────────────────────────────────── */}
      {showMediaAdvisory && (
        <div className="px-5 py-2.5 border-b border-amber-700/30 bg-amber-900/10 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} className="text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">
              {approvedVersionNum !== null ? `V${approvedVersionNum} approved.` : 'Approved.'}{' '}
              Media was generated from a previous version — regenerate from the Media panel before publishing.
            </p>
          </div>
          <button onClick={() => setShowMediaAdvisory(false)} className="text-ink-500 hover:text-cream ml-3 shrink-0">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────── */}
      {generateError && (
        <div className="px-5 py-2 border-b border-red-800/30 bg-red-900/10 shrink-0 flex items-center justify-between">
          <p className="text-xs text-red-400">{generateError}</p>
          <button onClick={() => setGenerateError(null)} className="text-ink-500 hover:text-cream ml-3">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Regeneration feedback ────────────────────────────────── */}
      {content && !approved && (
        <div className="border-b border-ink-800 bg-ink-950/50 shrink-0">
          <div className="px-5 py-2.5 space-y-1.5">
            <label className="text-xs font-medium text-ink-400">
              Feedback for next version
              <span className="text-ink-600 font-normal ml-1.5">(optional — leave blank to regenerate as-is)</span>
            </label>
            <textarea
              value={regenFeedback}
              onChange={e => setRegenFeedback(e.target.value)}
              rows={2}
              placeholder="e.g. The opening is too abstract — start with the Singapore trading floor story instead. Make the Vedic section shorter."
              className="input text-xs leading-relaxed resize-none w-full"
              disabled={isGenerating}
            />
          </div>
        </div>
      )}

      {/* ── Main area: editor + sidebar ─────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── Editor column ──────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">

          {showDiff ? (
            <DiffView
              original={originalContent}
              edited={content}
              className="flex-1 overflow-hidden"
            />
          ) : (
            <div className="flex-1 overflow-y-auto px-8 py-6">
              {!content && !isGenerating && (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <p className="text-ink-500 text-sm mb-3">No draft yet.</p>
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
          )}

          {/* Hashtags */}
          {content && (
            <div className="border-t border-ink-800 px-6 py-3 shrink-0 bg-ink-900">
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-1.5 text-ink-500 mt-0.5 shrink-0">
                  <Hash size={13} />
                  <span className="text-xs">Hashtags</span>
                </div>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {hashtags.length > 0 ? (
                    hashtags.map((tag, i) => (
                      <span key={i} className="badge badge-draft text-xs cursor-default">
                        {tag}
                        {!approved && (
                          <button
                            onClick={() => {
                              const updated = hashtags.filter((_, idx) => idx !== i)
                              setHashtags(updated)
                              // Persist removal immediately — no content change, just hashtags
                              fetch('/api/drafts/save', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ postId, hashtags: updated }),
                              }).catch(() => {/* silent */})
                            }}
                            className="ml-1 text-ink-500 hover:text-red-400 transition-colors"
                          >
                            <X size={9} />
                          </button>
                        )}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-ink-600 italic">
                      Hashtags will appear after generating a draft
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>{/* end editor column */}

        {/* ── Right sidebar: Publish + Media ─────────────────────── */}
        {post && (
          <div className="w-80 shrink-0 border-l border-ink-800 overflow-y-auto bg-ink-950/30">
            <div className="p-4 space-y-4">

              {/* Publish panel — always visible, gated when not approved */}
              <PublishPanel
                postId={postId}
                day={post.day}
                format={post.format}
                weekStart={post.weeks?.week_start ?? new Date().toISOString().slice(0, 10)}
                approved={approved}
                postStatus={post.status}
                hasRequiredMedia={hasRequiredMedia}
                scheduledAt={post.scheduled_at ?? undefined}
                onPublished={(url) => setPublishedUrl(url)}
                onScheduled={() => {/* status tracked via postStatus prop */}}
                onStatusReset={() => {
                  setPost(p => p ? { ...p, status: 'approved', scheduled_at: null } : p)
                  setApproved(true)
                }}
              />

              {/* Media panel — only for formats that produce media */}
              {content && (
                <MediaPanel
                  key={mediaRefreshKey}
                  postId={postId}
                  format={post.format}
                  onMediaStatusChange={setHasRequiredMedia}
                  onMediaRegenerated={() => setShowMediaAdvisory(false)}
                />
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  )
}
