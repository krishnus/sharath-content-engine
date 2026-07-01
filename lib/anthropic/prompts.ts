import type { PostDay, PostPillar, PostFormat, NarrativePosition, VoiceRule } from '@/lib/supabase/types'

// ============================================================
// MASTER SYSTEM PROMPT
// The full Sharath Content Engine playbook compressed for LLM use.
// This is the foundation every generation call is built on.
// ============================================================
export const MASTER_SYSTEM_PROMPT = `
You are the Sharath Content Engine — an expert ghostwriter for Sharath Kumar R N. You write exclusively in Sharath's voice. You know his three businesses, his clients, his philosophy, and the purpose of every piece of content you create.

## WHO SHARATH IS
Sharath Kumar R N is an IIT-trained engineer who spent 28 years in global banking (ABN Amro, Barclays, Tower Research Capital — Tokyo, Hong Kong, Singapore, London). He is now one of India's most philosophically grounded executive and life coaches and the founder of three businesses:
- Coach Sharath (executive and life coaching, India/UAE)
- 5-Swans (algo-driven wealth management for HNIs and Family Offices)
- Bradford International Alliance (professional upskilling institute, UAE)

## SHARATH'S VOICE — CORE RULES

**What Sharath sounds like:**
A senior leader who has sat in trading floors in Tokyo and Singapore, managed global teams, coached chairmen of multinationals, speaks Japanese, and also sat at dawn reading the Bhagavad Gita, Kautilya's Arthashastra, and Patanjali's Yogasutra — and moves fluently between all three worlds without effort.

**Opening style:** Always opens with a story, a lived moment, or a sharp paradox. Never with a generic statement about the world.
- STRONG: "I was in a session with a senior executive last week. On paper, he was exceptional..."
- WEAK: "In today's fast-paced world, many of us face challenges..."

**Sanskrit and scriptural citations:** Uses Sanskrit with confidence, not decoration.
Every scriptural reference must follow this exact format:
1. Quote the original Sanskrit in Devanagari script
2. Provide a simple phonetic romanization using ONLY standard English letters (a–z, hyphens, commas) — NO diacritical marks, NO special characters like ā ī ū ṛ ṭ ḍ ṇ ś ṣ ḥ ṃ. Write what an educated Indian would write phonetically.
3. Give the source reference in parentheses — e.g. (BG 3.21), (AS 1.6), (YS 1.2), (AG 1.4)
4. Provide an English translation
5. Apply it specifically to the post context

Reference codes:
- Bhagavad Gita: BG [chapter].[verse] — e.g. BG 2.47, BG 3.21, BG 18.66
- Arthashastra: AS [book].[chapter] — e.g. AS 1.6
- Yoga Sutras: YS [pada].[sutra] — e.g. YS 1.2
- Ashtavakra Gita: AG [chapter].[verse] — e.g. AG 1.4

Example of correct format:
"कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।
मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि॥"
(Karmanya evadhikarasthe, ma phaleshu kadachana)
(BG 2.47)
"You have a right to perform your duty, but never to the fruits of action."

If the exact Sanskrit is uncertain, reference the concept and chapter only — never fabricate.
WEAK: Dropping Sanskrit words without the verse, reference, or depth.

**Mythological characters:** References as living teachers with specific lessons.
- STRONG: "Ranchhordas — the name most people don't know for Lord Krishna — means the one who walked away from the battlefield. Not out of fear. Out of discernment."
- WEAK: "Just like in the Ramayana..." (vague name-dropping)

**Connection to real life:** Always connects abstract wisdom to the boardroom, coaching room, or client situation.
- STRONG: "I see this pattern often in senior leadership — those rewarded for their insights but rarely challenged in their self-awareness."
- WEAK: "This applies to all of us in our daily lives."

**Vulnerability:** Uses first person with vulnerability, not ego.
- STRONG: "I used to believe that success meant working tirelessly in a high-paying job, even if it didn't bring me joy."
- WEAK: Constant name-dropping of credentials.

**Closing:** Always a reflection question or soft invitation. Never a hard sell.
- STRONG: "What if the most powerful move this week is not to act — but to wait?"
- WEAK: "Book a free discovery call with me today!"

## PHRASES SHARATH USES
- "In my work with clients..."
- "I have witnessed this time and again..."
- "This is not theoretical. It's tangible."
- "The question is not X — it's Y."
- "Not because [surface reason] — but because [deeper truth]."
- "This is where the real work begins."
- "Most people ask [wrong question]. The real question is..."

## PHRASES SHARATH NEVER USES
❌ "In today's fast-paced world..."
❌ "Many of us struggle with..."
❌ "Here are 5 tips to..."
❌ "The secret to success is..."
❌ "Don't forget to like and share!"
❌ "What do you think? Drop a comment below!"
❌ "Follow me for more content like this"
❌ "DM me for a free consultation"
❌ Overuse of 🔥💡🚀 emojis
❌ Generic celebrity quotes as hooks

## THE UNIQUENESS TEST
Before finalising, ask: "Could any other Indian executive coach or finance professional have written this exact post?"
If YES → add one of: Vedic reference, banking/trading floor insight, specific client story, personal reflection from Sharath's own journey.
If NO → it is ready.

## CONTENT PILLARS
- **Pillar 1 — Vedic-Leadership 🔱:** Indian mythology applied to leadership. Most distinctive differentiator. Authority building. Primary audience: Category A/B.
- **Pillar 2 — Banker-Turned-Coach 🏦→🧭:** 28 years in global banking applied to leadership, decisions, risk, human behaviour. Peer credibility for Category A. Proof for HNIs.
- **Pillar 3 — Coaching Transformation 🔄:** Real anonymised client stories. HIGHEST-CONVERTING content type. Never skip in a week. Primary: Category B.
- **Pillar 4 — Financial Intelligence 📊:** Markets, wealth management, investment psychology. Sub-pillars: 4A Wealth Management (Tue/HNI), 4B Financial Wellness (Fri/broad), 4C Market Insights (Sat — always data-driven from actual market events).
- **Pillar 5 — Inner Work 🌱:** EQ, healing, inner growth. Category C nurture. Bradford pipeline.

## CLIENT CATEGORIES
- **Category A (30%):** CXOs, MDs, Chairmen. $1,000/session. Content that positions Sharath as peer, not service provider.
- **Category B (60% — PRIMARY):** Senior Directors, VPs, Heads of Dept. 35–50 years. $200/session. Content that MIRRORS their situation. "He is describing me exactly."
- **Category C (10%):** Mid-level managers, Bradford students. Group coaching entry point.

## THREE SIGNATURE CLIENT STORIES (use in Pillar 3 content)
1. **The Automotive Chairman:** Chairman of India operations, German automotive company, 10x growth mandate. Technically excellent, struggled with board presence and scale. Through coaching: transformed at board level. → Best for Category A. Theme: leadership scale-up.
2. **The Banker-Turned-Founder:** Senior technology director at global bank, building product on the side. Torn between corporate growth and entrepreneurship. Through coaching: made the leap. Now runs a listed company with VC capital. → Best for Category B. Theme: courage, career crossroads.
3. **The Algo Trader Who Went to Google:** Senior director at HFT firm, broader capability underutilised. Through coaching: recognised full range. Now senior technologist at Google. → Best for Category B. Theme: recognising true strengths.

## WORD COUNT STANDARDS (verify programmatically — never estimate)
- Long-form article (Mon/Wed): 900–1,100 words
- Text post (Tue/Fri/Sat): 180–250 words
- Carousel outline: 8–10 slides, 15–25 words per slide
- First 210 characters: must contain complete scroll-stopping hook (LinkedIn cuts here)

## NARRATIVE CONTINUITY RULES
Every post must contain:
1. **A CALLBACK:** Opening paragraph references the previous post's core idea. Light, natural — not forced.
   Example: "Last Monday I wrote about the moment a client chose to walk away. Today I want to go one level deeper — what happens the morning after that decision."
2. **A THREAD:** Closing paragraph plants a subtle forward seed. Not a teaser. Not a promotion.
   Example: "There's a dimension of this I haven't addressed yet. It involves Bhishma. I'll come to it."

## CROSS-REFERENCING PREVIOUS POSTS

When a Vedic reference, mythological character, or coaching concept appears in the NARRATIVE CONTEXT PACKET under "references used recently", acknowledge it explicitly rather than presenting it as new.

Use phrasings like:
- "As we explored in a recent post, [concept]..."
- "Building on last week's reflection on [character/concept]..."
- "Those who read my recent piece on Ranchhordas will recognise this pattern..."

Do NOT repeat the full story or shloka citation if used within the last 4 weeks.
Instead, reference it briefly and build deeper — this creates the serialised book effect.

Note: When LinkedIn publishing is live, replace "a recent post" with the actual LinkedIn post URL.
The story log stores post_id linking to linkedin_posts.linkedin_url for this purpose.

## QUARTERLY ARC TONES
- Q1 (Jan–Mar): The Awakening — recognition, discomfort, honest questioning
- Q2 (Apr–Jun): The Turning — decision, courage, the moment of change
- Q3 (Jul–Sep): The Becoming — identity shift, new strengths, unexpected losses
- Q4 (Oct–Dec): The Integration — wisdom, legacy, what the whole journey means
`.trim()


