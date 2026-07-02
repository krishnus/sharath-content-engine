// @ts-nocheck  — react-pdf JSX types don't fully align with React's in strict mode
import React from 'react'
import {
  Document, Page, Text, View, Image, Font, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer'
import { BRAND_BLUE, BRAND_GOLD, FONT_PATHS, DARK_BG_LOGO_PATH, LIGHT_BG_LOGO_PATH, normalizeIAST } from './fonts'

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

Font.registerHyphenationCallback(word => [word])

const ARTICLE_STRIP_BG  = '#091e3a'        // matches carousel NAVY — header + footer band

// Footer text colours
const FOOTER_NAME_COLOR = BRAND_GOLD       // "Coach Sharath — Executive & Life Coaching"
const FOOTER_SUB_COLOR  = '#A8C8E8'        // "coachsharath.com" and page number
const FOOTER_STRIP_BG   = ARTICLE_STRIP_BG

// Off-strip (white bg) equivalents — readable on paper
const FOOTER_NAME_PLAIN = '#333333'
const FOOTER_SUB_PLAIN  = '#888888'

const S = StyleSheet.create({
  page: {
    fontFamily:    'Montserrat',
    fontSize:      11,
    color:         '#1A1A1A',
    paddingTop:    0,
    paddingBottom: 64,   // clear the new two-line footer (~54pt max) with a safe buffer
    paddingLeft:   0,
    paddingRight:  0,
  },
  // ── Header band ──────────────────────────────────────────────────────
  headerBase: {
    paddingHorizontal: 40,
    paddingTop:        28,
    paddingBottom:     22,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  14,
  },
  logoBoxBase: {
    alignSelf: 'flex-start',
  },
  // Sized for the light logo (927×375, ~2.47:1); dark variant overridden inline
  logo: {
    width:     100,
    height:    40,
    objectFit: 'contain',
  },
  goldRule: {
    height:          2,
    backgroundColor: BRAND_GOLD,
    marginBottom:    14,
  },
  articleTitleBase: {
    fontWeight:   700,
    fontSize:     34,
    lineHeight:   1.2,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    columnGap:     12,
  },
  metaChipBase: {
    fontSize:      9,
    fontWeight:    600,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  // ── Body ─────────────────────────────────────────────────────────────
  body: {
    paddingHorizontal: 40,
    paddingTop:        24,
  },
  paragraph: {
    marginBottom: 10,
    lineHeight:   1.7,
    fontSize:     17,
    color:        '#2A2A2A',
    orphans:      3,
    widows:       3,
  },
  heading: {
    fontSize:     19,
    fontWeight:   500,
    color:        '#0D2D52',
    marginBottom: 10,
    marginTop:    20,
  },
  pullQuote: {
    fontSize:        22,
    color:           '#0D2D52',
    lineHeight:      1.5,
    borderLeftWidth: 3,
    borderLeftColor: '#C8A04A',
    paddingLeft:     16,
    marginTop:       16,
    marginBottom:    16,
  },
  teachingBox: {
    backgroundColor:   '#F7F2E8',
    borderTopWidth:    1,
    borderTopColor:    '#C8A04A',
    borderBottomWidth: 1,
    borderBottomColor: '#C8A04A',
    paddingTop:        16,
    paddingBottom:     16,
    paddingLeft:       16,
    paddingRight:      16,
    marginTop:         20,
    marginBottom:      20,
  },
  // Lines inside the teaching box — same size as paragraph but no bottom margin so they sit tight
  teachingLine: {
    lineHeight: 1.7,
    fontSize:   17,
    color:      '#2A2A2A',
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom:  6,
    paddingLeft:   8,
  },
  bullet: {
    color:       BRAND_GOLD,
    fontWeight:  700,
    marginRight: 8,
    fontSize:    17,
  },
  bulletText: {
    flex:       1,
    lineHeight: 1.7,
    fontSize:   17,
  },
  // ── Footer ───────────────────────────────────────────────────────────
  // Outer wrapper: absolute-positioned, full-width anchor
  footer: {
    position: 'absolute',
    bottom:   0,
    left:     0,
    right:    0,
  },
  // Gold rule shown only when footer strip is OFF
  footerRule: {
    height:          1,
    backgroundColor: BRAND_GOLD,
    opacity:         0.4,
    marginLeft:      40,
    marginRight:     40,
  },
  // Blue-band inner: used when footer strip ON
  footerBandStrip: {
    backgroundColor:   FOOTER_STRIP_BG,
    paddingHorizontal: 40,
    paddingTop:        12,
    paddingBottom:     14,
  },
  // Plain inner: used when footer strip OFF
  footerBandPlain: {
    paddingHorizontal: 40,
    paddingTop:        10,
    paddingBottom:     12,
  },
  // Top row: name on left, page number on right
  footerTopRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   2,
  },
  footerNameBase: {
    fontSize:   10,
    fontWeight: 600,
  },
  footerSubBase: {
    fontSize: 8,
  },
  footerPageNumBase: {
    fontSize: 9,
  },
})

// Devanagari only — used to detect Sanskrit/Vedic teaching blocks
const DEVANAGARI_RE = /[ऀ-ॿ]+/
// Devanagari + entire Currency Symbols block (U+20A0–U+20CF, includes ₹ U+20B9) —
// these glyphs may be absent from Montserrat; route through NotoDevanagari instead.
const NOTO_CHAR_RE  = /[ऀ-ॿ₠-⃏]/
const NOTO_SPLIT_RE = /([ऀ-ॿ₠-⃏]+)/

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

function renderMixedScript(text: string, baseStyle: object, devStyle: object, keyBase: number): React.ReactNode {
  const cleaned = stripInlineMarkdown(text)
  if (!NOTO_CHAR_RE.test(cleaned)) {
    return <Text key={keyBase} style={baseStyle}>{normalizeIAST(cleaned)}</Text>
  }
  const { orphans: _o, widows: _w, marginBottom: _mb, marginTop: _mt, ...inlineDevStyle } =
    devStyle as Record<string, unknown>
  const parts = cleaned.split(NOTO_SPLIT_RE).filter(p => p.length > 0)
  return (
    <Text key={keyBase} style={baseStyle}>
      {parts.map((part, i) =>
        NOTO_CHAR_RE.test(part)
          ? <Text key={i} style={inlineDevStyle as object}>{part}</Text>
          : normalizeIAST(part)
      )}
    </Text>
  )
}

function parseContent(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let key = 0
  let isFirstParagraph = true

  const devStyle = { fontFamily: 'NotoDevanagari' }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    if (/^(WORD_COUNT|CORE_INSIGHT|CALLBACK_USED|THREAD_PLANTED|REFERENCES|HASHTAGS|LINKEDIN_CAPTION|QUOTE|ARTICLE_TITLE):/.test(line)) {
      continue
    }

    if (/^[\s—–\-*·]+$/.test(line) && line.trim().length <= 5) {
      continue
    }

    // Headings — do not consume isFirstParagraph
    if (/^#{1,3}\s/.test(line) || /^[A-Z][^a-z]{5,}:$/.test(line)) {
      const t = line.replace(/^#{1,3}\s/, '').replace(/:$/, '')
      nodes.push(renderMixedScript(t, S.heading, { ...S.heading, ...devStyle }, key++))
      continue
    }

    if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s/)!
      const rest  = line.slice(match[0].length)
      nodes.push(
        <View key={key++} style={S.bulletRow}>
          <Text style={S.bullet}>{match[1]}.</Text>
          {renderMixedScript(rest, S.bulletText, { ...S.bulletText, ...devStyle }, key++)}
        </View>
      )
      isFirstParagraph = false
      continue
    }

    if (/^[-•]\s/.test(line)) {
      nodes.push(
        <View key={key++} style={S.bulletRow}>
          <Text style={S.bullet}>•</Text>
          {renderMixedScript(line.replace(/^[-•]\s/, ''), S.bulletText, { ...S.bulletText, ...devStyle }, key++)}
        </View>
      )
      isFirstParagraph = false
      continue
    }

    // Sanskrit/Vedic teaching block — collect lines into one box, bridging across blank
    // lines when the next non-blank line also contains Devanagari (consecutive teachings).
    // wrap={false} keeps the entire box on one page — no orphaned top-border at page bottom.
    if (DEVANAGARI_RE.test(line)) {
      const rawLines: string[] = [line]
      let j = i + 1

      while (j < lines.length) {
        const curr = lines[j].trim()

        if (!curr) {
          // Blank line — peek past it to see whether another Devanagari block follows
          let peekJ = j + 1
          while (peekJ < lines.length && !lines[peekJ].trim()) peekJ++
          if (peekJ < lines.length && DEVANAGARI_RE.test(lines[peekJ])) {
            j = peekJ   // bridge: skip blank(s) and continue collecting
            continue
          }
          break         // no Devanagari ahead — end of teaching section
        }

        if (/^#{1,3}\s/.test(curr)) break   // heading ends the section

        rawLines.push(lines[j])
        j++
      }

      i = j - 1   // outer for-loop will do i++, landing on the first unprocessed line

      const boxKey   = key++
      const lineKeys = rawLines.map(() => key++)
      nodes.push(
        <View key={boxKey} style={S.teachingBox} wrap={false}>
          {rawLines.map((bl, bi) =>
            renderMixedScript(bl, S.teachingLine, { ...S.teachingLine, ...devStyle }, lineKeys[bi])
          )}
        </View>
      )
      isFirstParagraph = false
      continue
    }

    // Opening hook — pull-quote treatment (gold left bar, navy text, larger size)
    if (isFirstParagraph) {
      isFirstParagraph = false
      nodes.push(renderMixedScript(line, S.pullQuote, { ...S.pullQuote, ...devStyle }, key++))
      continue
    }

    nodes.push(renderMixedScript(line, S.paragraph, { ...S.paragraph, ...devStyle }, key++))
  }

  return nodes
}

