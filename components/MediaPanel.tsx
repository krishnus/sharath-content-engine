'use client'

import { useState, useEffect } from 'react'
import { FileText, Image, Loader2, Download, Trash2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils/helpers'

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
  postId:   string
  format:   string
  onCaptionChange?: (caption: string) => void
}

// Which field the confirmedText maps to for each media type
const TEXT_FIELD_CONFIG: Record<MediaType, { label: string; placeholder: string; multiline: boolean } | null> = {
  article_pdf:  { label: 'Article title', placeholder: 'Enter the article title…', multiline: false },
  carousel_pdf: null,
  quote_png:    { label: 'Quote text', placeholder: 'Enter the quote to feature…', multiline: true },
}

const MEDIA_CONFIG: Record<string, { type: MediaType; label: string; icon: typeof FileText; desc: string }> = {
  long_form_article: {
    type:  'article_pdf',
    label: 'Article PDF',
    icon:  FileText,
    desc:  'Full article formatted for LinkedIn document post',
  },
  carousel: {
    type:  'carousel_pdf',
    label: 'Carousel PDF',
    icon:  FileText,
    desc:  'Slide-by-slide carousel for LinkedIn',
  },
  text_post: {
    type:  'quote_png',
    label: 'Quote Image',
    icon:  Image,
    desc:  '1080×1080 quote card for image post',
  },
  market_insights: {
    type:  'quote_png',
    label: 'Quote Image',
    icon:  Image,
    desc:  '1080×1080 quote card for image post',
  },
}