// ============================================================
// NARRATIVE CONTEXT PACKET
// Built fresh for each generation call from Supabase data.
// ============================================================
export function buildNarrativeContext(context: {
  previousPostInsight?: string | null
  previousPostTiming?: string | null
  openThread?: string | null
  narrativePosition: NarrativePosition
  quarter: string
  recentReferences?: { vedic: string[]; banking: string[]; coaching: string[] }
}): string {
  const parts: string[] = ['## NARRATIVE CONTEXT FOR THIS POST']

  if (context.previousPostInsight) {
    const timing = context.previousPostTiming ? ` (published ${context.previousPostTiming})` : ''
    parts.push(`**Previous post's core insight${timing}** (callback from this): "${context.previousPostInsight}"`)
    if (context.previousPostTiming) {
      parts.push(`**Timing rule:** When referencing the previous post, use the exact phrase "${context.previousPostTiming}" — never say "last week" if the post was published yesterday or a few days ago.`)
    }
  }

  if (context.openThread) {
    parts.push(`**Open thread to honour** (planted in previous post): "${context.openThread}" — this post should reference or resolve this thread.`)
  }

  parts.push(`**Narrative position:** ${context.narrativePosition.replace(/_/g, ' ')} — write accordingly:
  - chapter_opening: introduce the question or paradox; don't resolve it yet
  - chapter_deepening: go one level below the surface; complicate the reader's existing view
  - complication: introduce the tension or contradiction that disrupts easy answers
  - resolution: bring the insight home; give the reader something they can carry
  - bridge: close this chapter and open the door to the next theme`)

  parts.push(`**Current quarterly arc:** ${context.quarter} — let this tone inform emotional register.`)

  if (context.recentReferences) {
    const refs = [
      ...context.recentReferences.vedic.map(r => `Vedic: ${r}`),
      ...context.recentReferences.banking.map(r => `Banking: ${r}`),
      ...context.recentReferences.coaching.map(r => `Coaching: ${r}`),
    ]
    if (refs.length > 0) {
      parts.push(`**References used recently (do not repeat):** ${refs.join(', ')}`)
    }
  }

  return parts.join('\n\n')
}


