// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

const REF_UUID   = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const inlineRefRe    = () => new RegExp(`\\[([^\\]]+)\\]\\(REF:(${REF_UUID})\\)`, 'gi')
const standaloneRefRe = () => new RegExp(`\\[REF:(${REF_UUID})\\]`, 'gi')

/**
 * Resolve REF tokens to real LinkedIn URLs.
 *
 * Two token formats are supported:
 *   [anchor text](REF:uuid)  — inline link; resolves to [anchor](url) in PDF context,
 *                               or just `anchor` in linkedin context (no markdown links on LI)
 *   [REF:uuid]               — standalone; used with a ↳ prefix line; always resolves to the raw URL
 *
 * Unresolved tokens (post not yet published) degrade gracefully:
 *   inline    → anchor text only (sentence reads naturally without the link)
 *   standalone → empty string; orphaned ↳ lines are stripped
 */
export async function resolveRefs(
  text: string,
  supabase: SupabaseLike,
  context: 'pdf' | 'linkedin' = 'pdf'
): Promise<{ text: string; unresolvedCount: number }> {
  const inlineMatches    = [...text.matchAll(inlineRefRe())]
  const standaloneMatches = [...text.matchAll(standaloneRefRe())]

  if (inlineMatches.length === 0 && standaloneMatches.length === 0) {
    return { text, unresolvedCount: 0 }
  }

  const postIds = [...new Set([
    ...inlineMatches.map(m => m[2]),
    ...standaloneMatches.map(m => m[1]),
  ])]

  const { data: liPosts } = await supabase
    .from('linkedin_posts')
    .select('post_id, linkedin_url')
    .in('post_id', postIds)

  const urlMap = new Map<string, string>(
    (liPosts ?? [])
      .filter((lp: { linkedin_url: string | null }) => lp.linkedin_url)
      .map((lp: { post_id: string; linkedin_url: string }) => [lp.post_id, lp.linkedin_url])
  )

  let unresolvedCount = 0

  // 1. Inline [anchor](REF:uuid) → [anchor](url) for PDF, anchor-only for LinkedIn
  let resolved = text.replace(inlineRefRe(), (_match, label, postId) => {
    const url = urlMap.get(postId)
    if (url) return context === 'pdf' ? `[${label}](${url})` : label
    unresolvedCount++
    return label  // degrade to plain text regardless of context
  })

  // 2. Standalone [REF:uuid] → raw URL (or empty when unresolved)
  resolved = resolved.replace(standaloneRefRe(), (_match, postId) => {
    const url = urlMap.get(postId)
    if (url) return url
    unresolvedCount++
    return ''
  })

  // Strip orphaned ↳ lines left behind by unresolved standalone refs
  resolved = resolved
    .split('\n')
    .filter(line => line.trim() !== '↳' && line.trim() !== '↳ ')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { text: resolved, unresolvedCount }
}
