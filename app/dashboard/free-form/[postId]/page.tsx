'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  ArrowLeft, Zap, GitCompare, CheckCheck,
  Loader2, AlertTriangle, X, Wand2, Hash, PenLine,
} from 'lucide-react'
import Link from 'next/link'
import { cn, countWords, PILLAR_LABELS, FORMAT_LABELS } from '@/lib/utils/helpers'
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

type FreeFormPost = {
  id: string
  user_prompt: string
  format: string
  pillar: string | null
  status: string
  hashtags: string[]
  scheduled_at: string | null
}

const normMetaLine = (l: string) => l.replace(/^\*+\s*/, '').replace(/\*+\s*:/g, ':')

function stripMetadata(raw: string): string {
  const metaKeys = ['WORD_COUNT:', 'CORE_INSIGHT:', 'CALLBACK_USED:', 'THREAD_PLANTED:', 'REFERENCES:', 'HASHTAGS:', 'LINKEDIN_CAPTION:', 'QUOTE:', 'ARTICLE_TITLE:', 'SLIDE ', 'SERIES_LABEL:', 'SERIES_COUNT:']
  const lines = raw.split('\n')
  const firstMetaLine = lines.findIndex(l => metaKeys.some(k => normMetaLine(l).startsWith(k)))
  return (firstMetaLine > -1 ? lines.slice(0, firstMetaLine) : lines).join('\n').trim()
}

function extractHashtags(raw: string): string[] {
  const line = raw.split('\n').find(l => normMetaLine(l).startsWith('HASHTAGS:'))
  if (!line) return []
  return normMetaLine(line).replace('HASHTAGS:', '').trim().split(/\s+/).filter(h => h.startsWith('#'))
}

function getWordCountRange(format: string): { min: number; max: number } {
  switch (format) {
    case 'long_form_article': return { min: 900, max: 1100 }
    case 'carousel':          return { min: 120, max: 250 }
    default:                  return { min: 180, max: 250 }
  }
}

type DraftVersion = VersionEntry

