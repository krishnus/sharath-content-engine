// @ts-nocheck  — react-pdf JSX types don't fully align with React's in strict mode
import React from 'react'
import {
  Document, Page, Text, View, Image, Font, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer'
import { BRAND_BLUE, BRAND_GOLD, FONT_PATHS, LOGO_PATH, SWANS_LOGO_PATH, normalizeIAST } from './fonts'

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

// Footer text colours — same as article PDF footer
const FOOTER_NAME_COLOR = BRAND_GOLD    // "Executive & Life Coaching"
const FOOTER_SUB_COLOR  = '#A8C8E8'     // "coachsharath.com"

const S = StyleSheet.create({
  // ── Title slide (slide 1) ────────────────────────────────────────────
  titlePage: {
    width:           SIZE,
    height:          SIZE,
    fontFamily:      'Montserrat',
    backgroundColor: BRAND_BLUE,
    flexDirection:   'column',
  },
  // Logo section at the top
  titleLogoArea: {
    paddingHorizontal: 80,
    paddingTop:        60,
    paddingBottom:     0,
  },
  logoBox: {
    backgroundColor:   '#FFFFFF',
    borderRadius:      4,
    paddingHorizontal: 8,
    paddingVertical:   4,
    alignSelf:         'flex-start',
  },
  logoOnDark: {
    width:     120,
    height:    40,
    objectFit: 'contain',
  },
  // Vertically centered content zone between logo and footer
  titleCenter: {
    flex:            1,
    paddingHorizontal: 80,
    justifyContent:  'center',
  },
  // Gold rule — spans the full content width (top and bottom of text block)
  titleGoldRule: {
    height:          3,
    backgroundColor: BRAND_GOLD,
  },
  // Padding + text between the two gold rules
  titleContent: {
    paddingVertical: 44,
    alignItems:      'center',
  },
  titleText: {
    color:        '#FFFFFF',
    fontSize:     52,
    fontWeight:   700,
    lineHeight:   1.25,
    marginBottom: 24,
    textAlign:    'center',
  },
  titleSub: {
    color:      BRAND_GOLD,
    fontSize:   24,
    fontWeight: 600,
    textAlign:  'center',
  },
  // Separator between content area and footer on the title slide
  titleFooterSep: {
    height:          1,
    backgroundColor: BRAND_GOLD,
    opacity:         0.4,
    marginHorizontal: 80,
  },
  // Footer text area on title slide (page already blue — no extra background)
  titleFooterText: {
    paddingHorizontal: 80,
    paddingTop:        16,
    paddingBottom:     28,
  },

  // ── Shared footer text styles ────────────────────────────────────────
  footerName: {
    color:        FOOTER_NAME_COLOR,
    fontSize:     15,
    fontWeight:   600,
    marginBottom: 5,
  },
  footerSub: {
    color:    FOOTER_SUB_COLOR,
    fontSize: 12,
  },

  // ── Content slide (slides 2+) ─────────────────────────────────────────
  contentPage: {
    width:           SIZE,
    height:          SIZE,
    fontFamily:      'Montserrat',
    backgroundColor: '#FFFFFF',
    flexDirection:   'column',
  },
  // Header: blue band, full headline at full width (no badge)
  contentHeader: {
    backgroundColor:   BRAND_BLUE,
    paddingHorizontal: 60,
    paddingTop:        40,
    paddingBottom:     40,
  },
  slideHeadline: {
    color:      '#FFFFFF',
    fontSize:   30,
    fontWeight: 700,
    lineHeight: 1.3,
  },
  // Body: grows to fill remaining space
  contentBody: {
    flex:              1,
    paddingHorizontal: 60,
    paddingTop:        44,
    paddingBottom:     36,
  },
  // Footer: blue strip matching article PDF
  contentFooterStrip: {
    backgroundColor:   BRAND_BLUE,
    paddingHorizontal: 60,
    paddingTop:        18,
    paddingBottom:     24,
  },

  // ── CTA slide (last) ─────────────────────────────────────────────────
  ctaPage: {
    width:           SIZE,
    height:          SIZE,
    fontFamily:      'Montserrat',
    backgroundColor: BRAND_BLUE,
    flexDirection:   'column',
    justifyContent:  'center',
    alignItems:      'center',
    padding:         80,
  },
  ctaGoldRule: {
    height:          2,
    backgroundColor: BRAND_GOLD,
    width:           60,
    marginBottom:    30,
  },
  ctaHeadline: {
    color:        '#FFFFFF',
    fontSize:     28,
    fontWeight:   700,
    textAlign:    'center',
    marginBottom: 16,
  },
  ctaSub: {
    color:        BRAND_GOLD,
    fontSize:     16,
    fontWeight:   600,
    textAlign:    'center',
    marginBottom: 40,
  },
  ctaLogoLg: {
    width:     140,
    height:    46,
    objectFit: 'contain',
  },
})

export type CarouselSlide = {
  headline: string
  body:     string
}

export type CarouselPDFProps = {
  theme:        string
  titleSlide:   string           // Hook / title for slide 1
  slides:       CarouselSlide[]  // Content slides
  pillar:       string
  quarter?:     string           // Retained for API compat; no longer rendered
  weekNumber?:  number           // Retained for API compat; no longer rendered
  useSwansLogo?: boolean         // Finance pillar
}

// ── Dynamic font sizing based on content density ───────────────────────────
function calcFontMetrics(text: string): { fontSize: number; lineHeight: number; bulletGap: number } {
  const lines = text.split('\n').filter(l => l.trim())
  // Bullet items take ~20% more vertical space due to bullet glyph height
  const weighted = lines.reduce((sum, line) => sum + (/^[-•]\s/.test(line) ? 1.2 : 1.0), 0)
  if (weighted <= 3)  return { fontSize: 32, lineHeight: 1.45, bulletGap: 20 }
  if (weighted <= 5)  return { fontSize: 28, lineHeight: 1.5,  bulletGap: 16 }
  if (weighted <= 7)  return { fontSize: 24, lineHeight: 1.55, bulletGap: 12 }
  if (weighted <= 9)  return { fontSize: 20, lineHeight: 1.6,  bulletGap: 10 }
  if (weighted <= 12) return { fontSize: 18, lineHeight: 1.65, bulletGap: 8  }
  return                     { fontSize: 16, lineHeight: 1.7,  bulletGap: 6  }
}

function CarouselDocument({ theme, titleSlide, slides, useSwansLogo }: CarouselPDFProps) {
  const logoSrc = useSwansLogo ? SWANS_LOGO_PATH : LOGO_PATH

  function renderBodyLines(text: string, slideIndex: number) {
    const { fontSize, lineHeight, bulletGap } = calcFontMetrics(text)
    const lines = text.split('\n').filter(l => l.trim())
    return lines.map((line, i) => {
      if (/^[-•]\s/.test(line)) {
        return (
          <View key={`${slideIndex}-${i}`} style={{ flexDirection: 'row', marginBottom: bulletGap }}>
            <Text style={{ color: BRAND_GOLD, fontWeight: 700, fontSize: fontSize + 2, marginRight: 14, lineHeight }}>
              •
            </Text>
            <Text style={{ flex: 1, fontSize, lineHeight, color: '#1A1A1A', fontFamily: 'Montserrat' }}>
              {normalizeIAST(line.replace(/^[-•]\s/, ''))}
            </Text>
          </View>
        )
      }
      return (
        <Text
          key={`${slideIndex}-${i}`}
          style={{ fontSize, lineHeight, color: '#1A1A1A', marginBottom: bulletGap * 0.5, fontFamily: 'Montserrat' }}
        >
          {normalizeIAST(line)}
        </Text>
      )
    })
  }

  // Shared footer text (shown on all slide types)
  function FooterText() {
    return (
      <>
        <Text style={S.footerName}>Executive &amp; Life Coaching</Text>
        <Text style={S.footerSub}>coachsharath.com</Text>
      </>
    )
  }

  return (
    <Document title={theme} author="Coach Sharath">

      {/* Slide 1 — Title */}
      <Page size={[SIZE, SIZE]} style={S.titlePage}>
        {/* Logo */}
        <View style={S.titleLogoArea}>
          <View style={S.logoBox}>
            <Image src={logoSrc} style={S.logoOnDark} />
          </View>
        </View>

        {/* Title + subtitle sandwiched between two gold rules — vertically centered */}
        <View style={S.titleCenter}>
          <View style={S.titleGoldRule} />
          <View style={S.titleContent}>
            <Text style={S.titleText}>{normalizeIAST(titleSlide)}</Text>
            <Text style={S.titleSub}>{normalizeIAST(theme)}</Text>
          </View>
          <View style={S.titleGoldRule} />
        </View>

        {/* Footer — gold separator + brand text (page is already blue) */}
        <View style={S.titleFooterSep} />
        <View style={S.titleFooterText}>
          <FooterText />
        </View>
      </Page>

      {/* Content slides */}
      {slides.map((slide, i) => (
        <Page key={i} size={[SIZE, SIZE]} style={S.contentPage}>
          {/* Header — full-width headline, no badge */}
          <View style={S.contentHeader}>
            <Text style={S.slideHeadline}>{normalizeIAST(slide.headline)}</Text>
          </View>

          {/* Body — dynamic font size fills available space */}
          <View style={S.contentBody}>
            {renderBodyLines(slide.body, i)}
          </View>

          {/* Footer — blue strip */}
          <View style={S.contentFooterStrip}>
            <FooterText />
          </View>
        </Page>
      ))}

      {/* CTA slide */}
      <Page size={[SIZE, SIZE]} style={S.ctaPage}>
        <View style={S.ctaGoldRule} />
        <Text style={S.ctaHeadline}>Follow for weekly insights</Text>
        <Text style={S.ctaSub}>Executive coaching · Vedic wisdom · Financial intelligence</Text>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Image src={logoSrc} style={S.ctaLogoLg} />
        </View>
      </Page>

    </Document>
  )
}

// ── Parse carousel content from structured LLM output ─────────────────────
// Expects format: "SLIDE N | HEADLINE: ... BODY: ..."
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

    // Single-line format: "SLIDE N | HEADLINE: title | BODY: body text"
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
  return { titleSlide, slides: slides.slice(1) }  // first slide is title, rest are content
}

export async function generateCarouselPDF(props: CarouselPDFProps): Promise<Buffer> {
  return renderToBuffer(<CarouselDocument {...props} />) as Promise<Buffer>
}
