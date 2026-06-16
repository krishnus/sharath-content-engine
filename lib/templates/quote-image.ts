// eslint-disable-next-line @typescript-eslint/no-require-imports
const satori = require('satori').default ?? require('satori')
import { Resvg } from '@resvg/resvg-js'
import { getFontBuffers } from './fonts'
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

export async function generateQuoteImage(props: QuoteImageProps): Promise<Buffer> {
  const { quote, useSwansLogo } = props
  const fonts = getFontBuffers()
  const { finance, coach } = getTemplates()

  const displayQuote = quote.length > 200 ? quote.slice(0, 197) + '...' : quote

  // Font size: scale down for longer quotes
  const fontSize = displayQuote.length > 150 ? 32
    : displayQuote.length > 100 ? 38
    : 44

  // ── Finance template (5-Swans posts) ──────────────────────────────────────
  // Template layout: dark blue/purple gradient bg, large centred white rounded box,
  // 5 Swans logo top-centre, footer strip bottom.
  // Text zone inside white box: approx top=310 left=130 width=820 height=380
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
              top: 310, left: 130,
              width: 820, height: 400,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
            children: {
              type: 'div',
              props: {
                style: {
                  fontSize,
                  fontWeight: 700,
                  color: '#1a2d6b',
                  textTransform: 'uppercase' as const,
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
  // Template layout: light background with chart graphics, gold speech bubble,
  // Sharath photo top-left overlapping bubble, Coach Sharath logo top-right,
  // author strip below bubble, footer bottom.
  // Text zone inside speech bubble (below photo): approx top=290 left=210 width=660 height=390
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
              top: 290, left: 210,
              width: 660, height: 390,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
            children: {
              type: 'div',
              props: {
                style: {
                  fontSize,
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
