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
let _swansLogo:     string | null = null
let _coachTemplate: string | null = null

function getAssets() {
  if (!_swansLogo)
    _swansLogo = fileToDataUri(path.join(BRAND_DIR, '5swans-logo.png'), 'image/png')
  if (!_coachTemplate)
    _coachTemplate = fileToDataUri(path.join(BRAND_DIR, 'quote-coach-template.png'), 'image/png')
  return { swansLogo: _swansLogo!, coach: _coachTemplate! }
}

export type QuoteImageProps = {
  quote:         string
  authorName:    string
  pillar:        string
  useSwansLogo?: boolean
}

// Scale down for very long quotes; 44px is the target for the typical range
function financeQuoteFontSize(len: number): number {
  if (len <= 80)  return 52
  if (len <= 120) return 44
  if (len <= 160) return 36
  return 30
}

// Coach text zone: 730w × 275h — tighter zone, smaller scale
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
  const fonts  = getFontBuffers()
  const assets = getAssets()

  const displayQuote = normalizeIAST(quote.length > 180 ? quote.slice(0, 177) + '...' : quote)

  // ── 5-Swans finance quote — flat navy canvas, carousel-system design ──────
  // Same navy (#091E3A) + gold (#C8A04A) palette as carousel and article PDF.
  // Three zones: logo (A) · divider + quote (B) · footer row (C).
  const financeLayout = {
    type: 'div',
    props: {
      style: {
        width:           1080,
        height:          1080,
        display:         'flex',
        flexDirection:   'column' as const,
        justifyContent:  'space-between',
        paddingTop:      80,
        paddingBottom:   80,
        paddingLeft:     80,
        paddingRight:    80,
        backgroundColor: '#091E3A',
      },
      children: [

        // ── Zone A — 5-Swans logo (280×280) + wordmark below, centred ──────
        {
          type: 'div',
          props: {
            style: {
              display:        'flex',
              flexDirection:  'column' as const,
              alignItems:     'center',
            },
            children: [
              // Logo — doubled from 140 to 280
              {
                type: 'img',
                props: {
                  src:   assets.swansLogo,
                  style: { width: 280, height: 280, objectFit: 'contain' as const },
                },
              },
              // Wordmark — spans same 280px width as the logo.
              // Light lavender (#A090D0) samples the logo's dominant purple-blue gradient.
              // fontSize 52 + letterSpacing 6px ≈ 280px for "5-SWANS" in Montserrat 600.
              {
                type: 'div',
                props: {
                  style: {
                    width:         280,
                    marginTop:     14,
                    fontSize:      52,
                    fontWeight:    600,
                    color:         '#A090D0',
                    letterSpacing: '6px',
                    textAlign:     'center' as const,
                    fontFamily:    'Montserrat',
                  },
                  children: '5-SWANS',
                },
              },
            ],
          },
        },

        // ── Zone B — gold divider + quote text, vertically centred ───────
        {
          type: 'div',
          props: {
            style: {
              display:        'flex',
              flexDirection:  'column' as const,
              justifyContent: 'center',
              flexGrow:       1,
              paddingTop:     48,
              paddingBottom:  48,
            },
            children: [
              // Accent divider — echoes carousel goldDivider
              {
                type: 'div',
                props: {
                  style: {
                    width:           60,
                    height:          3,
                    backgroundColor: '#C8A04A',
                    marginBottom:    32,
                  },
                },
              },
              // Quote text — no quotation mark glyphs; divider signals the quote
              {
                type: 'div',
                props: {
                  style: {
                    fontSize:   financeQuoteFontSize(displayQuote.length),
                    fontWeight: 500,
                    color:      '#FFFFFF',
                    lineHeight: 1.5,
                    fontFamily: 'Montserrat',
                  },
                  children: displayQuote,
                },
              },
            ],
          },
        },

        // ── Zone C — footer: hairline rule + two-column text row ─────────
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column' as const },
            children: [
              // Hairline divider (rendered as a thin div — more reliable than CSS border in satori)
              {
                type: 'div',
                props: {
                  style: {
                    height:          1,
                    backgroundColor: 'rgba(255,255,255,0.15)',
                    marginBottom:    20,
                  },
                },
              },
              // Footer row
              {
                type: 'div',
                props: {
                  style: {
                    display:        'flex',
                    flexDirection:  'row' as const,
                    justifyContent: 'space-between',
                    alignItems:     'center',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize:      18,
                          fontWeight:    400,
                          color:         'rgba(255,255,255,0.45)',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase' as const,
                          fontFamily:    'Montserrat',
                        },
                        children: 'www.5-swans.com',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize:      18,
                          fontWeight:    400,
                          color:         'rgba(255,255,255,0.45)',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase' as const,
                          fontFamily:    'Montserrat',
                        },
                        children: 'Wealth Management',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },

      ],
    },
  }

  // ── Coach Sharath template (unchanged) ───────────────────────────────────
  const coachLayout = {
    type: 'div',
    props: {
      style: {
        width:              1080,
        height:             1080,
        position:           'relative' as const,
        display:            'flex',
        backgroundImage:    `url('${assets.coach}')`,
        backgroundSize:     'cover',
        backgroundPosition: 'center',
      },
      children: [{
        type: 'div',
        props: {
          style: {
            position: 'absolute' as const,
            top:      390,
            left:     110,
            width:    730,
            height:   275,
            display:  'flex',
            alignItems:     'center',
            justifyContent: 'center',
          },
          children: [{
            type: 'div',
            props: {
              style: {
                fontSize:   coachFontSize(displayQuote.length),
                fontWeight: 600,
                color:      '#1a2d6b',
                textAlign:  'center' as const,
                lineHeight: 1.45,
                fontFamily: 'Montserrat',
              },
              children: displayQuote,
            },
          }],
        },
      }],
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = await (satori as any)(
    useSwansLogo ? financeLayout : coachLayout,
    {
      width:  1080,
      height: 1080,
      fonts: [
        { name: 'Montserrat', data: fonts.regular.buffer,  weight: 400, style: 'normal' },
        { name: 'Montserrat', data: fonts.semiBold.buffer, weight: 600, style: 'normal' },
        { name: 'Montserrat', data: fonts.bold.buffer,     weight: 700, style: 'normal' },
      ],
    }
  )

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } })
  const png   = resvg.render()
  return Buffer.from(png.asPng())
}
