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

export function getFontBuffers() {
  if (!_regular)  _regular  = fs.readFileSync(path.join(FONTS_DIR, 'Montserrat-Regular.ttf'))
  if (!_semiBold) _semiBold = fs.readFileSync(path.join(FONTS_DIR, 'Montserrat-SemiBold.ttf'))
  if (!_bold)     _bold     = fs.readFileSync(path.join(FONTS_DIR, 'Montserrat-Bold.ttf'))
  return {
    regular:  _regular!,
    semiBold: _semiBold!,
    bold:     _bold!,
  }
}

// For react-pdf: font src paths
export const FONT_PATHS = {
  regular:  path.join(FONTS_DIR, 'Montserrat-Regular.ttf'),
  semiBold: path.join(FONTS_DIR, 'Montserrat-SemiBold.ttf'),
  bold:     path.join(FONTS_DIR, 'Montserrat-Bold.ttf'),
}

export const LOGO_PATH = path.join(process.cwd(), 'public/brand/coach-sharath-logo.png')
export const SWANS_LOGO_PATH = path.join(process.cwd(), 'public/brand/5swans-logo.png')
