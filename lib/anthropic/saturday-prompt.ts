// ── SATURDAY MARKET INSIGHTS PROMPT ──────────────────────────────────
export function buildSaturdayMarketInsightsPrompt(params: {
  marketContext: string
  marketSnapshot: string
  theme: string
  quarter: string
  openThread: string | null
  targetWordCount: number
}): string {
  return [
    `## SATURDAY MARKET INSIGHTS BRIEF`,
    ``,
    `**Weekly theme:** "${params.theme}"`,
    `**Quarterly arc:** ${params.quarter}`,
    `**Target length:** ${params.targetWordCount} words (strict 180–250 range)`,
    `**Target audience:** 5-Swans HNI investors and general market followers`,
    `**Narrative position:** Bridge — close the week, open a thread into next week`,
    ``,
    params.openThread ? `**Open thread to bridge:** "${params.openThread}"` : '',
    ``,
    `## THIS WEEK'S MARKET DATA`,
    `Use ONLY the data below. Never fabricate numbers, indices, or events.`,
    ``,
    `AUTO-FETCHED MARKET SNAPSHOT:`,
    params.marketSnapshot,
    ``,
    params.marketContext?.trim()
      ? `SHARATH'S QUALITATIVE CONTEXT (sector stories, FII sentiment, macro commentary):\n${params.marketContext}`
      : '',
    ``,
    `## FORMAT INSTRUCTIONS`,
    `Structure:`,
    `1. Hook (first line, under 210 chars): Specific market observation with real numbers.`,
    `2. Behavioural lens (2-3 sentences): What does this market behaviour reveal about investor psychology?`,
    `3. Theme connection (1-2 sentences): Thread between market pattern and this week's theme.`,
    `4. Strategic implication (1-2 sentences): What should a thoughtful HNI investor watch or do?`,
    `5. Closing reflection (1 sentence): Bridge into next week.`,
    ``,
    `**Scriptural citations:** If referencing any shloka or text, use full format:`,
    `Sanskrit in Devanagari + simple phonetic romanization (standard English letters only, no diacritical marks) + reference code (BG 3.21 / AS 1.6 etc.) + translation.`,
    ``,
    `**Tone:** Analytical, peer-to-peer with HNIs. Never a product pitch.`,
    ``,
    `## OUTPUT INSTRUCTIONS`,
    `Write the post only. No preamble.`,
    `IMPORTANT: Output each metadata field as plain text on its own line — no markdown, no bold, no asterisks. Exactly as shown below.`,
    `After the post, on a new line: WORD_COUNT: [integer]`,
    `After that, on a new line: CORE_INSIGHT: [1 sentence]`,
    `After that, on a new line: THREAD_PLANTED: [closing line]`,
    `After that, on a new line: HASHTAGS: #CoachSharath #5Swans #BradfordInternationalAlliance #WealthManagement #MarketInsights #InvestorPsychology [add 1-2 sector tags from the market events]`,
    `After that, on a new line: QUOTE: [the single most striking sentence from the post — maximum 120 characters, no hashtags, sentence case not all-caps]`,
  ].filter(Boolean).join('\n')
}
