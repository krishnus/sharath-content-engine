const SYMBOLS = [
  { symbol: '^NSEI',    label: 'Nifty 50',   group: 'india',  prefix: '',  suffix: ' pts', decimals: 0 },
  { symbol: '^BSESN',   label: 'Sensex',      group: 'india',  prefix: '',  suffix: ' pts', decimals: 0 },
  { symbol: '^NSEBANK', label: 'Bank Nifty',  group: 'india',  prefix: '',  suffix: ' pts', decimals: 0 },
  { symbol: 'INR=X',   label: 'USD/INR',     group: 'india',  prefix: '₹', suffix: '',     decimals: 2 },
  { symbol: 'GC=F',    label: 'Gold',        group: 'global', prefix: '$', suffix: '/oz',  decimals: 0 },
  { symbol: 'CL=F',    label: 'Crude Oil',   group: 'global', prefix: '$', suffix: '/bbl', decimals: 1 },
  { symbol: '^GSPC',   label: 'S&P 500',     group: 'global', prefix: '',  suffix: ' pts', decimals: 0 },
] as const

type SymbolDef = typeof SYMBOLS[number]

interface Quote {
  def: SymbolDef
  price: number
  todayPct: number
  weekPct: number
}

async function fetchOne(def: SymbolDef, signal: AbortSignal): Promise<Quote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(def.symbol)}?interval=1d&range=5d`
  const res = await fetch(url, {
    signal,
    cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`Failed to fetch ${def.symbol}: HTTP ${res.status}`)

  const json = await res.json() as {
    chart: {
      result: Array<{
        meta: { regularMarketPrice: number; previousClose: number }
        indicators: { quote: Array<{ close: (number | null)[] }> }
      }> | null
    }
  }

  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(`No data returned for ${def.symbol}`)

  const current   = result.meta.regularMarketPrice
  const prevClose = result.meta.previousClose
  const closes    = result.indicators?.quote?.[0]?.close ?? []
  const valid     = closes.filter((c): c is number => c !== null && !isNaN(c))
  const weekStart = valid[0] ?? prevClose

  return {
    def,
    price:    current,
    todayPct: prevClose  ? ((current - prevClose)  / prevClose)  * 100 : 0,
    weekPct:  weekStart  ? ((current - weekStart)  / weekStart)  * 100 : 0,
  }
}

function formatNum(n: number, decimals: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatPct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

function renderQuote(q: Quote): string {
  const price = `${q.def.prefix}${formatNum(q.price, q.def.decimals)}${q.def.suffix}`
  return `${q.def.label}: ${price} (week ${formatPct(q.weekPct)}, today ${formatPct(q.todayPct)})`
}

export async function fetchMarketSnapshot(): Promise<string> {
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), 3000)

  try {
    const quotes = await Promise.all(SYMBOLS.map(def => fetchOne(def, controller.signal)))
    clearTimeout(timeoutId)

    const india  = quotes.filter(q => q.def.group === 'india')
    const global = quotes.filter(q => q.def.group === 'global')

    return [
      'LIVE MARKET SNAPSHOT (auto-fetched at generation time):',
      `Indian Markets: ${india.map(renderQuote).join(' | ')}`,
      `Global Context: ${global.map(renderQuote).join(' | ')}`,
      'Use these exact figures when referencing market data. Do not invent or modify these numbers.',
    ].join('\n')
  } catch {
    clearTimeout(timeoutId)
    throw new Error('Market data temporarily unavailable. Please try again in a few minutes.')
  }
}
