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

const S = StyleSheet.create({
  page: {
    width:      SIZE,
    height:     SIZE,
    fontFamily: 'Montserrat',
  },
  // ── Title slide (slide 1) ─────────────────────────────────────────────
  titlePage: {
    flex:            1,
    backgroundColor: BRAND_BLUE,
    padding:         80,
    justifyContent:  'space-between',
  },
  logoBox: {
    backgroundColor:  '#FFFFFF',
    borderRadius:     4,
    paddingHorizontal: 8,
    paddingVertical:  4,
    alignSelf:        'flex-start',
  },
  logoOnDark: {
    width:  120,
    height: 40,
    objectFit: 'contain',
  },
  titleGoldRule: {
    height:          3,
    backgroundColor: BRAND_GOLD,
    marginVertical:  30,
    width:           80,
  },
  titleText: {
    color:      '#FFFFFF',
    fontSize:   40,
    fontWeight: 700,
    lineHeight: 1.25,
    marginBottom: 20,
  },
  titleSub: {
    color:    BRAND_GOLD,
    fontSize: 18,
    fontWeight: 600,
  },
  titleFooter: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  titleFooterLabel: {
    color:    '#A8C8E8',
    fontSize: 13,
  },
  slideCounter: {
    color:    BRAND_GOLD,
    fontSize: 13,
    fontWeight: 600,
  },
  // ── Content slide ────────────────────────────────────────────────────
  contentPage: {
    flex:       1,
    backgroundColor: '#FFFFFF',
    padding:    0,
  },
  contentHeader: {
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 60,
    paddingVertical:  28,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
  },
  slideHeadline: {
    color:      '#FFFFFF',
    fontSize:   22,
    fontWeight: 700,
    flex:       1,
    paddingRight: 20,
    lineHeight: 1.3,
  },
  slideNumBadge: {
    backgroundColor: BRAND_GOLD,
    paddingHorizontal: 12,
    paddingVertical:  6,
    borderRadius:     20,
  },
  slideNumText: {
    color:      BRAND_BLUE,
    fontSize:   13,
    fontWeight: 700,
  },
  contentBody: {
    flex:             1,
    paddingHorizontal: 60,
    paddingTop:        36,
    paddingBottom:     20,
  },
  bodyText: {
    fontSize:   16,
    lineHeight: 1.7,
    color:      '#1A1A1A',
  },
  bulletRowSlide: {
    flexDirection: 'row',
    marginBottom:  10,
  },
  bulletDot: {
    color:      BRAND_GOLD,
    fontWeight: 700,
    fontSize:   18,
    marginRight: 12,
    lineHeight: 1.5,
  },
  bulletBodyText: {
    flex:       1,
    fontSize:   16,
    lineHeight: 1.7,
    color:      '#1A1A1A',
  },
  contentFooter: {
    paddingHorizontal: 60,
    paddingBottom:     28,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
  },
  footerBrand: {
    fontSize: 11,
    color:    '#999999',
  },
  footerCounter: {
    fontSize:   11,
    color:      BRAND_BLUE,
    fontWeight: 600,
  },
  // ── CTA slide (last) ─────────────────────────────────────────────────
  ctaPage: {
    flex:            1,
    backgroundColor: BRAND_BLUE,
    padding:         80,
    justifyContent:  'center',
    alignItems:      'center',
  },
  ctaGoldRule: {
    height:          2,
    backgroundColor: BRAND_GOLD,
    width:           60,
    marginBottom:    30,
  },
  ctaHeadline: {
    color:      '#FFFFFF',
    fontSize:   28,
    fontWeight: 700,
    textAlign:  'center',
    marginBottom: 16,
  },
  ctaSub: {
    color:      BRAND_GOLD,
    fontSize:   16,
    fontWeight: 600,
    textAlign:  'center',
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
  theme:       string
  titleSlide:  string           // Hook / title for slide 1
  slides:      CarouselSlide[]  // Content slides
  pillar:      string
  quarter:     string
  weekNumber:  number
  useSwansLogo?: boolean        // Finance pillar
}

function CarouselDocument({ theme, titleSlide, slides, pillar, quarter, weekNumber, useSwansLogo }: CarouselPDFProps) {
  const total = slides.length + 2  // title + content slides + CTA
  const logoSrc = useSwansLogo ? SWANS_LOGO_PATH : LOGO_PATH

  function renderBodyLines(text: string, key: number) {
    const lines = text.split('\n').filter(l => l.trim())
    return lines.map((line, i) => {
      if (/^[-•]\s/.test(line)) {
        return (
          <View key={`${key}-${i}`} style={S.bulletRowSlide}>
            <Text style={S.bulletDot}>•</Text>
            <Text style={S.bulletBodyText}>{normalizeIAST(line.replace(/^[-•]\s/, ''))}</Text>
          </View>
        )
      }
      return <Text key={`${key}-${i}`} style={S.bodyText}>{normalizeIAST(line)}</Text>
    })
  }

  return (
    <Document title={theme} author="Coach Sharath">

      {/* Slide 1 — Title */}
      <Page size={[SIZE, SIZE]} style={S.titlePage}>
        <View style={S.logoBox}>
          <Image src={logoSrc} style={S.logoOnDark} />
        </View>
        <View>
          <View style={S.titleGoldRule} />
          <Text style={S.titleText}>{titleSlide}</Text>
          <Text style={S.titleSub}>{theme}</Text>
        </View>
        <View style={S.titleFooter}>
          <Text style={S.titleFooterLabel}>{quarter} · Week {weekNumber}</Text>
          <Text style={S.slideCounter}>1 / {total}</Text>
        </View>
      </Page>

      {/* Content slides */}
      {slides.map((slide, i) => (
        <Page key={i} size={[SIZE, SIZE]} style={S.contentPage}>
          <View style={S.contentHeader}>
            <Text style={S.slideHeadline}>{normalizeIAST(slide.headline)}</Text>
            <View style={S.slideNumBadge}>
              <Text style={S.slideNumText}>{i + 2}</Text>
            </View>
          </View>
          <View style={S.contentBody}>
            {renderBodyLines(slide.body, i)}
          </View>
          <View style={S.contentFooter}>
            <Text style={S.footerBrand}>coachsharath.com</Text>
            <Text style={S.footerCounter}>{i + 2} / {total}</Text>
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
