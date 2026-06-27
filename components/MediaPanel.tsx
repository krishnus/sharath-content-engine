'use client'

import { useState, useEffect, useRef } from 'react'
import { FileText, Image, Loader2, Download, Trash2, RefreshCw, CheckCircle2, AlertCircle, Wand2 } from 'lucide-react'
import { cn, countWords } from '@/lib/utils/helpers'

type MediaType = 'article_pdf' | 'carousel_pdf' | 'quote_png'

type MediaRecord = {
  id: string
  mediaType: MediaType
  fileName: string
  fileSize: number
  pageCount: number | null
  signedUrl: string | null
  linkedinCaption: string | null
}

type MediaPanelProps = {
  postId: string
  format: string
}

const MEDIA_CONFIG: Record<string, { type: MediaType; label: string; icon: typeof FileText }> = {
  long_form_article: { type: 'article_pdf',  label: 'Article PDF',    icon: FileText },
  carousel:          { type: 'carousel_pdf', label: 'Carousel PDF',   icon: FileText },
  text_post:         { type: 'quote_png',    label: 'Quote Image',    icon: Image    },
  market_insights:   { type: 'quote_png',    label: 'Quote Image',    icon: Image    },
}

// LinkedIn document posts support up to 3000 chars, so 700 is generous while still guiding brevity.
// quote_png uses this for the on-image pull-quote (hard visual limit ~120 chars).
const CAPTION_MAX: Record<MediaType, number> = {
  article_pdf:  700,
  carousel_pdf: 700,
  quote_png:    120,
}