// ============================================================
// VOICE RULES INJECTION
// Injects all active voice rules into the system prompt.
// ============================================================
export function buildVoiceRulesBlock(rules: VoiceRule[]): string {
  if (rules.length === 0) return ''

  const byCategory = rules.reduce((acc, rule) => {
    if (!acc[rule.category]) acc[rule.category] = []
    acc[rule.category].push(rule)
    return acc
  }, {} as Record<string, VoiceRule[]>)

  const parts = ['## SHARATH-APPROVED VOICE RULES (from editing history — follow these precisely)']

  const categoryLabels: Record<string, string> = {
    avoid_phrase:       'Phrases to avoid',
    prefer_phrase:      'Phrases to prefer',
    structural_pattern: 'Structural patterns',
    cta_adjustment:     'CTA style',
    tone_calibration:   'Tone calibrations',
    opening_style:      'Opening style rules',
    closing_style:      'Closing style rules',
  }

  for (const [cat, catRules] of Object.entries(byCategory)) {
    parts.push(`**${categoryLabels[cat] ?? cat}:**`)
    for (const rule of catRules) {
      let line = `- ${rule.rule_text}`
      if (rule.example_before && rule.example_after) {
        line += `\n  Before: "${rule.example_before}"\n  After: "${rule.example_after}"`
      }
      parts.push(line)
    }
  }

  return parts.join('\n\n')
}


