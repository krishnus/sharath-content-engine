// @ts-nocheck  — react-pdf JSX types don't fully align with React's in strict mode
import React from 'react'
import {
  Document, Page, Text, View, Image, Font, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer'
import { BRAND_BLUE, BRAND_GOLD, FONT_PATHS, LOGO_PATH } from './fonts'

Font.register({
  family: 'Montserrat',
  fonts: [
    { src: FONT_PATHS.regular,  fontWeight: 400 },
    { src: FONT_PATHS.semiBold, fontWeight: 600 },
    { src: FONT_PATHS.bold,     fontWeight: 700 },
  ],
})

Font.register({
  family: 'NotoDevanagari',
  src: FONT_PATHS.devanagari,
})

const S = StyleSheet.create({
  page: {
    fontFamily:      'Montserrat',
    fontSize:        11,
    color:           '#1A1A1A',
    paddingTop:      0,
    paddingBottom:   40,
    paddingLeft:     0,
    paddingRight:    0,
  },
  // ── Header band ──────────────────────────────────────────────────────
  header: {
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 40,
    paddingTop: 28,
    paddingBottom: 22,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  14,
  },
  logoBox: {
    backgroundColor: '#FFFFFF',
    borderRadius:    4,
    paddingHorizontal: 8,
    paddingVertical:   4,
  },
  logo: {
    width:     100,
    height:    32,
    objectFit: 'contain',
  },
  goldRule: {
    height:          2,
    backgroundColor: BRAND_GOLD,
    marginBottom:    14,
  },
  articleTitle: {
    fontWeight:  700,
    fontSize:    20,
    color:       '#FFFFFF',
    lineHeight:  1.3,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    gap:           12,
  },
  metaChip: {
    fontSize:        9,
    color:           BRAND_GOLD,
    fontWeight:      600,
    letterSpacing:   0.5,
    textTransform:   'uppercase',
  },
  metaSep: {
    fontSize: 9,
    color:    '#4A7AB5',
  },
  // ── Body ─────────────────────────────────────────────────────────────
  body: {
    paddingHorizontal: 40,
    paddingTop:        24,
  },
  paragraph: {
    marginBottom: 10,
    lineHeight:   1.65,
    fontSize:     11,
    color:        '#1A1A1A',
  },
  heading: {
    fontSize:     13,
    fontWeight:   600,
    color:        BRAND_BLUE,
    marginBottom: 6,
    marginTop:    16,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom:  6,
    paddingLeft:   8,
  },
  bullet: {
    color:        BRAND_GOLD,
    fontWeight:   700,
    marginRight:  8,
    fontSize:     11,
  },
  bulletText: {
    flex:       1,
    lineHeight: 1.6,
    fontSize:   11,
  },
  // ── Footer ───────────────────────────────────────────────────────────
  footer: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    paddingHorizontal: 40,
    paddingBottom:   14,
    paddingTop:      10,
  },
  footerRule: {
    height:          1,
    backgroundColor: BRAND_GOLD,
    marginBottom:    8,
    opacity:         0.4,
  },
  footerRow: {
    flexDirection:  'justify',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color:    '#888888',
  },
  footerPageNum: {
    fontSize: 8,
    color:    '#888888',
  },
  // ── CTA strip (last page) ─────────────────────────────────────────────
  cta: {
    backgroundColor: BRAND_BLUE,
    marginHorizontal: 0,
    marginTop:        24,
    paddingHorizontal: 40,
    paddingVertical:  18,
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
  },
  ctaText: {
    color:      BRAND_GOLD,
    fontWeight: 600,
    fontSize:   10,
  },
  ctaSub: {
    color:    '#A8C8E8',
    fontSize: 9,
    marginTop: 2,
  },
})

const DEVANAGARI_RE = /[ऀ-ॿ]+/

// Split a string into alternating Latin / Devanagari segments for mixed-font rendering
function renderMixedScript(text: string, baseStyle: object, devStyle: object, keyBase: number): React.ReactNode {
  if (!DEVANAGARI_RE.test(text)) {
    return <Text key={keyBase} style={baseStyle}>{text}</Text>
  }
  const parts = text.split(/([ऀ-ॿ]+)/)
  return (
    <Text key={keyBase} style={baseStyle}>
      {parts.map((part, i) =>
        DEVANAGARI_RE.test(part)
          ? <Text key={i} style={devStyle}>{part}</Text>
          : part
      )}
    </Text>
  )
}

// ── Content parser ─────────────────────────────────────────────────────────
function parseContent(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let key = 0

  const devStyle = { fontFamily: 'NotoDevanagari' }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    // Heading
    if (/^#{1,3}\s/.test(line) || /^[A-Z][^a-z]{5,}:$/.test(line)) {
      const t = line.replace(/^#{1,3}\s/, '').replace(/:$/, '')
      nodes.push(renderMixedScript(t, S.heading, { ...S.heading, ...devStyle }, key++))
      continue
    }

    // Bullet
    if (/^[-•]\s/.test(line)) {
      nodes.push(
        <View key={key++} style={S.bulletRow}>
          <Text style={S.bullet}>•</Text>
          {renderMixedScript(line.replace(/^[-•]\s/, ''), S.bulletText, { ...S.bulletText, ...devStyle }, key++)}
        </View>
      )
      continue
    }

    // Strip metadata lines
    if (/^(WORD_COUNT|CORE_INSIGHT|CALLBACK_USED|THREAD_PLANTED|REFERENCES|HASHTAGS|LINKEDIN_CAPTION|QUOTE):/.test(line)) {
      continue
    }

    nodes.push(renderMixedScript(line, S.paragraph, { ...S.paragraph, ...devStyle }, key++))
  }

  return nodes
}

export type ArticlePDFProps = {
  title:       string
  content:     string
  pillar:      string
  quarter:     string
  weekNumber:  number
  dateStr:     string
}

function ArticleDocument({ title, content, pillar, quarter, weekNumber, dateStr }: ArticlePDFProps) {
  const pillarLabel = pillar.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

  return (
    <Document title={title} author="Coach Sharath">
      <Page size="A4" style={S.page} wrap>
        {/* Header */}
        <View style={S.header} fixed>
          <View style={S.logoRow}>
            <View style={S.logoBox}>
              <Image src={LOGO_PATH} style={S.logo} />
            </View>
          </View>
          <View style={S.goldRule} />
          <Text style={S.articleTitle}>{title}</Text>
          <View style={S.metaRow}>
            <Text style={S.metaChip}>{pillarLabel}</Text>
            <Text style={S.metaSep}>·</Text>
            <Text style={S.metaChip}>{dateStr}</Text>
          </View>
        </View>

        {/* Body */}
        <View style={S.body}>
          {parseContent(content)}
        </View>

        {/* CTA block at end */}
        <View style={S.cta}>
          <View>
            <Text style={S.ctaText}>Coach Sharath — Executive &amp; Life Coaching</Text>
            <Text style={S.ctaSub}>coachsharath.com · Follow for weekly insights</Text>
          </View>
        </View>

        {/* Footer with page number */}
        <View style={S.footer} fixed>
          <View style={S.footerRule} />
          <View style={S.footerRow}>
            <Text style={S.footerText}>coachsharath.com</Text>
            <Text style={S.footerPageNum} render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            } />
          </View>
        </View>
      </Page>
    </Document>
  )
}

export async function generateArticlePDF(props: ArticlePDFProps): Promise<Buffer> {
  return renderToBuffer(<ArticleDocument {...props} />) as Promise<Buffer>
}