export default function MediaPanel({ postId, format, onCaptionChange }: MediaPanelProps) {
  const config = MEDIA_CONFIG[format]

  const [media, setMedia]             = useState<MediaRecord | null>(null)
  const [loading, setLoading]         = useState(true)
  const [generating, setGenerating]   = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [caption, setCaption]         = useState('')
  const [captionDirty, setCaptionDirty] = useState(false)
  const [confirmedText, setConfirmedText] = useState('')  // user-editable title or quote

  // Load existing media on mount
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

      // Pre-populate confirmedText with suggested title/quote from post metadata
      if (config?.type === 'article_pdf' && data.suggestedTitle) {
        setConfirmedText(data.suggestedTitle)
      } else if (config?.type === 'quote_png' && data.suggestedQuote) {
        setConfirmedText(data.suggestedQuote)
      }

      const existing = data.media?.find((m: { media_type: string }) => m.media_type === config?.type)
      if (existing) {
        // Get fresh signed URL
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
          setCaption(urlData.linkedinCaption ?? '')
          onCaptionChange?.(urlData.linkedinCaption ?? '')
        }
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false)
    }
  }

  async function generate() {
    if (!config) return
    setGenerating(true)
    setError(null)
    try {
      const body: Record<string, string> = { postId, mediaType: config.type }
      if (config.type === 'article_pdf' && confirmedText) body.customTitle = confirmedText
      if (config.type === 'quote_png'   && confirmedText) body.customQuote = confirmedText

      const res = await fetch('/api/media/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? `Generation failed (${res.status})`)
      }
      const data = await res.json()
      const rec: MediaRecord = {
        id:              data.id,
        mediaType:       data.mediaType,
        fileName:        data.fileName,
        fileSize:        data.fileSize,
        pageCount:       data.pageCount,
        signedUrl:       data.signedUrl,
        linkedinCaption: data.linkedinCaption,
      }
      setMedia(rec)
      setCaption(data.linkedinCaption ?? '')
      onCaptionChange?.(data.linkedinCaption ?? '')
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
      a.href     = url
      a.download = media.fileName
      a.target   = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setError('Download failed')
    }
  }

  async function deleteMedia() {
    if (!media) return
    try {
      await fetch(`/api/media/${media.id}`, { method: 'DELETE' })
      setMedia(null)
      setCaption('')
      onCaptionChange?.('')
    } catch {
      setError('Failed to delete media')
    }
  }

  async function saveCaption() {
    if (!media) return
    try {
      const res = await fetch(`/api/media/${media.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedinCaption: caption }),
      })
      if (!res.ok) throw new Error('Save failed')
      setCaptionDirty(false)
      onCaptionChange?.(caption)
    } catch {
      setError('Failed to save caption')
    }
  }

  if (!config) return null

  const Icon = config.icon
  const fileSizeMB = media ? (media.fileSize / 1024 / 1024).toFixed(1) : null
  const textFieldCfg = TEXT_FIELD_CONFIG[config.type]

  return (
    <div className="border border-ink-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-ink-800/40 border-b border-ink-800">
        <div className="flex items-center gap-2">
          <Icon size={13} className="text-ink-400" />
          <span className="text-xs font-semibold text-cream">{config.label}</span>
        </div>
        {media && (
          <button
            onClick={generate}
            disabled={generating}
            title="Regenerate"
            className="text-ink-500 hover:text-ink-300 transition-colors"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 px-3 py-2 bg-red-900/20 border border-red-800/30 rounded-lg">
            <AlertCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-2">
            <Loader2 size={12} className="animate-spin text-ink-400" />
            <span className="text-xs text-ink-500">Checking…</span>
          </div>
        ) : !media ? (
          /* Generate button */
          <div className="space-y-2">
            <p className="text-xs text-ink-500">{config.desc}</p>

            {/* Editable title / quote field */}
            {textFieldCfg && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-400">{textFieldCfg.label}</label>
                {textFieldCfg.multiline ? (
                  <textarea
                    value={confirmedText}
                    onChange={e => setConfirmedText(e.target.value)}
                    rows={4}
                    placeholder={textFieldCfg.placeholder}
                    className="w-full bg-ink-800/40 border border-ink-700 rounded-lg px-3 py-2 text-xs text-cream placeholder-ink-600 resize-none focus:outline-none focus:ring-1 focus:ring-blue-700/50"
                  />
                ) : (
                  <input
                    type="text"
                    value={confirmedText}
                    onChange={e => setConfirmedText(e.target.value)}
                    placeholder={textFieldCfg.placeholder}
                    className="w-full bg-ink-800/40 border border-ink-700 rounded-lg px-3 py-2 text-xs text-cream placeholder-ink-600 focus:outline-none focus:ring-1 focus:ring-blue-700/50"
                  />
                )}
              </div>
            )}

            <button
              onClick={generate}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-ink-600 hover:border-blue-600 hover:bg-blue-900/10 text-xs text-ink-400 hover:text-blue-400 transition-all disabled:opacity-50"
            >
              {generating ? (
                <><Loader2 size={12} className="animate-spin" /> Generating…</>
              ) : (
                <><Icon size={12} /> Generate {config.label}</>
              )}
            </button>
          </div>
        ) : (
          /* Media card */
          <div className="space-y-3">
            {/* Editable title / quote for regeneration */}
            {textFieldCfg && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-400">{textFieldCfg.label}</label>
                {textFieldCfg.multiline ? (
                  <textarea
                    value={confirmedText}
                    onChange={e => setConfirmedText(e.target.value)}
                    rows={3}
                    placeholder={textFieldCfg.placeholder}
                    className="w-full bg-ink-800/40 border border-ink-700 rounded-lg px-3 py-2 text-xs text-cream placeholder-ink-600 resize-none focus:outline-none focus:ring-1 focus:ring-blue-700/50"
                  />
                ) : (
                  <input
                    type="text"
                    value={confirmedText}
                    onChange={e => setConfirmedText(e.target.value)}
                    placeholder={textFieldCfg.placeholder}
                    className="w-full bg-ink-800/40 border border-ink-700 rounded-lg px-3 py-2 text-xs text-cream placeholder-ink-600 focus:outline-none focus:ring-1 focus:ring-blue-700/50"
                  />
                )}
              </div>
            )}

            {/* File info row */}
            <div className="flex items-center gap-2 px-3 py-2 bg-ink-800/40 rounded-lg">
              <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-cream truncate">{media.fileName}</p>
                <p className="text-xs text-ink-500">
                  {fileSizeMB} MB
                  {media.pageCount ? ` · ${media.pageCount} pages` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {media.signedUrl && (
                  <button
                    onClick={downloadFile}
                    className="text-ink-500 hover:text-ink-300 transition-colors"
                    title="Download"
                  >
                    <Download size={12} />
                  </button>
                )}
                <button
                  onClick={deleteMedia}
                  className="text-ink-600 hover:text-red-400 transition-colors"
                  title="Remove"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            {/* Preview thumbnail — only for PNG */}
            {media.mediaType === 'quote_png' && media.signedUrl && (
              <div className="rounded-lg overflow-hidden border border-ink-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={media.signedUrl}
                  alt="Quote preview"
                  className="w-full aspect-square object-cover"
                />
              </div>
            )}

            {/* PDF indicator for carousels */}
            {(media.mediaType === 'article_pdf' || media.mediaType === 'carousel_pdf') && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-900/10 rounded-lg border border-blue-900/20">
                <FileText size={12} className="text-blue-400" />
                <span className="text-xs text-blue-300">
                  Will publish as LinkedIn document post
                </span>
              </div>
            )}

            {/* LinkedIn caption */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-400">LinkedIn caption</label>
              <textarea
                value={caption}
                onChange={e => { setCaption(e.target.value); setCaptionDirty(true) }}
                rows={4}
                placeholder="Caption for the LinkedIn post…"
                className={cn(
                  'w-full bg-ink-800/40 border rounded-lg px-3 py-2 text-xs text-cream',
                  'placeholder-ink-600 resize-none focus:outline-none focus:ring-1',
                  captionDirty ? 'border-gold-500/40 focus:ring-gold-500/30' : 'border-ink-700 focus:ring-blue-700/50'
                )}
              />
              {captionDirty && (
                <button
                  onClick={saveCaption}
                  className="text-xs text-gold-400 hover:text-gold-300"
                >
                  Save caption
                </button>
              )}
              <p className="text-xs text-ink-600">{caption.length} / 280 chars</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