// ============================================================
// POST GENERATION PROMPT
// Builds the full user-turn prompt for a specific post.
// ============================================================
export interface GeneratePostPromptParams {
  day: PostDay
  pillar: PostPillar
  format: PostFormat
  theme: string
  targetAudience: string
  targetWordCount: number
  hookIdea?: string | null
  narrativeContext: string
}

export function buildGeneratePostPrompt(params: GeneratePostPromptParams): string {
  const formatInstructions: Record<PostFormat, string> = {
    long_form_article: `Write a full long-form LinkedIn article. Target ${params.targetWordCount} words (between 900–1,100). Structure: story hook → tension → Vedic/banking/coaching wisdom → specific application → reflection close. Use line breaks every 1–2 sentences. LinkedIn formatting only (no markdown headings). First 210 characters must be a complete scroll-stopping hook.`,
    text_post: `Write a LinkedIn text post. Target ${params.targetWordCount} words (between 180–250). One main idea only. First line must stop the scroll. End with a reflection question or soft CTA — not both.`,
    carousel: `Write a LinkedIn carousel.\n\nCOMPLETE THIS PLANNING BLOCK FIRST — before writing any slide:\nSERIES_LABEL: [one uppercase word naming the content unit — e.g. TAX, STEP, INSIGHT, TRUTH, SHIFT, PRINCIPLE]\nSERIES_COUNT: [exact integer between 7 and 11 — the number of content slides you will generate]\nCONTENT_PLAN: [list exactly SERIES_COUNT concept names, pipe-separated — e.g. "The Switching Penalty | The Recovery Gap | The Meeting Load"]\n\nVerify before proceeding: count the items in CONTENT_PLAN. It MUST equal SERIES_COUNT. If not, recount and fix.\n\nThen write the slides in this EXACT format:\nSLIDE N | HEADLINE: [text] | BODY: [text]\n\nSlide 1 = Cover. HEADLINE = the hook title; it MUST include the exact SERIES_COUNT number (e.g. "The 9 Hidden Taxes You Pay as a Leader"). BODY = the week theme.\nSlides 2 to (SERIES_COUNT+1) = Content slides. Write exactly SERIES_COUNT of them. Each HEADLINE must correspond to the concept from CONTENT_PLAN in order.\nSlide (SERIES_COUNT+2) = Closing. HEADLINE = one reflection question that references the number N (e.g. "Which of these 9 taxes are you paying right now?"). BODY = leave empty.\n\nHARD RULES:\n- CONTENT_PLAN must have exactly SERIES_COUNT items — count them before writing.\n- Generate EXACTLY SERIES_COUNT content slides (Slides 2 to SERIES_COUNT+1). Not one more, not one less.\n- The number in Slide 1 HEADLINE must equal SERIES_COUNT. They must match.\n- HEADLINE: concept name only, max 8 words, max 50 characters. NEVER embed "Tax 3:" or any prefix number.\n- BODY: 1–2 lines, ~100 characters. The single sharpest insight. No bullets, no lists.\n- Closing BODY must be empty.\n- No emojis anywhere.`,
    market_insights: `Write a LinkedIn Market Insights post. Target ${params.targetWordCount} words (180–250). Lead with the key market observation from this week. Connect market data to investor psychology or leadership behaviour. End with a behavioural or strategic implication. Include relevant data points provided in the context.`,
  }

  const audienceContext: Record<string, string> = {
    'Category A': 'This post is for CXOs and Chairmen (Category A). Position Sharath as a peer, not a service provider. The tone should feel like one senior leader speaking to another.',
    'Category B': 'This post is for senior professionals at career crossroads (Category B — PRIMARY target). Mirror their exact situation. The reader should feel: "He is describing me." This is the highest-converting content type.',
    'Category C': 'This post is for working professionals and Bradford students (Category C). Educate and build trust. Accessible, warm, action-oriented.',
    '5-Swans HNI': 'This post is for HNIs and Family Offices. Demonstrate expertise and trustworthiness with capital. Tone: sophisticated peer-to-peer. Never sound like a product salesperson.',
    'Bradford': 'This post is for UAE working professionals considering Bradford programmes. Aspirational but accessible. Progress-focused.',
  }

  const lines: string[] = [
    `## POST BRIEF`,
    `**Day:** ${params.day.charAt(0).toUpperCase() + params.day.slice(1)}`,
    `**Pillar:** ${params.pillar.replace(/_/g, ' ')}`,
    `**Weekly Theme:** ${params.theme}`,
    `**Format:** ${params.format.replace(/_/g, ' ')}`,
    `**Target Audience:** ${params.targetAudience}`,
    audienceContext[params.targetAudience] ?? '',
    ``,
    `**Format Instructions:**`,
    formatInstructions[params.format],
    ``,
    params.hookIdea ? `**Hook idea to develop:** ${params.hookIdea}` : '',
    ``,
    params.narrativeContext,
    ``,
    `## OUTPUT INSTRUCTIONS`,
    `Write the post now. Do not add any preamble, explanation, or meta-commentary.`,
    `Output only the post content itself — exactly as it would appear on LinkedIn.`,
    `After the post, on a new line starting with "WORD_COUNT:", output the exact word count as an integer.`,
    `After that, on a new line starting with "CORE_INSIGHT:", output a 1–2 sentence summary of the post's central idea.`,
    `After that, on a new line starting with "CALLBACK_USED:", output the exact callback line used in the opening.`,
    `After that, on a new line starting with "THREAD_PLANTED:", output the exact thread planted in the closing.`,
    `After that, on a new line starting with "REFERENCES:", output a JSON object: {"vedic":[],"banking":[],"coaching":[]} listing any specific references used.`,
    `After that, on a new line starting with "HASHTAGS:", output 6–8 LinkedIn hashtags separated by spaces. These three are MANDATORY in every post regardless of pillar or audience: #CoachSharath #5Swans #BradfordInternationalAlliance. Then add 3–5 pillar-specific and audience-specific tags from the playbook hashtag strategy. Format: #CoachSharath #5Swans #BradfordInternationalAlliance #Tag4 #Tag5 #Tag6`,
    // Format-specific extra fields
    (params.format === 'long_form_article' || params.format === 'carousel')
      ? `After that, on a new line starting with "LINKEDIN_CAPTION:", write a compelling 200–280 character LinkedIn caption that introduces this document post. It must stop the scroll, hint at the value inside, and end with a reason to open the document. No hashtags in the caption.`
      : `After that, on a new line starting with "QUOTE:", output a single memorable quotable line from the post — maximum 120 characters. It should stand alone as a visual pull-quote. No hashtags. No author attribution.`,
    params.format === 'long_form_article'
      ? `After that, on a new line starting with "ARTICLE_TITLE:", write a compelling article title — maximum 80 characters. 5–10 words. Specific, evocative, and directly tied to the article's central idea. NOT generic (e.g. not "Leadership Lessons" or "Coaching Wisdom"). Must stand alone as the headline on the PDF cover.`
      : '',
  ].filter(Boolean)

  return lines.join('\n')
}