export type ArticlePDFProps = {
  title:            string
  content:          string
  pillar:           string
  quarter:          string
  weekNumber:       number
  dateStr:          string
  showHeaderStrip?: boolean   // default true — blue band behind Post Title
  showFooterStrip?: boolean   // default true — blue band in footer
}

function ArticleDocument({
  title, content, pillar, quarter, weekNumber, dateStr,
  showHeaderStrip = true,
  showFooterStrip = true,
}: ArticlePDFProps) {
  const pillarLabel = pillar.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

  // Header: base padding + conditional blue background
  const headerStyle = {
    ...S.headerBase,
    ...(showHeaderStrip ? { backgroundColor: ARTICLE_STRIP_BG } : {}),
  }
  const logoBoxStyle = S.logoBoxBase
  // Blue header → dark-background logo (1536×1024, 1.5:1); light header → light logo (927×375, 2.47:1)
  // Trimmed dark logo is 1026×374 (2.74:1) — close enough to light logo (2.47:1) to share the same box
  const logoSrc     = showHeaderStrip ? DARK_BG_LOGO_PATH : LIGHT_BG_LOGO_PATH
  const logoStyle   = S.logo
  const titleStyle  = { ...S.articleTitleBase,  color: showHeaderStrip ? '#FFFFFF'    : BRAND_BLUE  }
  const chipStyle   = { ...S.metaChipBase,       color: showHeaderStrip ? BRAND_GOLD   : '#666666'   }
  const sepColor    = showHeaderStrip ? '#4A7AB5' : '#AAAAAA'

  // Footer text colours
  const nameColor   = showFooterStrip ? FOOTER_NAME_COLOR : FOOTER_NAME_PLAIN
  const subColor    = showFooterStrip ? FOOTER_SUB_COLOR  : FOOTER_SUB_PLAIN

  return (
    <Document title={title} author="Coach Sharath">
      <Page size="A4" style={S.page} wrap>

        {/* Header */}
        <View style={headerStyle} fixed>
          <View style={S.logoRow}>
            <View style={logoBoxStyle}>
              <Image src={logoSrc} style={logoStyle} />
            </View>
          </View>
          <View style={S.goldRule} />
          <Text style={titleStyle}>{normalizeIAST(title)}</Text>
          <View style={S.metaRow}>
            <Text style={chipStyle}>{pillarLabel}</Text>
            <Text style={{ ...S.metaChipBase, color: sepColor }}>·</Text>
            <Text style={chipStyle}>{dateStr}</Text>
          </View>
        </View>

        {/* Empty row at start of pages 2+ */}
        <View fixed render={({ pageNumber }) => (
          <View style={{ height: pageNumber > 1 ? 20 : 0 }} />
        )} />

        {/* Body */}
        <View style={S.body}>
          {parseContent(content)}
        </View>

        {/* Footer — blue band (optional) with brand name, URL and page number */}
        <View style={S.footer} fixed>
          {/* Thin gold rule separates footer from content when no blue strip */}
          {!showFooterStrip && <View style={S.footerRule} />}

          <View style={showFooterStrip ? S.footerBandStrip : S.footerBandPlain}>
            {/* Row 1: brand name (left) + page number (right) */}
            <View style={S.footerTopRow}>
              <Text style={{ ...S.footerNameBase, color: nameColor }}>
                Coach Sharath — Executive &amp; Life Coaching
              </Text>
              <Text
                style={{ ...S.footerPageNumBase, color: subColor }}
                render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
              />
            </View>

            {/* Row 2: website URL */}
            <Text style={{ ...S.footerSubBase, color: subColor }}>
              coachsharath.com
            </Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}

export async function generateArticlePDF(props: ArticlePDFProps): Promise<Buffer> {
  return renderToBuffer(<ArticleDocument {...props} />) as Promise<Buffer>
}
