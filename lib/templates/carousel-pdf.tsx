// @ts-nocheck  — react-pdf JSX types don't fully align with React's in strict mode
import React from 'react'
import {
  Document, Page, Text, View, Image, Font, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer'
import { FONT_PATHS, DARK_BG_LOGO_PATH, SWANS_LOGO_PATH, normalizeIAST } from './fonts'

Font.register({
  family: 'Montserrat',
  fonts: [
    { src: FONT_PATHS.regular,  fontWeight: 400 },
    { src: FONT_PATHS.semiBold, fontWeight: 600 },
    { src: FONT_PATHS.bold,     fontWeight: 700 },
  ],
})
Font.register({ family: 'NotoDevanagari', src: FONT_PATHS.devanagari })

// ── Canvas: exactly 1080×1080 pt (1:1 square) ──────────────────────────────
// <Page size={[SIZE, SIZE]}> sets the PDF media box.
// The root <View> inside each page uses width+height+overflow:'hidden' so that
// yoga enforces the hard 1080×1080 constraint independently of the media box —
// this prevents react-pdf from growing the page height with content.
const SIZE = 1080

// ── Design Tokens ──────────────────────────────────────────────────────────
const NAVY       = '#091e3a'   // deep navy — all slide backgrounds
const NAVY_ALT   = '#0d2d52'   // closing slide variation
const GOLD       = '#c8a04a'   // gold accent
const WHITE      = '#ffffff'
const BADGE_BORDER = '#555240' // rgba(200,160,74,0.4) on #091e3a, pre-blended

function pillarToLabel(pillar: string): string {
  switch (pillar) {
    case 'financial_intelligence':  return 'FINANCE'
    case 'vedic_leadership':        return 'VEDIC'
    case 'coaching_transformation': return 'COACHING'
    case 'banker_coach':            return 'COACHING'
    case 'inner_work':              return 'INSIGHT'
    default:                        return 'INSIGHT'
  }
}

// ── Styles ──────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  // Root View shared by every slide.
  // width + height + overflow:'hidden' = hard 1080×1080 canvas enforced by yoga.
  // <Page> provides the PDF media box; this View provides the layout constraint.
  slideCanvas: {
    minWidth:      SIZE,
    maxWidth:      SIZE,   // yoga will not grow the canvas wider than this
    minHeight:     SIZE,   // keeps cover/closing slides full height
    maxHeight:     SIZE,   // hard ceiling — yoga cannot grow beyond this
    overflow:      'hidden',
    fontFamily:    'Montserrat',
    flexDirection: 'column',
  },

  // ── Cover slide ──────────────────────────────────────────────────────────
  coverCanvas: {
    backgroundColor: NAVY,
    paddingTop:      72,
    paddingBottom:   72,
    paddingLeft:     80,
    paddingRight:    80,
  },
  logoBox: {
    alignSelf: 'flex-start',
  },
  logoImg: {
    width:     150,   // 1.5:1 box → artwork fills at 150×100, matching the article PDF scale-up
    height:    100,
    objectFit: 'contain',
  },
  // Title zone — flex:1 centres the block vertically between logo and footer
  coverTitleZone: {
    flex:           1,
    justifyContent: 'center',
  },
  coverGoldRuleTop: {
    height:          2,
    width:           40,
    backgroundColor: GOLD,
    marginBottom:    28,
  },
  coverTitle: {
    color:        WHITE,
    fontSize:     28,
    fontWeight:   700,
    lineHeight:   1.3,
    marginBottom: 12,
  },
  coverSubtitle: {
    color:        GOLD,
    fontSize:     14,
    fontWeight:   400,
    lineHeight:   1.5,
    marginBottom: 28,
  },
  coverGoldRuleBottom: {
    height:          2,
    width:           40,
    backgroundColor: GOLD,
  },
  coverFooterText: {
    color:         WHITE,
    opacity:       0.35,
    fontSize:      10,
    fontWeight:    400,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ── Content slides (2 → N-1) ─────────────────────────────────────────────
  contentCanvas: {
    backgroundColor: NAVY,
    paddingTop:      72,
    paddingBottom:   72,
    paddingLeft:     80,
    paddingRight:    80,
  },
  // Zone A — logo + badge + divider + title, pinned to top
  zoneTop: {
    flexShrink: 0,
    maxHeight:  340,   // hard ceiling so Zone A cannot push B and C out of the canvas
  },
  logoMarginBottom: {
    marginBottom: 28,
  },
  badge: {
    alignSelf:         'flex-start',
    borderWidth:       1,
    borderColor:       BADGE_BORDER,
    borderRadius:      3,
    paddingHorizontal: 10,
    paddingVertical:   4,
    marginBottom:      18,
  },
  badgeText: {
    color:         GOLD,
    fontSize:      10,
    fontWeight:    600,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  goldDivider: {
    height:          2,
    width:           40,
    backgroundColor: GOLD,
    marginBottom:    20,
  },
  // Slide title — weight 400, intentionally not bold
  slideTitle: {
    color:      WHITE,
    fontSize:   20,
    fontWeight: 400,
    lineHeight: 1.35,
  },
  // Zone B — body copy, fills remaining height and centres content
  zoneMiddle: {
    flex:           1,
    justifyContent: 'center',
  },
  bodyLine: {
    color:      WHITE,
    opacity:    0.72,
    fontSize:   14,
    fontWeight: 400,
    lineHeight: 1.7,
  },
  // Zone C — footer row, pinned to bottom
  zoneBottom: {
    flexShrink:     0,
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  footerUrl: {
    color:         WHITE,
    opacity:       0.35,
    fontSize:      10,
    fontWeight:    400,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  footerPageNum: {
    color:      WHITE,
    opacity:    0.35,
    fontSize:   11,
    fontWeight: 400,
  },

  // ── Closing slide ─────────────────────────────────────────────────────────
  closingCanvas: {
    backgroundColor: NAVY_ALT,
    paddingTop:      80,
    paddingBottom:   80,
    paddingLeft:     80,
    paddingRight:    80,
    justifyContent:  'center',
    alignItems:      'center',
  },
  closingQuestion: {
    color:        WHITE,
    fontSize:     36,
    fontWeight:   400,
    lineHeight:   1.45,
    textAlign:    'center',
    marginBottom: 32,
  },
  closingGoldRule: {
    height:          2,
    width:           60,
    backgroundColor: GOLD,
    marginBottom:    32,
  },
  closingFollow: {
    color:         WHITE,
    opacity:       0.35,
    fontSize:      11,
    fontWeight:    400,
    textAlign:     'center',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom:  10,
  },
  closingSub: {
    color:        GOLD,
    fontSize:     14,
    fontWeight:   400,
    textAlign:    'center',
    marginBottom: 44,
  },
  closingLogoBox: {
    alignSelf: 'center',
  },
  closingLogoImg: {
    width:     160,
    height:    107,  // 1.5:1 ratio — artwork fills the box
    objectFit: 'contain',
  },
})

export type CarouselSlide = {
  headline: string
  body:     string
}

export type CarouselPDFProps = {
  theme:         string
  titleSlide:    string
  slides:        CarouselSlide[]   // last item is the closing slide
  pillar:        string
  seriesLabel?:  string            // e.g. "TAX", "STEP", "INSIGHT" — from AI SERIES_LABEL
  seriesCount?:  number            // from AI SERIES_COUNT — authoritative content slide count
  quarter?:      string            // retained for API compat, not rendered
  weekNumber?:   number            // retained for API compat, not rendered
  useSwansLogo?: boolean
}

function CarouselDocument({ theme, titleSlide, slides, pillar, seriesLabel, seriesCount, useSwansLogo }: CarouselPDFProps) {
  const logoSrc       = useSwansLogo ? SWANS_LOGO_PATH : DARK_BG_LOGO_PATH
  // Badge label: from AI SERIES_LABEL, else pillar fallback
  const label         = (seriesLabel ?? pillarToLabel(pillar)).toUpperCase()
  const contentSlides = slides.slice(0, -1)   // everything except the closing slide
  const closingSlide  = slides.length > 0 ? slides[slides.length - 1] : null
  // Badge total: use AI's committed SERIES_COUNT; fall back to actual parsed count
  const totalInsights = seriesCount ?? contentSlides.length

  return (
    <Document title={theme} author="Coach Sharath">

      {/* ── Cover slide ─────────────────────────────────────────────────── */}
      {/* <Page> sets PDF media box; wrap={false} on inner <View> prevents react-pdf
          from flowing content onto additional pages, keeping each slide exactly 1080×1080. */}
      <Page size={[SIZE, SIZE]} style={{ width: SIZE, height: SIZE }}>
        <View style={[S.slideCanvas, S.coverCanvas]} wrap={false}>

          {/* Zone A — logo */}
          <View style={[S.logoBox, S.logoMarginBottom]}>
            <Image src={logoSrc} style={S.logoImg} />
          </View>

          {/* Zone B — title block centred vertically */}
          <View style={S.coverTitleZone}>
            <View style={S.coverGoldRuleTop} />
            <Text style={S.coverTitle}>{normalizeIAST(titleSlide)}</Text>
            <Text style={S.coverSubtitle}>{normalizeIAST(theme)}</Text>
            <View style={S.coverGoldRuleBottom} />
          </View>

          {/* Zone C — muted footer */}
          <Text style={S.coverFooterText}>
            Executive &amp; Life Coaching · coachsharath.com
          </Text>

        </View>
      </Page>

      {/* ── Content slides ─────────────────────────────────────────────────── */}
      {contentSlides.map((slide, i) => {
        const insightNum = i + 1   // 1-indexed; cover and closing not counted

        const bodyLines = slide.body
          .split('\n')
          .map(l => l.replace(/^[-•*\d.]\s*/, '').trim())
          .filter(l => l.length > 0)
          .slice(0, 2)   // hard cap: max 2 lines

        return (
          <Page key={i} size={[SIZE, SIZE]} style={{ width: SIZE, height: SIZE }}>
            <View style={[S.slideCanvas, S.contentCanvas]} wrap={false}>

              {/* Zone A — logo + badge + divider + title */}
              <View style={S.zoneTop}>
                <View style={[S.logoBox, S.logoMarginBottom]}>
                  <Image src={logoSrc} style={S.logoImg} />
                </View>
                <View style={S.badge}>
                  <Text style={S.badgeText}>
                    {label} {insightNum} OF {totalInsights}
                  </Text>
                </View>
                <View style={S.goldDivider} />
                <Text style={S.slideTitle}>{normalizeIAST(slide.headline)}</Text>
              </View>

              {/* Zone B — body copy, vertically centred */}
              <View style={S.zoneMiddle}>
                {bodyLines.map((line, j) => (
                  <Text key={j} style={S.bodyLine}>{normalizeIAST(line)}</Text>
                ))}
              </View>

              {/* Zone C — footer row */}
              <View style={S.zoneBottom}>
                <Text style={S.footerUrl}>coachsharath.com</Text>
                <Text style={S.footerPageNum}>{insightNum} / {totalInsights}</Text>
              </View>

            </View>
          </Page>
        )
      })}

      {/* ── Closing slide ─────────────────────────────────────────────────── */}
      {closingSlide && (
        <Page size={[SIZE, SIZE]} style={{ width: SIZE, height: SIZE }}>
          <View style={[S.slideCanvas, S.closingCanvas]} wrap={false}>
            <Text style={S.closingQuestion}>
              {normalizeIAST(closingSlide.headline)}
            </Text>
            <View style={S.closingGoldRule} />
            <Text style={S.closingFollow}>Follow Coach Sharath</Text>
            <Text style={S.closingSub}>
              Executive coaching · Vedic wisdom · Financial intelligence
            </Text>
            <View style={S.closingLogoBox}>
              <Image src={logoSrc} style={S.closingLogoImg} />
            </View>
          </View>
        </Page>
      )}

    </Document>
  )
}

// ── Parse carousel content from structured LLM output ─────────────────────
export function parseCarouselSlides(content: string): { titleSlide: string; slides: CarouselSlide[] } {
  const lines = content.split('\n')
  const slides: CarouselSlide[] = []
  let titleSlide = ''
  let currentHeadline = ''
  let currentBodyLines: string[] = []

  function flushSlide() {
    if (!currentHeadline) return
    if (slides.length === 0 && !titleSlide) titleSlide = currentHeadline
    slides.push({ headline: currentHeadline, body: currentBodyLines.join('\n') })
    currentHeadline = ''
    currentBodyLines = []
  }

  for (const line of lines) {
    if (line.match(/^(WORD_COUNT|CORE_INSIGHT|CALLBACK_USED|THREAD_PLANTED|REFERENCES|HASHTAGS|LINKEDIN_CAPTION|QUOTE|SERIES_LABEL|SERIES_COUNT|CONTENT_PLAN):/)) continue

    // (.*)  not (.+) — BODY may be empty on the closing slide
    const singleLine = line.match(/^SLIDE\s*\d+\s*\|\s*HEADLINE:\s*(.+?)\s*\|\s*BODY:\s*(.*)/i)
    if (singleLine) {
      flushSlide()
      currentHeadline = singleLine[1].trim()
      const bodyText = singleLine[2].trim()
      currentBodyLines = bodyText ? [bodyText] : []
      continue
    }

    const headlineOnly = line.match(/^(?:SLIDE\s*\d+\s*\|?\s*)?HEADLINE:\s*(.+)/i)
    if (headlineOnly) {
      flushSlide()
      // Strip trailing "| BODY:" suffix that the AI emits when body is empty
      currentHeadline = headlineOnly[1].replace(/\s*\|\s*BODY:.*$/i, '').trim()
      continue
    }

    const bodyOnly = line.match(/^BODY:\s*(.+)/i)
    if (bodyOnly) { currentBodyLines.push(bodyOnly[1].trim()); continue }

    const slideStart = line.match(/^(?:#{1,3}|SLIDE\s*\d+)\s*[:|]\s*/i)
    if (slideStart) { flushSlide(); currentHeadline = line.replace(slideStart[0], '').trim(); continue }

    if (currentHeadline && line.trim()) currentBodyLines.push(line.trim())
  }
  flushSlide()

  if (!titleSlide && slides.length > 0) titleSlide = slides[0].headline
  return { titleSlide, slides: slides.slice(1) }
}

export async function generateCarouselPDF(props: CarouselPDFProps): Promise<Buffer> {
  return renderToBuffer(<CarouselDocument {...props} />) as Promise<Buffer>
}