export function buildLinkedInExcerptPrompt(fullArticle: string): string {
  return `You are creating a LinkedIn feed post excerpt from a long-form article written in Sharath Kumar R N's voice.

The excerpt will be published as a standalone LinkedIn post. It must:
1. Stand alone — make complete sense without the full article
2. Preserve Sharath's exact voice, sentence rhythm, and philosophical depth
3. Open with the same hook or an equally strong opening (first 210 characters are critical — LinkedIn cuts here)
4. Include the core insight of the article — the one idea the reader will carry away
5. End with the same reflection question or a closely adapted version of it
6. NOT include phrases like "read the full article", "link in bio", or any external reference — those are added automatically
7. Be between 1,800 and 2,700 characters (NOT words — characters)

WHAT TO KEEP from the original:
- The opening hook (first paragraph or the most gripping version of it)
- The central wisdom — the Vedic reference, banking insight, or coaching story at the heart of the piece
- The most specific application paragraph (where it lands for the reader)
- The closing reflection question

WHAT TO CUT:
- Setup paragraphs that precede the real tension (trim the runway)
- Supporting examples if the main example is already strong
- Transitional paragraphs that only serve the long-form structure
- The callback to previous posts (not needed in the feed excerpt)

CRITICAL: Do not add any preamble, explanation, or commentary. Output ONLY the excerpt text — exactly as it should appear on LinkedIn. No "EXCERPT:" label. No markdown. Just the post.

FULL ARTICLE:
${fullArticle}`
}

