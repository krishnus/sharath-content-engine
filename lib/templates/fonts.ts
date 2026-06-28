import path from 'path'
import fs from 'fs'

export const BRAND_BLUE = '#0B4E94'
export const BRAND_GOLD = '#FFAF38'
export const BRAND_WHITE = '#FFFFFF'
export const BRAND_DARK = '#0D1117'

const FONTS_DIR = path.join(process.cwd(), 'public/fonts')

// Read font files once and cache in memory
let _regular: Buffer | null = null
let _semiBold: Buffer | null = null
let _bold: Buffer | null = null
let _devanagari: Buffer | null = null

export function getFontBuffers() {
  if (!_regular)    _regular    = fs.readFileSync(path.join(FONTS_DIR, 'Montserrat-Regular.ttf'))
  if (!_semiBold)   _semiBold   = fs.readFileSync(path.join(FONTS_DIR, 'Montserrat-SemiBold.ttf'))
  if (!_bold)       _bold       = fs.readFileSync(path.join(FONTS_DIR, 'Montserrat-Bold.ttf'))
  if (!_devanagari) _devanagari = fs.readFileSync(path.join(FONTS_DIR, 'NotoSansDevanagari-Regular.ttf'))
  return {
    regular:    _regular!,
    semiBold:   _semiBold!,
    bold:       _bold!,
    devanagari: _devanagari!,
  }
}

// For react-pdf: font src paths
export const FONT_PATHS = {
  regular:    path.join(FONTS_DIR, 'Montserrat-Regular.ttf'),
  semiBold:   path.join(FONTS_DIR, 'Montserrat-SemiBold.ttf'),
  bold:       path.join(FONTS_DIR, 'Montserrat-Bold.ttf'),
  devanagari: path.join(FONTS_DIR, 'NotoSansDevanagari-Regular.ttf'),
}

export const LOGO_PATH            = path.join(process.cwd(), 'public/brand/coach-sharath-logo.png')
export const DARK_BG_LOGO_PATH    = path.join(process.cwd(), 'public/brand/coach-sharath-logo-darkbackground-trimmed.png')
export const LIGHT_BG_LOGO_PATH   = path.join(process.cwd(), 'public/brand/coach-sharath-logo-lightbackground.png')
export const SWANS_LOGO_PATH      = path.join(process.cwd(), 'public/brand/5swans-logo.png')

// ── IAST diacritical → ASCII safety net ──────────────────────────────────────
// Montserrat has no glyphs for Latin Extended Additional (U+1E00–U+1EFF).
// Normalise any stray IAST characters before passing to react-pdf or satori.
const IAST: Record<string, string> = {
  'ā': 'a',  'Ā': 'A',
  'ī': 'i',  'Ī': 'I',
  'ū': 'u',  'Ū': 'U',
  'ṛ': 'r',  'Ṛ': 'R',
  'ṝ': 'r',  'Ṝ': 'R',
  'ḷ': 'l',  'Ḷ': 'L',
  'ṭ': 't',  'Ṭ': 'T',
  'ḍ': 'd',  'Ḍ': 'D',
  'ṇ': 'n',  'Ṇ': 'N',
  'ṅ': 'n',  'Ṅ': 'N',
  'ś': 'sh', 'Ś': 'Sh',
  'ṣ': 'sh', 'Ṣ': 'Sh',
  'ḥ': 'h',  'Ḥ': 'H',
  'ṃ': 'm',  'Ṃ': 'M',
  'ñ': 'n',  'Ñ': 'N',
}
const IAST_RE = new RegExp(Object.keys(IAST).join('|'), 'g')

export function normalizeIAST(text: string): string {
  return text
    .replace(IAST_RE, ch => IAST[ch] ?? ch)
    // Typographic characters Montserrat may not have glyphs for — convert to ASCII equivalents
    .replace(/[“”]/g, '"')   // curly double quotes
    .replace(/[‘’]/g, "'")   // curly single quotes / apostrophes
    .replace(/—/g, '--')           // em dash
    .replace(/–/g, '-')            // en dash
    .replace(/…/g, '...')          // ellipsis
    .replace(/ /g, ' ')            // non-breaking space
}
