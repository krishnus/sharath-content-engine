// ============================================================
// ADD THIS FUNCTION TO lib/anthropic/prompts.ts
// Place it after buildGeneratePostPrompt
// ============================================================

// ── SATURDAY MARKET INSIGHTS PROMPT ──────────────────────────────────
// Called instead of buildGeneratePostPrompt when format === 'market_insights'
// and marketContext is provided.
export function buildSaturdayMarketInsightsPrompt(params: {
  marketContext: string
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
    `**Narrative position:** Bridge — this post closes the week and opens a thread into next week`,
    ``,
    params.openThread
      ? `**Open thread to bridge:** "${params.openThread}" — weave this into the closing.`
      : '',
    ``,
    `## THIS WEEK'S ACTUAL MARKET DATA`,
    `Use ONLY the data below. Never fabricate numbers, indices, or events.`,
    ``,
    params.marketContext,
    ``,
    `## FORMAT INSTRUCTIONS`,
    `Write a LinkedIn Market Insights post using ONLY the market data above.`,
    ``,
    `Structure:`,
    `1. **Hook (first line, under 210 chars):** A specific market observation from the data — not a generic statement. Lead with a number or a surprising move.`,
    `2. **The behavioural lens (2-3 sentences):** What does this week's market behaviour reveal about investor psychology, risk appetite, or decision-making? Connect to Sharath's banking and coaching expertise.`,
    `3. **Connection to the week's theme (1-2 sentences):** Draw a brief thread between the market pattern and this week's broader theme. The market and the inner world are never separate.`,
    `4. **Strategic implication (1-2 sentences):** What should a thoughtful HNI investor be watching or doing? Specific and actionable — not generic advice.`,
    `5. **Closing reflection (1 sentence):** A question or observation that bridges into next week.`,
    ``,
    `**Tone:** Analytical but accessible. Peer-to-peer with HNIs. Never sounds like a product pitch or financial advice disclaimer. Sounds like Sharath talking to a sophisticated investor friend.`,
    ``,
    `## OUTPUT INSTRUCTIONS`,
    `Write the post now. No preamble, no explanation.`,
    `Output only the post content — exactly as it would appear on LinkedIn.`,
    `After the post, on a new line: WORD_COUNT: [integer]`,
    `After that: CORE_INSIGHT: [1 sentence summary]`,
    `After that: THREAD_PLANTED: [the closing line that bridges to next week]`,
    `After that: HASHTAGS: #5Swans #CoachSharath #WealthManagement #MarketInsights #InvestorPsychology [add 2-3 relevant sector/topic tags]`,
  ].filter(s => s !== null && s !== undefined).join('\n')
}