export default function MediaPanel({ postId, format }: MediaPanelProps) {
  const config = MEDIA_CONFIG[format]

  const [media, setMedia]                     = useState<MediaRecord | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [generating, setGenerating]           = useState(false)
  const [regenCaption, setRegenCaption]       = useState(false)
  const [regenTitle,   setRegenTitle]         = useState(false)
  const [error, setError]                     = useState<string | null>(null)

  // LI Hook / Caption text (for article_pdf + carousel_pdf: 200-280 chars; for quote_png: max 120)
  const [caption, setCaption]                 = useState('')
  const captionSaveTimer                      = useRef<ReturnType<typeof setTimeout>>()

  // Confirmed text: article title (article_pdf) or quote text (quote_png)
  const [confirmedText, setConfirmedText]     = useState('')

  // article_pdf style toggles — blue strip on/off for header and footer
  const [showHeaderStrip, setShowHeaderStrip] = useState(true)
  const [showFooterStrip, setShowFooterStrip] = useState(true)

  useEffect(() => {
    if (!config) { setLoading(false); return }
    loadExistingMedia()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, format])

  async function loadExistingMedia() {
    setLoading(true)
    try {
      const res = await fetch(`/api/posts/${postId}`)
      if (!res.ok) return
      const data = await res.json()

      // Pre-populate from AI-generated suggestions
      if (config.type === 'article_pdf' && data.suggestedTitle) {
        // Clamp to titleMax so the pre-populated value always fits in the PDF header
        setConfirmedText(data.suggestedTitle.slice(0, 80))
      }
      if (config.type === 'quote_png' && data.suggestedQuote) {
        setConfirmedText(data.suggestedQuote)
      }
      // Caption pre-population (long-form + carousel: LINKEDIN_CAPTION; quote: don't need separate caption)
      if ((config.type === 'article_pdf' || config.type === 'carousel_pdf') && data.suggestedCaption) {
        setCaption(data.suggestedCaption)
      }

      const existing = data.media?.find((m: { media_type: string }) => m.media_type === config.type)
      if (existing) {
        const urlRes = await fetch(`/api/media/${existing.id}`)
        if (urlRes.ok) {
          const urlData = await urlRes.json()
          const rec: MediaRecord = {
            id:              existing.id,
            mediaType:       existing.media_type,
            fileName:        existing.file_name,
            fileSize:        existing.file_size,
            pageCount:       existing.page_count,
            signedUrl:       urlData.signedUrl,
            linkedinCaption: urlData.linkedinCaption,
          }
          setMedia(rec)
          // DB caption takes priority over suggested
          if (urlData.linkedinCaption) setCaption(urlData.linkedinCaption)
        }
      }
    } catch { /* non-fatal */ }
    finally { setLoading(false) }
  }

  // Debounced caption save to DB (only when media record exists)
  function handleCaptionChange(val: string) {
    setCaption(val)
    if (!media) return
    clearTimeout(captionSaveTimer.current)
    captionSaveTimer.current = setTimeout(() => saveCaption(val, media.id), 1000)
  }

  async function saveCaption(text: string, mediaId: string) {
    await fetch(`/api/media/${mediaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkedinCaption: text }),
    }).catch(() => {/* silent */})
  }

  async function regenerateCaptionAI() {
    setRegenCaption(true)
    setError(null)
    try {
      const type = config?.type === 'quote_png' ? 'quote' : 'caption'
      const res = await fetch('/api/media/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, type }),
      })
      if (!res.ok) throw new Error('Regeneration failed')
      const { caption: newCaption } = await res.json()
      if (config?.type === 'quote_png') {
        setConfirmedText(newCaption)
      } else {
        setCaption(newCaption)
        if (media) saveCaption(newCaption, media.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate')
    } finally {
      setRegenCaption(false)
    }
  }

  async function regenerateTitleAI() {
    setRegenTitle(true)
    setError(null)
    try {
      const res = await fetch('/api/media/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, type: 'title' }),
      })
      if (!res.ok) throw new Error('Title regeneration failed')
      const { caption: newTitle } = await res.json()
      setConfirmedText(newTitle.slice(0, titleMax))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate title')
    } finally {
      setRegenTitle(false)
    }
  }

  async function generate() {
    if (!config) return
    setGenerating(true)
    setError(null)
    try {
      const body: Record<string, string | boolean> = { postId, mediaType: config.type }
      if (config.type === 'article_pdf'  && confirmedText)  body.customTitle = confirmedText
      if (config.type === 'quote_png'    && confirmedText)  body.customQuote = confirmedText
      if (caption)                                          body.linkedinCaptionOverride = caption
      if (config.type === 'article_pdf') {
        body.showHeaderStrip = showHeaderStrip
        body.showFooterStrip = showFooterStrip
      }

      const res = await fetch('/api/media/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        let errMsg = `Generation failed (${res.status})`
        try {
          const body = await res.json()
          errMsg = body.error ?? errMsg
        } catch {
          const text = await res.text().catch(() => '')
          if (text) errMsg = text.slice(0, 200)
        }
        throw new Error(errMsg)
      }
      const data = await res.json()
      setMedia({
        id:              data.id,
        mediaType:       data.mediaType,
        fileName:        data.fileName,
        fileSize:        data.fileSize,
        pageCount:       data.pageCount,
        signedUrl:       data.signedUrl,
        linkedinCaption: data.linkedinCaption,
      })
      if (data.linkedinCaption && !caption) setCaption(data.linkedinCaption)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function downloadFile() {
    if (!media?.signedUrl) return
    try {
      const res  = await fetch(media.signedUrl)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = media.fileName; a.target = '_blank'
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch { setError('Download failed') }
  }

  async function deleteMedia() {
    if (!media) return
    await fetch(`/api/media/${media.id}`, { method: 'DELETE' }).catch(() => {})
    setMedia(null)
  }

  if (!config) return null

  const Icon            = config.icon
  const fileSizeMB      = media ? (media.fileSize / 1024 / 1024).toFixed(1) : null
  const captionMax      = CAPTION_MAX[config.type]
  const captionWords    = countWords(caption)
  const captionOverMax  = caption.length > captionMax
  const titleMax        = 80
  const titleOver       = confirmedText.length > titleMax
  const isDocumentPost  = config.type === 'article_pdf' || config.type === 'carousel_pdf'
  const isArticle       = config.type === 'article_pdf'
  const isQuote         = config.type === 'quote_png'

  return (
    <div className="border border-ink-800 rounded-xl overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-ink-800/40 border-b border-ink-800">
        <div className="flex items-center gap-2">
          <Icon size={12} className="text-ink-400" />
          <span className="text-xs font-semibold text-cream tracking-wide">{config.label}</span>
        </div>
        {media && (
          <button
            onClick={generate}
            disabled={generating}
            title="Regenerate media"
            className="text-ink-500 hover:text-ink-300 transition-colors"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 px-3 py-2 bg-red-900/20 border border-red-800/30 rounded-lg">
            <AlertCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-ink-600 hover:text-ink-400 shrink-0">×</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-2">
            <Loader2 size={12} className="animate-spin text-ink-400" />
            <span className="text-xs text-ink-500">Loading…</span>
          </div>
        ) : (
          <>
            {/* ── LI Post Hook / Caption (document posts only) ─── */}
            {isDocumentPost && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-ink-300">
                    {isArticle ? 'LinkedIn Post Text' : 'LinkedIn Post Caption'}
                  </label>
                  <button
                    onClick={regenerateCaptionAI}
                    disabled={regenCaption}
                    title="Regenerate with AI"
                    className="flex items-center gap-1 text-xs text-ink-500 hover:text-gold-400 transition-colors disabled:opacity-50"
                  >
                    {regenCaption
                      ? <Loader2 size={10} className="animate-spin" />
                      : <Wand2 size={10} />
                    }
                    <span>Regen</span>
                  </button>
                </div>
                <textarea
                  value={caption}
                  onChange={e => handleCaptionChange(e.target.value)}
                  rows={8}
                  placeholder={isArticle
                    ? 'The hook text that appears as the LinkedIn post text above the document…'
                    : 'Caption that accompanies the carousel on LinkedIn…'
                  }
                  className={cn(
                    'w-full bg-ink-800/40 border rounded-lg px-3 py-2 text-xs text-cream',
                    'placeholder-ink-600 resize-none focus:outline-none focus:ring-1',
                    captionOverMax
                      ? 'border-red-700/50 focus:ring-red-700/40'
                      : 'border-ink-700 focus:ring-blue-700/50'
                  )}
                />
                <div className="flex items-center justify-between">
                  <span className={cn(
                    'text-xs',
                    captionOverMax ? 'text-red-400' : caption.length > captionMax * 0.85 ? 'text-amber-400' : 'text-ink-600'
                  )}>
                    {caption.length} / {captionMax} chars
                  </span>
                  <span className="text-xs text-ink-600">{captionWords}w</span>
                </div>
              </div>
            )}

            {/* ── Quote Text (quote posts) ─── */}
            {isQuote && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-ink-300">Quote Text</label>
                  <button
                    onClick={regenerateCaptionAI}
                    disabled={regenCaption}
                    title="Regenerate with AI"
                    className="flex items-center gap-1 text-xs text-ink-500 hover:text-gold-400 transition-colors disabled:opacity-50"
                  >
                    {regenCaption
                      ? <Loader2 size={10} className="animate-spin" />
                      : <Wand2 size={10} />
                    }
                    <span>Regen</span>
                  </button>
                </div>
                <textarea
                  value={confirmedText}
                  onChange={e => setConfirmedText(e.target.value)}
                  rows={4}
                  placeholder="Pull-quote that appears on the image card…"
                  className={cn(
                    'w-full bg-ink-800/40 border rounded-lg px-3 py-2 text-xs text-cream',
                    'placeholder-ink-600 resize-none focus:outline-none focus:ring-1',
                    confirmedText.length > captionMax
                      ? 'border-red-700/50 focus:ring-red-700/40'
                      : 'border-ink-700 focus:ring-blue-700/50'
                  )}
                />
                <div className={cn(
                  'text-xs',
                  confirmedText.length > captionMax ? 'text-red-400'
                    : confirmedText.length > captionMax * 0.85 ? 'text-amber-400'
                    : 'text-ink-600'
                )}>
                  {confirmedText.length} / {captionMax} chars
                </div>
              </div>
            )}

            {/* ── Article Title (article_pdf only) ─── */}
            {isArticle && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-ink-300">Article Title</label>
                  <button
                    onClick={regenerateTitleAI}
                    disabled={regenTitle}
                    title="Regenerate title with AI"
                    className="flex items-center gap-1 text-xs text-ink-500 hover:text-gold-400 transition-colors disabled:opacity-50"
                  >
                    {regenTitle
                      ? <Loader2 size={10} className="animate-spin" />
                      : <Wand2 size={10} />
                    }
                    <span>Regen</span>
                  </button>
                </div>
                <textarea
                  value={confirmedText}
                  onChange={e => setConfirmedText(e.target.value.slice(0, titleMax))}
                  rows={3}
                  placeholder="Article title as it appears on the PDF cover…"
                  className={cn(
                    'w-full bg-ink-800/40 border rounded-lg px-3 py-2 text-xs text-cream',
                    'placeholder-ink-600 resize-none focus:outline-none focus:ring-1',
                    titleOver
                      ? 'border-red-700/50 focus:ring-red-700/40'
                      : 'border-ink-700 focus:ring-blue-700/50'
                  )}
                />
                <div className="flex items-center justify-between">
                  <span className={cn(
                    'text-xs',
                    titleOver ? 'text-red-400' : confirmedText.length > titleMax * 0.9 ? 'text-amber-400' : 'text-ink-600'
                  )}>
                    {confirmedText.length} / {titleMax} chars
                  </span>
                  <span className="text-xs text-ink-600">{countWords(confirmedText)}w</span>
                </div>
                {titleOver && (
                  <p className="text-xs text-red-400">Title will be clipped in the PDF — keep it under 80 chars</p>
                )}
              </div>
            )}

            {/* ── Blue strip toggles (article PDF only) ─── */}
            {isArticle && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">PDF Style</p>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <div
                      onClick={() => setShowHeaderStrip(v => !v)}
                      className={cn(
                        'w-8 h-4 rounded-full transition-colors cursor-pointer relative shrink-0',
                        showHeaderStrip ? 'bg-blue-600' : 'bg-ink-700'
                      )}
                    >
                      <div className={cn(
                        'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all',
                        showHeaderStrip ? 'left-4' : 'left-0.5'
                      )} />
                    </div>
                    <span className="text-xs text-ink-300 group-hover:text-cream transition-colors">
                      Blue strip — Post Title
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <div
                      onClick={() => setShowFooterStrip(v => !v)}
                      className={cn(
                        'w-8 h-4 rounded-full transition-colors cursor-pointer relative shrink-0',
                        showFooterStrip ? 'bg-blue-600' : 'bg-ink-700'
                      )}
                    >
                      <div className={cn(
                        'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all',
                        showFooterStrip ? 'left-4' : 'left-0.5'
                      )} />
                    </div>
                    <span className="text-xs text-ink-300 group-hover:text-cream transition-colors">
                      Blue strip — Footer
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* ── File card (when media exists) ─── */}
            {media ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-ink-800/40 rounded-lg">
                  <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-cream truncate">{media.fileName}</p>
                    <p className="text-xs text-ink-500">
                      {fileSizeMB} MB{media.pageCount ? ` · ${media.pageCount} slides` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {media.signedUrl && (
                      <button onClick={downloadFile} title="Download" className="text-ink-500 hover:text-ink-300 transition-colors">
                        <Download size={12} />
                      </button>
                    )}
                    <button onClick={deleteMedia} title="Remove" className="text-ink-600 hover:text-red-400 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Quote image preview */}
                {media.mediaType === 'quote_png' && media.signedUrl && (
                  <div className="rounded-lg overflow-hidden border border-ink-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={media.signedUrl} alt="Quote preview" className="w-full aspect-square object-cover" />
                  </div>
                )}

                {/* Document post badge */}
                {isDocumentPost && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-900/10 rounded-lg border border-blue-900/20">
                    <FileText size={11} className="text-blue-400" />
                    <span className="text-xs text-blue-300">Publishes as LinkedIn document post</span>
                  </div>
                )}

                {/* Re-generate button */}
                <button
                  onClick={generate}
                  disabled={generating}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-ink-700 hover:border-ink-500 text-xs text-ink-500 hover:text-ink-300 transition-all disabled:opacity-40"
                >
                  {generating
                    ? <><Loader2 size={11} className="animate-spin" /> Regenerating…</>
                    : <><RefreshCw size={11} /> Regenerate {config.label}</>
                  }
                </button>
              </div>
            ) : (
              /* ── Generate button (no media yet) ─── */
              <button
                onClick={generate}
                disabled={generating || (isQuote && !confirmedText)}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed',
                  'text-xs transition-all disabled:opacity-40',
                  generating
                    ? 'border-ink-600 text-ink-400'
                    : 'border-ink-600 hover:border-gold-600 hover:bg-gold-900/10 text-ink-400 hover:text-gold-400'
                )}
              >
                {generating
                  ? <><Loader2 size={12} className="animate-spin" /> Generating…</>
                  : <><Icon size={12} /> Generate {config.label}</>
                }
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
