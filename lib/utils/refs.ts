// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

const REF_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const refRe = () => new RegExp(`\\[REF:(${REF_UUID})\\]`, 'gi')

/**
 * Resolve [REF:post_id] placeholders to LinkedIn post URLs.
 * Unresolved refs (post not yet published) are stripped, and any orphaned ↳ prefix
 * line is also removed. Resolved refs become the raw URL string, which the article
 * PDF template renders as a clickable link when it encounters a ↳ url line.
 */
export async function resolveRefs(
  text: string,
  supabase: SupabaseLike
): Promise<{ text: string; unresolvedCount: number }> {
  const matches = [...text.matchAll(refRe())]
  if (matches.length === 0) return { text, unresolvedCount: 0 }

  const postIds = [...new Set(matches.map(m => m[1]))]
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
  let resolved = text.replace(refRe(), (_match, postId) => {
    const url = urlMap.get(postId)
    if (url) return url
    unresolvedCount++
    return ''
  })

  // Remove orphaned ↳ lines (↳ with nothing after it once the ref was stripped)
  resolved = resolved
    .split('\n')
    .filter(line => line.trim() !== '↳' && line.trim() !== '↳ ')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { text: resolved, unresolvedCount }
}
