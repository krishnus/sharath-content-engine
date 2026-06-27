// @ts-nocheck  — react-pdf JSX types don't fully align with React's in strict mode
import React from 'react'
import {
  Document, Page, Text, View, Image, Font, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer'
import { FONT_PATHS, LOGO_PATH, SWANS_LOGO_PATH, normalizeIAST } from './fonts'

Font.register({
  family: 'Montserrat',
  fonts: [
    { src: FONT_PATHS.regular,  fontWeight: 400 },
    { src: FONT_PATHS.semiBold, fontWeight: 600 },
    { src: FONT_PATHS.bold,     fontWeight: 700 },
  ],
})
Font.register({ family: 'NotoDevanagari', src: FONT_PATHS.devanagari })

// ── Canvas: must be exactly 1080×1080 (1:1 square) ─────────────────────────
const SIZE = 1080

// ── Design Tokens ──────────────────────────────────────────────────────────
const NAVY     = '#091e3a'   // deep navy — primary background (all slides)
const NAVY_ALT = '#0d2d52'   // closing slide variation
const GOLD     = '#c8a04a'   // gold accent
const WHITE    = '#ffffff'

// Pre-blended hex for rgba(200,160,74,0.4) on #091e3a — used for badge border
const BADGE_BORDER = '#555240'

// ── Pillar → badge label ───────────────────────────────────────────────────
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

// ── Shared page base — enforces 1080×1080 hard ─────────────────────────────
// overflow: 'hidden' clips any content that exceeds the canvas;
// wrap={false} on <Page> prevents react-pdf from growing the page height.
const pageBase = {
  width:      SIZE,
  height:     SIZE,
  fontFamily: 'Montserrat',
  overflow:   'hidden' as const,
}

const S = StyleSheet.create({
  // ── Cover slide ──────────────────────────────────────────────────────────
  // Three-zone layout (logo / title block / footer), distributed via flex.
  coverPage: {
    ...pageBase,
    backgroundColor: NAVY,
    flexDirection:   'column',
    paddingTop:      72,
    paddingBottom:   72,
    paddingLeft:     80,
    paddingRight:    80,
  },
  // Logo container — white box so logo reads on dark
  logoBox: {
    backgroundColor:   WHITE,
    borderRadius:      4,
    paddingHorizontal: 8,
    paddingVertical:   4,
    alignSelf:         'flex-start',
  },
  logoImg: {
    width:     110,
    height:    36,
    objectFit: 'contain',
  },
  // Title block — vertically centred in the flex-1 middle zone
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
  // Cover footer — muted text bottom left (Zone C)
  coverFooterText: {
    color:         WHITE,
    opacity:       0.35,
    fontSize:      10,
    fontWeight:    400,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop:     0,
  },

  // ── Content slides (slides 2 to N-1) ────────────────────────────────────
  // Strict three-zone column layout fills the full 1080×1080 canvas.
  contentPage: {
    ...pageBase,
    backgroundColor: NAVY,
    flexDirection:   'column',
    paddingTop:      72,
    paddingBottom:   72,
    paddingLeft:     80,
    paddingRight:    80,
  },
  // Zone A (top) — logo, badge, divider, title — never grows
  zoneTop: {
    flexShrink: 0,
  },
  // Logo sits at the very top of Zone A
  logoMargin: {
    marginBottom: 28,
  },
  // Sequence badge: e.g. "COACHING 3 OF 10"
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
  // Gold divider — 40pt wide, 2pt height
  goldDivider: {
    height:          2,
    width:           40,
    backgroundColor: GOLD,
    marginBottom:    20,
  },
  // Slide title — weight 400 (intentionally NOT bold)
  slideTitle: {
    color:      WHITE,
    fontSize:   20,
    fontWeight: 400,
    lineHeight: 1.35,
  },
  // Zone B (middle) — body copy, vertically centred in the remaining space
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
  // Zone C (bottom) — URL left, slide count right
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
  closingPage: {
    ...pageBase,
    backgroundColor: NAVY_ALT,
    flexDirection:   'column',
    justifyContent:  'center',
    alignItems:      'center',
    paddingTop:      80,
    paddingBottom:   80,
    paddingLeft:     80,
    paddingRight:    80,
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
    backgroundColor:   WHITE,
    borderRadius:      4,
    paddingHorizontal: 10,
    paddingVertical:   6,
  },
  closingLogoImg: {
    width:     120,
    height:    40,
    objectFit: 'contain',
  },
})

export type CarouselSlide = {
  headline: string
  body:     string
}

export type CarouselPDFProps = {
  theme:         string
  titleSlide:    string           // Hook / title for the cover slide
  slides:        CarouselSlide[]  // Content slides (last item = closing slide)
  pillar:        string
  quarter?:      string           // Retained for API compat; no longer rendered
  weekNumber?:   number           // Retained for API compat; no longer rendered
  useSwansLogo?: boolean
}

function CarouselDocument({ theme, titleSlide, slides, pillar, useSwansLogo }: CarouselPDFProps) {
  const logoSrc     = useSwansLogo ? SWANS_LOGO_PATH : LOGO_PATH
  const label       = pillarToLabel(pillar)
  const totalSlides = slides.length + 1   // cover (1) + all content slides including closing
  const contentSlides = slides.slice(0, -1)
  const closingSlide  = slides.length > 0 ? slides[slides.length - 1] : null

  return (
    <Document title={theme} author="Coach Sharath">

      {/* ── Cover slide — wrap={false} locks canvas to exactly 1080×1080 ── */}
      <Page size={[SIZE, SIZE]} style={S.coverPage} wrap={false}>
        {/* Zone A — logo */}
        <View style={S.logoBox}>
          <Image src={logoSrc} style={S.logoImg} />
        </View>

        {/* Zone B — title block, vertically centred */}
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
      </Page>

      {/* ── Content slides ─────────────────────────────────────────────────── */}
      {contentSlides.map((slide, i) => {
        const slideNum = i + 2   // cover = 1, content starts at 2

        // Strip any leading bullet/number prefix the AI may have included in body
        const bodyLines = slide.body
          .split('\n')
          .map(l => l.replace(/^[-•*\d.]\s*/, '').trim())
          .filter(l => l.length > 0)
          .slice(0, 2)   // hard cap: max 2 lines

        return (
          <Page key={i} size={[SIZE, SIZE]} style={S.contentPage} wrap={false}>

            {/* ── Zone A (top) — logo + badge + divider + title ── */}
            <View style={S.zoneTop}>
              <View style={[S.logoBox, S.logoMargin]}>
                <Image src={logoSrc} style={S.logoImg} />
              </View>

              <View style={S.badge}>
                <Text style={S.badgeText}>
                  {label} {slideNum} OF {totalSlides}
                </Text>
              </View>

              <View style={S.goldDivider} />

              <Text style={S.slideTitle}>{normalizeIAST(slide.headline)}</Text>
            </View>

            {/* ── Zone B (middle) — body copy, vertically centred ── */}
            <View style={S.zoneMiddle}>
              {bodyLines.map((line, j) => (
                <Text key={j} style={S.bodyLine}>{normalizeIAST(line)}</Text>
              ))}
            </View>

            {/* ── Zone C (bottom) — footer row ── */}
            <View style={S.zoneBottom}>
              <Text style={S.footerUrl}>coachsharath.com</Text>
              <Text style={S.footerPageNum}>{slideNum} / {totalSlides}</Text>
            </View>

          </Page>
        )
      })}

      {/* ── Closing slide ─────────────────────────────────────────────────── */}
      {closingSlide && (
        <Page size={[SIZE, SIZE]} style={S.closingPage} wrap={false}>
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
        </Page>
      )}

    </Document>
  )
}

// ── Parse carousel content from structured LLM output ─────────────────────
// Expects format: "SLIDE N | HEADLINE: ... | BODY: ..."
export function parseCarouselSlides(content: string): { titleSlide: string; slides: CarouselSlide[] } {
  const lines = content.split('\n')
  const slides: CarouselSlide[] = []
  let titleSlide = ''
  let currentHeadline = ''
  let currentBodyLines: string[] = []

  function flushSlide() {
    if (!currentHeadline) return
    if (slides.length === 0 && !titleSlide) {
      titleSlide = currentHeadline
    }
    slides.push({ headline: currentHeadline, body: currentBodyLines.join('\n') })
    currentHeadline = ''
    currentBodyLines = []
  }

  for (const line of lines) {
    if (line.match(/^(WORD_COUNT|CORE_INSIGHT|CALLBACK_USED|THREAD_PLANTED|REFERENCES|HASHTAGS|LINKEDIN_CAPTION|QUOTE):/)) {
      continue
    }

    // Single-line: "SLIDE N | HEADLINE: title | BODY: body"
    const singleLine = line.match(/^SLIDE\s*\d+\s*\|\s*HEADLINE:\s*(.+?)\s*\|\s*BODY:\s*(.+)/i)
    if (singleLine) {
      flushSlide()
      currentHeadline = singleLine[1].trim()
      currentBodyLines = [singleLine[2].trim()]
      continue
    }

    // Multi-line: "HEADLINE: title" on its own line
    const headlineOnly = line.match(/^(?:SLIDE\s*\d+\s*\|?\s*)?HEADLINE:\s*(.+)/i)
    if (headlineOnly) {
      flushSlide()
      currentHeadline = headlineOnly[1].trim()
      continue
    }

    // Multi-line: "BODY: text" on its own line
    const bodyOnly = line.match(/^BODY:\s*(.+)/i)
    if (bodyOnly) {
      currentBodyLines.push(bodyOnly[1].trim())
      continue
    }

    // Fallback: markdown heading or "SLIDE N:" style
    const slideStart = line.match(/^(?:#{1,3}|SLIDE\s*\d+)\s*[:|]\s*/i)
    if (slideStart) {
      flushSlide()
      currentHeadline = line.replace(slideStart[0], '').trim()
      continue
    }

    // Continuation body line
    if (currentHeadline && line.trim()) {
      currentBodyLines.push(line.trim())
    }
  }
  flushSlide()

  if (!titleSlide && slides.length > 0) titleSlide = slides[0].headline
  return { titleSlide, slides: slides.slice(1) }  // first slide = cover, rest are content
}

export async function generateCarouselPDF(props: CarouselPDFProps): Promise<Buffer> {
  return renderToBuffer(<CarouselDocument {...props} />) as Promise<Buffer>
}
