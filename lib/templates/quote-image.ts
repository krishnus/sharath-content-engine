// eslint-disable-next-line @typescript-eslint/no-require-imports
const satori = require('satori').default ?? require('satori')
import { Resvg } from '@resvg/resvg-js'
import { getFontBuffers, normalizeIAST } from './fonts'
import fs from 'fs'
import path from 'path'

const BRAND_DIR = path.join(process.cwd(), 'public/brand')

function fileToDataUri(filePath: string, mime: string): string {
  const data = fs.readFileSync(filePath)
  return `data:${mime};base64,${data.toString('base64')}`
}

// Cached data URIs — loaded once per process
let _financeTemplate: string | null = null
let _coachTemplate: string | null = null

function getTemplates() {
  if (!_financeTemplate)
    _financeTemplate = fileToDataUri(path.join(BRAND_DIR, 'quote-finance-template.jpeg'), 'image/jpeg')
  if (!_coachTemplate)
    _coachTemplate = fileToDataUri(path.join(BRAND_DIR, 'quote-coach-template.png'), 'image/png')
  return { finance: _financeTemplate!, coach: _coachTemplate! }
}

export type QuoteImageProps = {
  quote:         string
  authorName:    string
  pillar:        string
  useSwansLogo?: boolean
}

// Finance text zone: 820w × 575h (y=265–840, full white box above separator line)
// Verified against public/brand/quote-finance-template.jpeg
function financeFontSize(len: number): number {
  if (len <= 30)  return 80
  if (len <= 50)  return 70
  if (len <= 70)  return 62
  if (len <= 90)  return 54
  if (len <= 110) return 48
  return 42
}

// Coach text zone: 730w × 275h (y=390–665, below photo+66 marks, above 99 marks)
// Verified against public/brand/quote-coach-template.png
// Tighter height (275px vs 575px) → smaller font scale
function coachFontSize(len: number): number {
  if (len <= 30)  return 68
  if (len <= 50)  return 58
  if (len <= 70)  return 50
  if (len <= 90)  return 44
  if (len <= 110) return 38
  return 34
}

export async function generateQuoteImage(props: QuoteImageProps): Promise<Buffer> {
  const { quote, useSwansLogo } = props
  const fonts = getFontBuffers()
  const { finance, coach } = getTemplates()

  const displayQuote = normalizeIAST(quote.length > 120 ? quote.slice(0, 117) + '...' : quote)

  // ── Finance template (5-Swans posts) ──────────────────────────────────────
  // White box: top=265 bottom=840 → 575px tall, left=130 right=950 → 820px wide
  // Opening 66 ornament at top-left (y=295–415), separator line at y=840
  // Text zone covers full interior above separator line
  const financeLayout = {
    type: 'div',
    props: {
      style: {
        width: 1080, height: 1080,
        position: 'relative' as const,
        display: 'flex',
        backgroundImage: `url('${finance}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute' as const,
              top: 265, left: 130,
              width: 820, height: 575,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
            children: {
              type: 'div',
              props: {
                style: {
                  fontSize: financeFontSize(displayQuote.length),
                  fontWeight: 700,
                  color: '#1a2d6b',
                  textAlign: 'center' as const,
                  lineHeight: 1.3,
                  fontFamily: 'Montserrat',
                },
                children: displayQuote,
              },
            },
          },
        },
      ],
    },
  }

  // ── Coach Sharath template (all other posts) ───────────────────────────────
  // Gold speech bubble: left=80 right=860 top=195 bottom=760 (tail at y=760–820)
  // Photo (top-left, y=110–265) and opening 66 marks (y=275–365) block top-left
  // Closing 99 marks at bottom-right (y=685–755, x=760–845)
  // Safe text zone: below 66 marks and photo, above 99 marks
  const coachLayout = {
    type: 'div',
    props: {
      style: {
        width: 1080, height: 1080,
        position: 'relative' as const,
        display: 'flex',
        backgroundImage: `url('${coach}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute' as const,
              top: 390, left: 110,
              width: 730, height: 275,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
            children: {
              type: 'div',
              props: {
                style: {
                  fontSize: coachFontSize(displayQuote.length),
                  fontWeight: 600,
                  color: '#1a2d6b',
                  textAlign: 'center' as const,
                  lineHeight: 1.45,
                  fontFamily: 'Montserrat',
                },
                children: displayQuote,
              },
            },
          },
        },
      ],
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = await (satori as any)(
    useSwansLogo ? financeLayout : coachLayout,
    {
      width: 1080,
      height: 1080,
      fonts: [
        { name: 'Montserrat', data: fonts.regular.buffer,  weight: 400, style: 'normal' },
        { name: 'Montserrat', data: fonts.semiBold.buffer, weight: 600, style: 'normal' },
        { name: 'Montserrat', data: fonts.bold.buffer,     weight: 700, style: 'normal' },
      ],
    }
  )

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } })
  const png = resvg.render()
  return Buffer.from(png.asPng())
}