export default function FreeFormEditorPage() {
  const params = useParams()
  const postId = params.postId as string

  const [post, setPost]                         = useState<FreeFormPost | null>(null)
  const [loadingPost, setLoadingPost]           = useState(true)
  const [loadError, setLoadError]               = useState<string | null>(null)
  const [content, setContent]                   = useState('')
  const [originalContent, setOriginalContent]   = useState('')
  const [hashtags, setHashtags]                 = useState<string[]>([])
  const [versions, setVersions]                 = useState<DraftVersion[]>([])
  const [activeVersionId, setActiveVersionId]   = useState<string | null>(null)
  const [wordCount, setWordCount]               = useState(0)
  const [showDiff, setShowDiff]                 = useState(false)
  const [isGenerating, setIsGenerating]         = useState(false)
  const [isFixingHook, setIsFixingHook]         = useState(false)
  const [generateError, setGenerateError]       = useState<string | null>(null)
  const [isApproving, setIsApproving]           = useState(false)
  const [approved, setApproved]                 = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [candidateRules, setCandidateRules]     = useState<CandidateRule[]>([])
  const [showCandidates, setShowCandidates]     = useState(false)
  const [rulesSavedCount, setRulesSavedCount]   = useState<number | null>(null)
  const [mediaRefreshKey, setMediaRefreshKey]   = useState(0)
  const [linkedinUrl, setLinkedinUrl]           = useState<string | null>(null)
  const [hasRequiredMedia, setHasRequiredMedia] = useState(false)
  const [showVersionPicker, setShowVersionPicker] = useState(false)
  const [showMediaAdvisory, setShowMediaAdvisory] = useState(false)
  const [approvedVersionNum, setApprovedVersionNum] = useState<number | null>(null)
  const [showHookPreview, setShowHookPreview]   = useState(false)
  const [autoGenTriggered, setAutoGenTriggered] = useState(false)
  const [regenFeedback, setRegenFeedback]       = useState('')

  const textareaRef       = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef      = useRef<ReturnType<typeof setTimeout>>()
  const hashtagsRef       = useRef<string[]>([])
  const regenFeedbackRef  = useRef('')

  // Load post data
  useEffect(() => {
    async function load() {
      setLoadingPost(true)
      try {
        const res = await fetch(`/api/free-form/posts/${postId}`)
        if (!res.ok) throw new Error(`Failed to load post (${res.status})`)
        const json = await res.json()
        setPost(json.post)
        const clean = stripMetadata(json.currentContent ?? '')
        setContent(clean)
        setOriginalContent(stripMetadata(json.originalContent ?? ''))
        setWordCount(countWords(clean))
        setVersions(json.versions ?? [])
        setActiveVersionId(json.currentVersionId ?? null)
        const dbHashtags: string[] = json.post?.hashtags ?? []
        setHashtags(dbHashtags)
        hashtagsRef.current = dbHashtags
        setApproved(['approved', 'published', 'scheduled'].includes(json.post?.status ?? ''))
        if (json.linkedinUrl) setLinkedinUrl(json.linkedinUrl)
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
  useEffect(() => { hashtagsRef.current = hashtags }, [hashtags])
  useEffect(() => { regenFeedbackRef.current = regenFeedback }, [regenFeedback])

  // Auto-generate on first load when there's no content yet
  useEffect(() => {
    if (!loadingPost && !loadError && post && !content && !autoGenTriggered) {
      setAutoGenTriggered(true)
      handleGenerate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingPost, loadError, post, content, autoGenTriggered])

  // Auto-save
  const handleContentChange = useCallback((value: string) => {
    setContent(value)
    setHasUnsavedChanges(true)
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch('/api/free-form/drafts/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId, content: value, hashtags: hashtagsRef.current }),
        })
        setHasUnsavedChanges(false)
      } catch { /* silent */ }
    }, 800)
  }, [postId])

  // Generate
  const handleGenerate = useCallback(async () => {
    const currentPost = post
    if (!currentPost) return

    setIsGenerating(true)
    setGenerateError(null)
    setContent('')
    setHashtags([])

    const feedbackVal = regenFeedbackRef.current.trim()

    try {
      const res = await fetch('/api/free-form/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          userPrompt: currentPost.user_prompt,
          format:     currentPost.format,
          pillar:     currentPost.pillar,
          ...(feedbackVal ? { feedback: feedbackVal } : {}),
          stream:     true,
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
      setMediaRefreshKey(k => k + 1)

      try {
        const refreshRes = await fetch(`/api/free-form/posts/${postId}`)
        if (refreshRes.ok) {
          const refreshJson = await refreshRes.json()
          setVersions(refreshJson.versions ?? [])
          setActiveVersionId(refreshJson.currentVersionId ?? null)
        }
      } catch { /* non-critical */ }

    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }, [post, postId])

  // Fix hook
  const handleFixHook = useCallback(async () => {
    if (!content) return
    setIsFixingHook(true)
    try {
      const res = await fetch('/api/free-form/fix-hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, content }),
      })
      if (!res.ok) throw new Error('Hook fix failed')
      const { fixedContent } = await res.json()
      handleContentChange(fixedContent)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Hook fix failed')
    } finally {
      setIsFixingHook(false)
    }
  }, [content, postId, handleContentChange])

  // Approval
  const runApproval = useCallback(async (draftId?: string, displayNum?: number) => {
    setIsApproving(true)
    try {
      const body: Record<string, string> = { postId }
      if (draftId) body.draftId = draftId
      const res = await fetch('/api/free-form/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Approval failed')
      const json = await res.json()
      setApproved(true)
      if (displayNum !== undefined) setApprovedVersionNum(displayNum)
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

  const handleApprove = useCallback(() => {
    if (!content.trim()) return
    if (versions.length >= 2) {
      setShowVersionPicker(true)
    } else {
      runApproval()
    }
  }, [content, versions, runApproval])

  const handlePickedApprove = useCallback(async (draftId: string, displayNum: number) => {
    if (draftId !== activeVersionId) {
      const draftRes = await fetch(`/api/free-form/drafts/${draftId}`)
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
    try {
      const refreshRes = await fetch(`/api/free-form/posts/${postId}`)
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

  const firstLine     = content.split('\n')[0] ?? ''
  const hookCharCount = firstLine.length
  const hookOver      = hookCharCount > 210
  const hasChanges    = content !== originalContent && originalContent.length > 0

  // ── Loading / error states ─────────────────────────────────────────
  if (loadingPost) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={18} className="animate-spin text-ink-400" />
        <span className="text-sm text-ink-400 ml-3">Loading…</span>
      </div>
    )
  }

  if (loadError || !post) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-sm text-red-400">{loadError ?? 'Post not found'}</p>
        <Link href="/dashboard/free-form" className="btn-secondary text-sm">
          <ArrowLeft size={14} /> Back
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Modals ──────────────────────────────────────────── */}
      {showCandidates && (
        <CandidateRulesModal
          candidates={candidateRules}
          sourcePostId={postId}
          onClose={() => setShowCandidates(false)}
          onSaved={(count) => { setRulesSavedCount(count); setShowCandidates(false) }}
        />
      )}
      {showVersionPicker && (
        <VersionPickerModal
          versions={versions}
          currentVersionId={activeVersionId}
          onApprove={handlePickedApprove}
          onClose={() => setShowVersionPicker(false)}
        />
      )}

      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-ink-800 bg-ink-900 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard/free-form" className="btn-ghost px-2 py-1.5 shrink-0">
            <ArrowLeft size={15} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <PenLine size={13} className="text-violet-400" />
                <span className="text-xs font-medium text-violet-300">Random Post</span>
              </div>
              <span className="text-ink-600">·</span>
              <span className="text-xs text-ink-400">{FORMAT_LABELS[post.format] ?? post.format}</span>
              {post.pillar && (
                <>
                  <span className="text-ink-600">·</span>
                  <span className="text-xs text-ink-400">{PILLAR_LABELS[post.pillar] ?? post.pillar}</span>
                </>
              )}
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
                    const res = await fetch(`/api/free-form/drafts/${v.id}`)
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
                    activeVersionId === v.id ? 'bg-ink-600 text-cream' : 'text-ink-500 hover:text-cream'
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
                  : 'Generate'
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
                ? <Loader2 size={15} className="animate-spin" />
                : <><CheckCheck size={15} /> Approve</>
            }
          </button>
        </div>
      </header>

      {/* ── Prompt context bar ───────────────────────────────── */}
      <div className="border-b border-ink-800 bg-ink-950/50 px-5 py-2.5 shrink-0">
        <p className="text-xs text-ink-400 leading-relaxed">
          <span className="text-violet-400 font-medium">Brief: </span>
          {post.user_prompt}
        </p>
      </div>

      {/* ── Regeneration feedback ────────────────────────────── */}
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
              placeholder="e.g. The opening is too abstract — try a more specific client moment. Shorten the middle section."
              className="input text-xs leading-relaxed resize-none w-full"
              disabled={isGenerating}
            />
          </div>
        </div>
      )}

      {/* ── Hook warning ─────────────────────────────────────── */}
      {content && hookOver && (
        <div className="border-b border-amber-800/30 bg-amber-900/10 shrink-0">
          <div className="flex items-center justify-between px-5 py-2 gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={13} className="text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300">
                Opening line is <span className="font-medium">{hookCharCount} characters</span> — LinkedIn shows only the first 210 before "...more".
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowHookPreview(v => !v)}
                className="text-xs text-amber-400 hover:text-amber-300 transition-colors underline underline-offset-2"
              >
                {showHookPreview ? 'Hide' : 'Show 210'}
              </button>
              <button
                onClick={handleFixHook}
                disabled={isFixingHook}
                className="btn-secondary text-xs px-2.5 py-1.5"
              >
                {isFixingHook ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                Fix hook
              </button>
            </div>
          </div>
          {showHookPreview && (
            <div className="px-5 pb-3 space-y-1">
              <div className="bg-ink-800 rounded-lg p-3 text-sm text-cream-muted">
                <span className="text-cream">{firstLine.slice(0, 210)}</span>
                <span className="text-ink-500">...more</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hook OK banner */}
      {content && !hookOver && (
        <div className="px-5 py-1.5 border-b border-emerald-800/20 bg-emerald-900/10 shrink-0 flex items-center gap-2">
          <CheckCheck size={11} className="text-emerald-400" />
          <p className="text-xs text-emerald-400">Hook is {hookCharCount} chars — fits the 210 char LinkedIn preview</p>
        </div>
      )}

      {/* ── Media advisory banner ────────────────────────────── */}
      {showMediaAdvisory && (
        <div className="px-5 py-2.5 border-b border-amber-700/30 bg-amber-900/10 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} className="text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">
              {approvedVersionNum !== null ? `V${approvedVersionNum} approved.` : 'Approved.'}{' '}
              Media may be from a different version — regenerate from the Media panel before publishing.
            </p>
          </div>
          <button onClick={() => setShowMediaAdvisory(false)} className="text-ink-500 hover:text-cream ml-3 shrink-0">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────── */}
      {generateError && (
        <div className="px-5 py-2 border-b border-red-800/30 bg-red-900/10 shrink-0 flex items-center justify-between">
          <p className="text-xs text-red-400">{generateError}</p>
          <button onClick={() => setGenerateError(null)} className="text-ink-500 hover:text-cream ml-3">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Rules saved toast ────────────────────────────────── */}
      {rulesSavedCount !== null && (
        <div className="px-5 py-1.5 border-b border-emerald-800/20 bg-emerald-900/10 shrink-0 flex items-center justify-between">
          <p className="text-xs text-emerald-400">{rulesSavedCount} voice rule{rulesSavedCount !== 1 ? 's' : ''} saved.</p>
          <button onClick={() => setRulesSavedCount(null)} className="text-ink-500 hover:text-cream ml-3">
            <X size={11} />
          </button>
        </div>
      )}

      {/* ── Main: editor + sidebar ───────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">

        {/* Editor column */}
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          {showDiff ? (
            <DiffView original={originalContent} edited={content} className="flex-1 overflow-hidden" />
          ) : (
            <div className="flex-1 overflow-y-auto px-8 py-6">
              {!content && !isGenerating && (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <p className="text-ink-500 text-sm mb-3">Waiting for generation…</p>
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={e => handleContentChange(e.target.value)}
                className="editor-content w-full"
                placeholder={isGenerating ? 'Generating…' : 'Draft will appear here…'}
                disabled={isGenerating || approved}
                spellCheck
              />
              {hasUnsavedChanges && (
                <p className="text-xs text-ink-500 mt-2 text-right">Saving…</p>
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
                              fetch('/api/free-form/drafts/save', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ postId, hashtags: updated }),
                              }).catch(() => {})
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
                      Hashtags will appear after generation
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 shrink-0 border-l border-ink-800 overflow-y-auto bg-ink-950/30">
          <div className="p-4 space-y-4">

            <PublishPanel
              postId={postId}
              format={post.format}
              approved={approved}
              postStatus={post.status}
              hasRequiredMedia={hasRequiredMedia}
              scheduledAt={post.scheduled_at ?? undefined}
              initialPublishedUrl={linkedinUrl}
              onPublished={(url) => setLinkedinUrl(url)}
              onScheduled={() => {}}
              onStatusReset={() => {
                setPost(p => p ? { ...p, status: 'approved', scheduled_at: null } : p)
                setApproved(true)
              }}
              publishApiPath="/api/free-form/publish"
              deleteApiPath="/api/free-form/publish/delete"
              statusResetPath={`/api/free-form/posts/${postId}`}
            />

            {content && (
              <MediaPanel
                key={mediaRefreshKey}
                postId={postId}
                format={post.format}
                onMediaStatusChange={setHasRequiredMedia}
                onMediaRegenerated={() => setShowMediaAdvisory(false)}
                freeFormPostId={postId}
              />
            )}

          </div>
        </div>

      </div>
    </div>
  )
}