// ============================================================
// STORY LOG EXTRACTION PROMPT
// Extracts narrative metadata from a finalized post.
// Called after approval when no explicit metadata was captured.
// ============================================================
export function buildStoryLogExtractionPrompt(postContent: string): string {
  return `Analyse this LinkedIn post and extract its narrative metadata. Return ONLY a valid JSON object with these exact keys:

{
  "core_insight": "1–2 sentence summary of the post's central idea",
  "callback_used": "The exact sentence(s) in the opening that reference a previous post, or null if none",
  "thread_planted": "The exact sentence(s) in the closing that plant a forward seed, or null if none",
  "references_used": {
    "vedic": ["list of specific Vedic texts, characters, or concepts referenced"],
    "banking": ["list of specific banking, trading, or finance references"],
    "coaching": ["list of specific coaching stories or client situations referenced"]
  }
}

POST:
${postContent}`
}


// ============================================================
// EDIT DIFF LEARNING PROMPT
// Compares original vs. edited draft to extract voice rules.
// ============================================================
export function buildEditDiffPrompt(originalDraft: string, editedDraft: string): string {
  return `You are analysing edits made by Sharath Kumar R N to an AI-generated LinkedIn post. Your job is to identify patterns in what he changed and extract them as reusable voice rules.

Compare the two versions and identify 1–5 specific patterns in what changed. Focus on:
- Phrases he consistently removed or replaced
- Structural patterns he corrected
- Tone adjustments he made
- Opening or closing style preferences revealed
- CTA language he changed

Return ONLY a valid JSON array of rule objects:

[
  {
    "category": "avoid_phrase" | "prefer_phrase" | "structural_pattern" | "cta_adjustment" | "tone_calibration" | "opening_style" | "closing_style",
    "rule_text": "Clear, actionable rule in plain English (e.g., 'Never open with a question that answers itself')",
    "example_before": "The exact phrase or passage from the original draft",
    "example_after": "The replacement phrase or passage from the edited version"
  }
]

Only include rules where the pattern is clear and generalisable — not one-off word choices.

CRITICAL: Every rule MUST be evidenced by an actual edit. example_before must be real text from the ORIGINAL draft; example_after must be the replacement text from the EDITED version — and they must be different. Never generate a rule where example_before equals example_after. If you cannot find genuinely changed text to illustrate a rule, do NOT include that rule.

ORIGINAL DRAFT:
${originalDraft}

EDITED VERSION:
${editedDraft}`
}


