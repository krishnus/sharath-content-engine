#!/usr/bin/env node
/**
 * reset-weeks.ts
 *
 * Deletes all posts (+ cascaded records: drafts, story_log, linkedin_posts,
 * post_media, performance_data) for the specified weeks, cleans up Supabase
 * Storage files, then deletes the week records themselves so they can be
 * re-created fresh from the Sunday planning session.
 *
 * Usage:
 *   npx tsx scripts/reset-weeks.ts
 *
 * Edit WEEKS and YEAR below before running.
 */

import * as fs   from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

// ── Configuration ─────────────────────────────────────────────────────────────
const WEEKS = [26, 27]           // week numbers to delete
const YEAR  = 2026               // year for those weeks
const STORAGE_BUCKET = 'post-media'
// ─────────────────────────────────────────────────────────────────────────────

// Load .env.local so this script can run outside Next.js
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  const raw = fs.readFileSync(envPath, 'utf-8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val   = trimmed.slice(eqIdx + 1).trim()
    // Strip surrounding quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function main() {
  console.log(`\nResetting weeks ${WEEKS.join(', ')} for year ${YEAR}…\n`)

  const { data: weeks, error: weeksErr } = await supabase
    .from('weeks')
    .select('id, week_number, theme')
    .eq('year', YEAR)
    .in('week_number', WEEKS)

  if (weeksErr) throw weeksErr

  if (!weeks?.length) {
    console.log('No matching weeks found — nothing to delete.')
    return
  }

  for (const week of weeks) {
    console.log(`── Week ${week.week_number}: "${week.theme ?? '(no theme)'}" (${week.id})`)

    // ── Fetch posts ──────────────────────────────────────────────────────────
    const { data: posts, error: postsErr } = await supabase
      .from('posts')
      .select('id, day, status')
      .eq('week_id', week.id)

    if (postsErr) throw postsErr

    if (!posts?.length) {
      console.log('   No posts found.')
    } else {
      const postIds = posts.map(p => p.id)
      console.log(`   Found ${postIds.length} post(s):`)
      for (const p of posts) console.log(`     ${p.day.padEnd(10)} status=${p.status}`)

      // ── Clean up Storage files ─────────────────────────────────────────────
      const { data: mediaRows } = await supabase
        .from('post_media')
        .select('storage_path')
        .in('post_id', postIds)

      if (mediaRows?.length) {
        const paths = mediaRows.map(m => m.storage_path)
        const { error: storageErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove(paths)
        if (storageErr) {
          console.warn(`   ⚠  Storage cleanup warning: ${storageErr.message}`)
        } else {
          console.log(`   Deleted ${paths.length} Storage file(s)`)
        }
      }

      // ── Delete posts (cascades to drafts, story_log, linkedin_posts, etc.) ─
      const { error: deletePostsErr } = await supabase
        .from('posts')
        .delete()
        .in('id', postIds)

      if (deletePostsErr) throw deletePostsErr
      console.log(`   Deleted ${postIds.length} post(s) + cascaded records`)
    }

    // ── Delete the week record ───────────────────────────────────────────────
    const { error: deleteWeekErr } = await supabase
      .from('weeks')
      .delete()
      .eq('id', week.id)

    if (deleteWeekErr) throw deleteWeekErr
    console.log(`   Deleted week record`)
  }

  console.log('\nDone. Open the dashboard → Sunday Planning to recreate these weeks.\n')
}

main().catch(err => {
  console.error('\nFatal error:', err)
  process.exit(1)
})
