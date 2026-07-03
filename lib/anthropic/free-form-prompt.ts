import type { PostFormat, PostPillar, VoiceRule } from '@/lib/supabase/types'
import { buildVoiceRulesBlock } from './prompts'

// ── Format guidance (mirrors the logic inside buildGeneratePostPrompt) ──────
function formatInstructions(format: PostFormat): { label: string; wordRange: string; structure: string } {
  switch (format) {
    case 'long_form_article':
      return {
        label:     'Long-form Article',
        wordRange: '900–1,100 words',
        structure: `Structure:
- Opening hook: a specific story, lived moment, or sharp paradox (first 210 chars must be complete + scroll-stopping)
- 3–5 substantive sections (may include a Vedic/Sanskrit reference if relevant to the topic)
- Closing: a reflection question or insight that lingers — not a call to action

At the END of your output (after the article body), include these metadata lines (one per line):
WORD_COUNT: [exact count]
CORE_INSIGHT: [one sentence]
CALLBACK_USED: [what previous thread was honoured, or "none"]
THREAD_PLANTED: [forward seed, or "none"]
REFERENCES: vedic=[comma list or none], banking=[comma list or none], coaching=[comma list or none]
ARTICLE_TITLE: [SEO-friendly title under 80 chars]
HASHTAGS: #tag1 #tag2 #tag3 #tag4 #tag5
LINKEDIN_CAPTION: [1,800–2,700 char excerpt for LinkedIn — compelling hook, not an intro]`,
      }

    case 'carousel':
      return {
        label:     'Carousel (8–10 slides)',
        wordRange: '15–25 words per slide',
        structure: `Structure:
- Cover slide: punchy title (4–7 words max)
- 7–9 insight slides: each HEADLINE: + BODY: (1–2 lines max per slide)
- Closing slide: a reflection question

Use this exact format for each slide:
SLIDE 1 | HEADLINE: [Cover title] | BODY: [subtitle or empty]
SLIDE 2 | HEADLINE: [slide headline] | BODY: [1–2 punchy lines]
... (up to SLIDE 10)

At the END:
WORD_COUNT: [total]
CORE_INSIGHT: [one sentence]
SERIES_LABEL: [short badge label e.g. "INSIGHT", "STEP", "RULE"]
SERIES_COUNT: [number of content slides, not counting cover/closing]
HASHTAGS: #tag1 #tag2 #tag3 #tag4 #tag5
LINKEDIN_CAPTION: [the LinkedIn post text that will accompany the carousel PDF]`,
      }

    case 'market_insights':
    case 'text_post':
    default:
      return {
        label:     format === 'market_insights' ? 'Market Insights Text Post' : 'Text Post',
        wordRange: '180–250 words',
        structure: `Structure:
- Opening: a story, sharp observation, or striking fact (first line ≤ 210 chars — complete, not trailing off)
- 2–4 short paragraphs: insight, implication, personal perspective
- Closing: a reflection question or forward-looking thought

At the END of your output:
WORD_COUNT: [exact count]
CORE_INSIGHT: [one sentence]
QUOTE: [a single most-quotable sentence from the post, max 120 chars]
HASHTAGS: #tag1 #tag2 #tag3 #tag4 #tag5`,
      }
  }
}

// ── Optional pillar framing block ────────────────────────────────────────────
function pillarContext(pillar: PostPillar | null): string {
  if (!pillar) return ''
  const MAP: Record<PostPillar, string> = {
    vedic_leadership:        'Frame the post through Vedic wisdom, Indian mythology, or classical texts (BG, Arthashastra, Yoga Sutras). Connect ancient insight to modern leadership.',
    banker_coach:            'Frame the post through Sharath\'s 28 years in global banking — trading floors, risk, capital markets, human behaviour under pressure.',
    coaching_transformation: 'Frame the post through a real anonymised client story. The story is the vehicle; the insight is the destination.',
    financial_intelligence:  'Frame the post through the lens of markets, wealth management, or investment psychology. Be specific with data and numbers.',
    inner_work:              'Frame the post through inner growth — emotional intelligence, self-inquiry, stillness. Speak to the person, not the professional.',
  }
  return `\n**Pillar framing:** ${MAP[pillar]}\n`
}

// ── Main prompt builder ──────────────────────────────────────────────────────
export function buildFreeFormPostPrompt({
  userPrompt,
  format,
  pillar,
  feedback,
  previousDraftExcerpt,
  marketSnapshot,
}: {
  userPrompt: string
  format: PostFormat
  pillar: PostPillar | null
  feedback?: string | null
  previousDraftExcerpt?: string | null
  marketSnapshot?: string | null
}): string {
  const fi = formatInstructions(format)

  const revisionBlock = feedback?.trim()
    ? [
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `REVISION BRIEF — Sharath's feedback on the previous version:`,
        feedback.trim(),
        previousDraftExcerpt?.trim()
          ? `\nPREVIOUS VERSION (first 600 characters — for context only, do not reproduce):\n${previousDraftExcerpt.trim().slice(0, 600)}`
          : '',
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `Write a new, improved version that addresses this feedback. Do not patch the old draft — write fresh.`,
      ].filter(Boolean).join('\n')
    : ''

  const marketBlock = marketSnapshot?.trim()
    ? `\n## LIVE MARKET CONTEXT\n${marketSnapshot.trim()}\n`
    : ''

  return `Create a LinkedIn post following this exact brief from Sharath:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${userPrompt.trim()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${revisionBlock}${marketBlock}
This is a standalone post — no weekly arc or narrative continuity required. Follow the brief faithfully while maintaining Sharath's authentic voice.
${pillarContext(pillar)}
**Format:** ${fi.label}
**Target length:** ${fi.wordRange}

${fi.structure}

CRITICAL OUTPUT RULES:
- "Category A", "Category B", "Category C", "5-Swans HNI", "Bradford" are INTERNAL LABELS — never appear in the post.
- First 210 characters must be complete and compelling — LinkedIn cuts there.
- No generic openers ("In today's fast-paced world", "Many of us struggle with").
- Write only in Sharath's voice as described in the system prompt.`
}

// ── System prompt builder for free-form (persona + voice rules) ─────────────
export function buildFreeFormSystemPrompt(voiceRules: VoiceRule[]): string {
  // Reuse the master system prompt from prompts.ts
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MASTER_SYSTEM_PROMPT } = require('./prompts') as { MASTER_SYSTEM_PROMPT: string }
  const rulesBlock = buildVoiceRulesBlock(voiceRules)
  return [MASTER_SYSTEM_PROMPT, rulesBlock].filter(Boolean).join('\n\n')
}