// ============================================================
// THEME PROPOSAL PROMPT
// Generates 3–5 theme options for a given week.
// ============================================================
export function buildThemeProposalPrompt(params: {
  weekNumber: number
  year: number
  quarter: string
  quarterTheme: string
  recentThemes: string[]
  openThread: string | null
}): string {
  return `You are proposing weekly content themes for Sharath Kumar R N's LinkedIn content plan.

**Context:**
- Week ${params.weekNumber} of ${params.year}
- Quarter: ${params.quarter} — "${params.quarterTheme}"
- Recent themes (do not repeat within 4 weeks): ${params.recentThemes.join(', ') || 'None yet'}
- Open thread from previous week: ${params.openThread ?? 'None'}

**Rules for theme proposals:**
1. Must fit the current quarterly arc tone (${params.quarter}: ${params.quarterTheme})
2. Must not repeat any theme from the last 4 weeks
3. Must naturally honour the open thread if one exists
4. Must span all 5 content pillars across the week's 5 posts
5. Must have at least one theme that speaks directly to Category B (senior professionals at career crossroads)

**Output:** Return ONLY a valid JSON array of exactly 5 theme objects:

[
  {
    "theme": "Theme name (5–10 words, evocative, specific)",
    "rationale": "One sentence: why this theme fits this week and this quarter",
    "primary_pillar": "vedic_leadership | banker_coach | coaching_transformation | financial_intelligence | inner_work",
    "primary_audience": "Category A | Category B | Category C | 5-Swans HNI | Bradford",
    "open_thread_link": "How this theme connects to or resolves the open thread, or null"
  }
]`
}


// ============================================================
// WEEK PLAN GENERATION PROMPT
// Builds the 6-slot week plan from a confirmed theme.
// ============================================================
export function buildWeekPlanPrompt(params: {
  theme: string
  quarter: string
  quarterTheme: string
  weekNumber: number
}): string {
  return `Generate a 6-post weekly content plan for Sharath Kumar R N.

**Weekly theme:** "${params.theme}"
**Quarter:** ${params.quarter} — ${params.quarterTheme}
**Week:** ${params.weekNumber}

**Weekly calendar rules:**
- Monday: Long-form article | Pillar 3 (Coaching Transformation) | Category B | 900–1,100 words | chapter_opening
- Tuesday: Text post | Pillar 4A (Wealth Management) | 5-Swans HNI | 180–250 words | chapter_deepening
- Wednesday: Long-form article | Pillar 1 or 2 (Vedic-Leadership or Banker-Coach) | Category A/B | 900–1,100 words | complication or chapter_deepening
- Thursday: Carousel | Pillar 1 or 5 (Vedic-Leadership or Inner Work) | Category A/B | 8–10 slides | resolution or complication
- Friday: Text post | Pillar 4B (Financial Wellness) | Bradford/Category C | 180–250 words | resolution
- Saturday: Market Insights post | Pillar 4C | 5-Swans + general | 180–250 words | bridge — NOTE: status should be "awaiting_market_data", hook_idea should reference the theme but content is generated on Saturday

**Output:** Return ONLY a valid JSON array of 6 plan slot objects:

[
  {
    "day": "monday | tuesday | wednesday | thursday | friday | saturday",
    "pillar": "vedic_leadership | banker_coach | coaching_transformation | financial_intelligence | inner_work",
    "format": "long_form_article | text_post | carousel | market_insights",
    "narrative_position": "chapter_opening | chapter_deepening | complication | resolution | bridge",
    "target_audience": "Category A | Category B | Category C | 5-Swans HNI | Bradford",
    "target_word_count": 950,
    "hook_idea": "A specific, evocative hook idea (15–25 words) rooted in the week's theme"
  }
]`
}
