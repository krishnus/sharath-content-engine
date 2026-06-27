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

// 1080×1080 pt square (LinkedIn carousel optimal size)
const SIZE = 1080

// ── Design Tokens ──────────────────────────────────────────────────────────
const NAVY     = '#091e3a'   // deep navy — primary background (all slides)
const NAVY_ALT = '#0d2d52'   // slightly lighter navy — closing slide variation
const GOLD     = '#c8a04a'   // gold accent
const WHITE    = '#ffffff'

// Pre-blended hex equivalents of rgba on navy background.
// Used for border color where element-level opacity would bleed into children.
// rgba(200,160,74,0.4) on #091e3a → #555240
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

const S = StyleSheet.create({
  // ── Cover slide ──────────────────────────────────────────────────────────
  coverPage: {
    width:           SIZE,
    height:          SIZE,
    fontFamily:      'Montserrat',
    backgroundColor: NAVY,
    flexDirection:   'column',
  },
  coverLogoArea: {
    paddingHorizontal: 64,
    paddingTop:        64,
  },
  // Logo container — white box so logo reads on dark background
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
  // Content block — vertically centered between logo and cover footer
  coverCenter: {
    flex:              1,
    paddingHorizontal: 64,
    justifyContent:    'center',
  },
  // Gold rule — 40pt wide, 2pt height (above title block)
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
    color:      GOLD,
    fontSize:   14,
    fontWeight: 400,
    lineHeight: 1.5,
    marginBottom: 28,
  },
  // Gold rule — below subtitle
  coverGoldRuleBottom: {
    height:          2,
    width:           40,
    backgroundColor: GOLD,
  },
  // Cover footer — muted text bottom left
  coverFooterArea: {
    paddingHorizontal: 64,
    paddingBottom:     44,
  },
  coverFooterText: {
    color:         WHITE,
    opacity:       0.35,
    fontSize:      10,
    fontWeight:    400,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ── Content slides (slides 2 to N-1) ────────────────────────────────────
  contentPage: {
    width:           SIZE,
    height:          SIZE,
    fontFamily:      'Montserrat',
    backgroundColor: NAVY,
    flexDirection:   'column',
  },
  contentLogoRow: {
    paddingHorizontal: 60,
    paddingTop:        52,
    paddingBottom:     28,
  },
  // Sequence label badge: e.g. "COACHING 3 OF 10"
  badgeWrapper: {
    paddingHorizontal: 60,
    marginBottom:      18,
  },
  badge: {
    alignSelf:         'flex-start',
    borderWidth:       1,
    borderColor:       BADGE_BORDER,
    borderRadius:      3,
    paddingHorizontal: 10,
    paddingVertical:   4,
  },
  badgeText: {
    color:         GOLD,
    fontSize:      10,
    fontWeight:    600,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  // Gold divider — 40pt wide, 2pt height — between badge and slide title
  goldDivider: {
    height:          2,
    width:           40,
    backgroundColor: GOLD,
    marginLeft:      60,
    marginBottom:    24,
  },
  // Slide title — weight 400 (intentionally not bold, never 700)
  slideTitle: {
    color:             WHITE,
    fontSize:          20,
    fontWeight:        400,
    lineHeight:        1.35,
    paddingHorizontal: 60,
    marginBottom:      26,
  },
  // Body copy zone — fills space, max 3 lines rendered
  bodyZone: {
    flex:              1,
    paddingHorizontal: 60,
  },
  bodyLine: {
    color:      WHITE,
    opacity:    0.72,
    fontSize:   14,
    fontWeight: 400,
    lineHeight: 1.7,
  },
  // Footer row — URL left, slide count right
  contentFooterRow: {
    paddingHorizontal: 60,
    paddingBottom:     46,
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
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

  // ── Closing slide (reflection question + follow prompt) ──────────────────
  closingPage: {
    width:             SIZE,
    height:            SIZE,
    fontFamily:        'Montserrat',
    backgroundColor:   NAVY_ALT,
    flexDirection:     'column',
    justifyContent:    'center',
    alignItems:        'center',
    paddingHorizontal: 80,
    paddingVertical:   80,
  },
  closingQuestion: {
    color:        WHITE,
    fontSize:     22,
    fontWeight:   400,
    lineHeight:   1.55,
    textAlign:    'center',
    marginBottom: 40,
  },
  closingGoldRule: {
    height:          2,
    width:           40,
    backgroundColor: GOLD,
    marginBottom:    30,
  },
  closingFollow: {
    color:         WHITE,
    opacity:       0.35,
    fontSize:      11,
    fontWeight:    400,
    textAlign:     'center',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom:  8,
  },
  closingSub: {
    color:        GOLD,
    fontSize:     12,
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
  useSwansLogo?: boolean          // Finance pillar
}

function CarouselDocument({ theme, titleSlide, slides, pillar, useSwansLogo }: CarouselPDFProps) {
  const logoSrc     = useSwansLogo ? SWANS_LOGO_PATH : LOGO_PATH
  const label       = pillarToLabel(pillar)

  // Cover is slide 1. All slides[] items are 2 onwards.
  const totalSlides  = slides.length + 1
  // Content slides: everything except the last (closing) slide
  const contentSlides = slides.slice(0, -1)
  // Closing slide: last item — rendered as reflection + follow prompt
  const closingSlide  = slides.length > 0 ? slides[slides.length - 1] : null

  return (
    <Document title={theme} author="Coach Sharath">

      {/* ── Cover slide ─────────────────────────────────────────────────── */}
      <Page size={[SIZE, SIZE]} style={S.coverPage}>
        {/* Logo — top left */}
        <View style={S.coverLogoArea}>
          <View style={S.logoBox}>
            <Image src={logoSrc} style={S.logoImg} />
          </View>
        </View>

        {/* Title block — vertically centred, sandwiched between two gold rules */}
        <View style={S.coverCenter}>
          <View style={S.coverGoldRuleTop} />
          <Text style={S.coverTitle}>{normalizeIAST(titleSlide)}</Text>
          <Text style={S.coverSubtitle}>{normalizeIAST(theme)}</Text>
          <View style={S.coverGoldRuleBottom} />
        </View>

        {/* Footer — muted, bottom left */}
        <View style={S.coverFooterArea}>
          <Text style={S.coverFooterText}>
            Executive &amp; Life Coaching · coachsharath.com
          </Text>
        </View>
      </Page>

      {/* ── Content slides ────────────────────────────────────────────────── */}
      {contentSlides.map((slide, i) => {
        const slideNum = i + 2  // cover = 1, content starts at 2
        return (
          <Page key={i} size={[SIZE, SIZE]} style={S.contentPage}>
            {/* Logo — top left */}
            <View style={S.contentLogoRow}>
              <View style={S.logoBox}>
                <Image src={logoSrc} style={S.logoImg} />
              </View>
            </View>

            {/* Sequence badge: e.g. "VEDIC 3 OF 10" */}
            <View style={S.badgeWrapper}>
              <View style={S.badge}>
                <Text style={S.badgeText}>
                  {label} {slideNum} OF {totalSlides}
                </Text>
              </View>
            </View>

            {/* Gold divider */}
            <View style={S.goldDivider} />

            {/* Slide title — never bold */}
            <Text style={S.slideTitle}>{normalizeIAST(slide.headline)}</Text>

            {/* Body copy — max 3 lines, no bullets */}
            <View style={S.bodyZone}>
              {slide.body
                .split('\n')
                .map(l => l.replace(/^[-•*\d.]\s*/, '').trim())
                .filter(l => l.length > 0)
                .slice(0, 3)
                .map((line, j) => (
                  <Text key={j} style={S.bodyLine}>{normalizeIAST(line)}</Text>
                ))}
            </View>

            {/* Footer row — URL left, slide count right */}
            <View style={S.contentFooterRow}>
              <Text style={S.footerUrl}>coachsharath.com</Text>
              <Text style={S.footerPageNum}>{slideNum} / {totalSlides}</Text>
            </View>
          </Page>
        )
      })}

      {/* ── Closing slide ─────────────────────────────────────────────────── */}
      {closingSlide && (
        <Page size={[SIZE, SIZE]} style={S.closingPage}>
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
