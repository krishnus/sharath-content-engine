// eslint-disable-next-line @typescript-eslint/no-require-imports
const satori = require('satori').default ?? require('satori')
import { Resvg } from '@resvg/resvg-js'
import { getFontBuffers, BRAND_BLUE, BRAND_GOLD } from './fonts'
import fs from 'fs'
import path from 'path'

const LOGO_PATH = path.join(process.cwd(), 'public/brand/coach-sharath-logo.png')
const SWANS_LOGO_PATH = path.join(process.cwd(), 'public/brand/5swans-logo.png')

// Convert PNG file to data URI for satori (satori can't access filesystem paths)
function pngToDataUri(filePath: string): string {
  const data = fs.readFileSync(filePath)
  return `data:image/png;base64,${data.toString('base64')}`
}

// Cached data URIs
let _logoDataUri: string | null = null
let _swansDataUri: string | null = null

function getLogoDataUri(useSwans = false): string {
  if (useSwans) {
    if (!_swansDataUri) _swansDataUri = pngToDataUri(SWANS_LOGO_PATH)
    return _swansDataUri
  }
  if (!_logoDataUri) _logoDataUri = pngToDataUri(LOGO_PATH)
  return _logoDataUri
}

export type QuoteImageProps = {
  quote:         string   // Short quote extracted by AI (max ~120 chars)
  authorName:    string   // "Coach Sharath" or business name
  pillar:        string
  useSwansLogo?: boolean  // Finance pillar posts
}

export async function generateQuoteImage(props: QuoteImageProps): Promise<Buffer> {
  const { quote, authorName, useSwansLogo } = props
  const fonts = getFontBuffers()

  // Trim quote to a reasonable display length
  const displayQuote = quote.length > 160
    ? quote.slice(0, 157) + '...'
    : quote

  const logoDataUri = getLogoDataUri(useSwansLogo)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = await (satori as any)(
    {
      type: 'div',
      props: {
        style: {
          width:           '1080px',
          height:          '1080px',
          display:         'flex',
          flexDirection:   'column',
          justifyContent:  'space-between',
          backgroundColor: BRAND_BLUE,
          padding:         '80px',
          fontFamily:      'Montserrat',
        },
        children: [
          // Top: Logo
          {
            type: 'img',
            props: {
              src:    logoDataUri,
              width:  130,
              height: 44,
              style:  { objectFit: 'contain' },
            },
          },
          // Middle: Quote block
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column', gap: '20px' },
              children: [
                // Gold quote mark
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize:   120,
                      lineHeight: 0.8,
                      color:      BRAND_GOLD,
                      fontWeight: 700,
                      marginBottom: '10px',
                    },
                    children: '“',
                  },
                },
                // Quote text
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize:   displayQuote.length > 100 ? 32 : 38,
                      fontWeight: 600,
                      color:      '#FFFFFF',
                      lineHeight: 1.45,
                    },
                    children: displayQuote,
                  },
                },
              ],
            },
          },
          // Bottom: Author + gold rule
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column', gap: '14px' },
              children: [
                // Gold rule
                {
                  type: 'div',
                  props: {
                    style: {
                      height:          '2px',
                      backgroundColor: BRAND_GOLD,
                      width:           '60px',
                    },
                  },
                },
                // Author name
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize:   18,
                      fontWeight: 600,
                      color:      BRAND_GOLD,
                      letterSpacing: '0.05em',
                    },
                    children: authorName.toUpperCase(),
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: 14,
                      color:    'rgba(168, 200, 232, 0.8)',
                    },
                    children: 'Executive Coach · coachsharath.com',
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width:  1080,
      height: 1080,
      fonts: [
        {
          name:   'Montserrat',
          data:   fonts.regular.buffer,
          weight: 400,
          style:  'normal',
        },
        {
          name:   'Montserrat',
          data:   fonts.semiBold.buffer,
          weight: 600,
          style:  'normal',
        },
        {
          name:   'Montserrat',
          data:   fonts.bold.buffer,
          weight: 700,
          style:  'normal',
        },
      ],
    }
  )

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1080 },
  })
  const png = resvg.render()
  return Buffer.from(png.asPng())
}
