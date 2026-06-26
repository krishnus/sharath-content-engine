/**
 * patch-fontkit.cjs
 *
 * fontkit's GPOSProcessor.getAnchor() crashes when called with a null anchor
 * (incomplete GPOS table in some fonts). This adds a null guard so the GPOS
 * rule is silently skipped rather than throwing.
 *
 * Run automatically via postinstall — no manual step needed.
 */

const fs   = require('fs')
const path = require('path')

const FILES = [
  'node_modules/fontkit/dist/main.cjs',
  'node_modules/fontkit/dist/module.mjs',
]

// The exact text to find and replace in both files.
// The pattern is unique in the codebase (confirmed with grep).
const NEEDLE = `    getAnchor(anchor) {
        // TODO: contour point, device tables
        let x = anchor.xCoordinate;`

const PATCH = `    getAnchor(anchor) {
        // TODO: contour point, device tables
        if (!anchor) return { x: 0, y: 0 }; // null-guard: skip GPOS rule with missing anchor
        let x = anchor.xCoordinate;`

let patchedCount = 0

for (const relPath of FILES) {
  const filePath = path.join(process.cwd(), relPath)
  if (!fs.existsSync(filePath)) {
    console.log(`patch-fontkit: skipping (not found) ${relPath}`)
    continue
  }

  let src = fs.readFileSync(filePath, 'utf-8')

  if (src.includes('null-guard: skip GPOS')) {
    console.log(`patch-fontkit: already patched ${relPath}`)
    continue
  }

  if (!src.includes(NEEDLE)) {
    console.warn(`patch-fontkit: pattern not found in ${relPath} — skipping (fontkit version may have changed)`)
    continue
  }

  src = src.replace(NEEDLE, PATCH)
  fs.writeFileSync(filePath, src, 'utf-8')
  console.log(`patch-fontkit: patched ${relPath}`)
  patchedCount++
}

if (patchedCount > 0) {
  console.log(`patch-fontkit: ${patchedCount} file(s) patched successfully`)
}
