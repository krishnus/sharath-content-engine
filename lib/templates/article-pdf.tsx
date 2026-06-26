// @ts-nocheck  — react-pdf JSX types don't fully align with React's in strict mode
import React from 'react'
import {
  Document, Page, Text, View, Image, Font, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer'
import { BRAND_BLUE, BRAND_GOLD, FONT_PATHS, LOGO_PATH, normalizeIAST } from './fonts'

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
    paddingBottom:   50,   // 50pt > footer height (~43pt) so content never overlaps the fixed footer
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
    columnGap:     12,
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
    orphans:      3,    // min lines kept at bottom of page before break
    widows:       3,    // min lines kept at top of page after break
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
    flexDirection:  'row',
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
    marginBottom:     12,   // clearance above the fixed footer (footer height ~43pt, page paddingBottom 50pt)
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

// Strip **bold** and *italic* markdown markers — render as plain text in the PDF.
// Keeps the text semantically intact while removing markup Montserrat can't express stylistically.
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

// Split a string into alternating Latin / Devanagari segments for mixed-font rendering.
// Latin segments pass through normalizeIAST() so Montserrat glyphs always exist.
// Empty segments from the split are filtered to avoid react-pdf null-child errors.
//
// Block-layout props (orphans, widows, marginBottom, marginTop) are stripped from the
// inner Devanagari <Text> style — yoga crashes with a null xCoordinate when block-level
// properties appear on inline nested Text nodes.
function renderMixedScript(text: string, baseStyle: object, devStyle: object, keyBase: number): React.ReactNode {
  const cleaned = stripInlineMarkdown(text)
  if (!DEVANAGARI_RE.test(cleaned)) {
    return <Text key={keyBase} style={baseStyle}>{normalizeIAST(cleaned)}</Text>
  }
  // Strip block-layout props that must not appear on inline nested Text children
  const { orphans: _o, widows: _w, marginBottom: _mb, marginTop: _mt, ...inlineDevStyle } =
    devStyle as Record<string, unknown>
  const parts = cleaned.split(/([ऀ-ॿ]+)/).filter(p => p.length > 0)
  return (
    <Text key={keyBase} style={baseStyle}>
      {parts.map((part, i) =>
        DEVANAGARI_RE.test(part)
          ? <Text key={i} style={inlineDevStyle as object}>{part}</Text>
          : normalizeIAST(part)
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

    // Strip metadata lines (including ARTICLE_TITLE from new prompt)
    if (/^(WORD_COUNT|CORE_INSIGHT|CALLBACK_USED|THREAD_PLANTED|REFERENCES|HASHTAGS|LINKEDIN_CAPTION|QUOTE|ARTICLE_TITLE):/.test(line)) {
      continue
    }

    // Skip em-dash separator lines — they mark logical section breaks but must not
    // appear as the first or last line of a page. The paragraph margins already provide spacing.
    if (/^[\s—–\-*·]+$/.test(line) && line.trim().length <= 5) {
      continue
    }

    // Heading: ## or ALL-CAPS: pattern
    if (/^#{1,3}\s/.test(line) || /^[A-Z][^a-z]{5,}:$/.test(line)) {
      const t = line.replace(/^#{1,3}\s/, '').replace(/:$/, '')
      nodes.push(renderMixedScript(t, S.heading, { ...S.heading, ...devStyle }, key++))
      continue
    }

    // Numbered list: "1. item"
    if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s/)!
      const rest  = line.slice(match[0].length)
      nodes.push(
        <View key={key++} style={S.bulletRow}>
          <Text style={S.bullet}>{match[1]}.</Text>
          {renderMixedScript(rest, S.bulletText, { ...S.bulletText, ...devStyle }, key++)}
        </View>
      )
      continue
    }

    // Bullet: "- item" or "• item"
    if (/^[-•]\s/.test(line)) {
      nodes.push(
        <View key={key++} style={S.bulletRow}>
          <Text style={S.bullet}>•</Text>
          {renderMixedScript(line.replace(/^[-•]\s/, ''), S.bulletText, { ...S.bulletText, ...devStyle }, key++)}
        </View>
      )
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
          <Text style={S.articleTitle}>{normalizeIAST(title)}</Text>
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
            <Text style={S.ctaSub}>coachsharath.com</Text>
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
