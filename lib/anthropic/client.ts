import Anthropic from '@anthropic-ai/sdk'

// Singleton — reuse across requests in the same serverless invocation
let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

export const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929'
export const MAX_TOKENS = 2048

/** Count words in a string reliably — never trust LLM self-reporting */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Parse the structured metadata appended to generated posts */
export function parseGenerationMetadata(rawOutput: string): {
  content: string
  wordCount: number
  coreInsight: string | null
  callbackUsed: string | null
  threadPlanted: string | null
  referencesUsed: { vedic: string[]; banking: string[]; coaching: string[] }
  hashtags: string[]
  linkedinCaption: string | null
  quote: string | null
} {
  const lines = rawOutput.split('\n')
  const metaStart = lines.findIndex(l =>
    l.startsWith('WORD_COUNT:') || l.startsWith('CORE_INSIGHT:')
  )

  const content = metaStart > -1
    ? lines.slice(0, metaStart).join('\n').trim()
    : rawOutput.trim()

  const getMeta = (key: string): string | null => {
    const line = lines.find(l => l.startsWith(`${key}:`))
    return line ? line.slice(key.length + 1).trim() : null
  }

  const wordCountRaw = getMeta('WORD_COUNT')
  const refsRaw      = getMeta('REFERENCES')
  const hashtagsRaw  = getMeta('HASHTAGS')

  let referencesUsed = { vedic: [] as string[], banking: [] as string[], coaching: [] as string[] }
  if (refsRaw) {
    try { referencesUsed = JSON.parse(refsRaw) } catch {}
  }

  const hashtags = hashtagsRaw
    ? hashtagsRaw.split(/\s+/).filter(h => h.startsWith('#'))
    : []

  return {
    content,
    wordCount: wordCountRaw ? parseInt(wordCountRaw, 10) : countWords(content),
    coreInsight:     getMeta('CORE_INSIGHT'),
    callbackUsed:    getMeta('CALLBACK_USED'),
    threadPlanted:   getMeta('THREAD_PLANTED'),
    referencesUsed,
    hashtags,
    linkedinCaption: getMeta('LINKEDIN_CAPTION'),
    quote:           getMeta('QUOTE'),
  }
}
