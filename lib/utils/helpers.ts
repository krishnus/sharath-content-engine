import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { getISOWeek, getYear, startOfISOWeek, addWeeks, format } from 'date-fns'

/** Merge Tailwind class names safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Count words in a string */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Get ISO week number and year for a date */
export function getWeekInfo(date: Date = new Date()): { weekNumber: number; year: number } {
  return { weekNumber: getISOWeek(date), year: getYear(date) }
}

/** Get the Monday start date for a given ISO week number + year */
export function weekStart(year: number, weekNumber: number): Date {
  // Jan 4th is always in ISO week 1
  const jan4 = new Date(year, 0, 4)
  const startOfWeek1 = startOfISOWeek(jan4)
  return addWeeks(startOfWeek1, weekNumber - 1)
}

/**
 * FIX 2: Get forward planning weeks dynamically.
 *
 * Previously hardcoded to always return exactly 2 weeks ([1, 2]).
 * Now: always show week+1 and week+2. Once week+1's Mon–Fri posts
 * are all approved, also show week+3 (so planning is always 2 weeks
 * ahead of the last fully-approved week).
 *
 * The `approvedMonFriWeek1` flag is passed in from the dashboard
 * after it fetches the DB state. When true, a 3rd week is appended.
 */
export function getForwardPlanWeeks(
  fromDate: Date = new Date(),
  approvedMonFriWeek1 = false,
): Array<{ weekNumber: number; year: number; start: Date }> {
  // Always show the next 2 weeks
  const offsets = approvedMonFriWeek1 ? [1, 2, 3] : [1, 2]

  return offsets.map(n => {
    const start  = addWeeks(fromDate, n)
    const monday = startOfISOWeek(start)
    return {
      weekNumber: getISOWeek(monday),
      year:       getYear(monday),
      start:      monday,
    }
  })
}

/** Format a date as "Mon, 18 May" */
export function formatDay(date: Date): string {
  return format(date, 'EEE, d MMM')
}

/** Get the quarter for a given date */
export function getQuarter(date: Date): 'Q1' | 'Q2' | 'Q3' | 'Q4' {
  const month = date.getMonth() + 1
  if (month <= 3) return 'Q1'
  if (month <= 6) return 'Q2'
  if (month <= 9) return 'Q3'
  return 'Q4'
}

/** Human-readable label for post status */
export const STATUS_LABELS: Record<string, string> = {
  awaiting_market_data: 'Awaiting Market Data',
  draft:          'Draft',
  edited:         'Edited',
  approved:       'Approved',
  scheduled:      'Scheduled',
  published:      'Published',
  publish_failed: 'Publish Failed',
}

/** Human-readable label for pillars */
export const PILLAR_LABELS: Record<string, string> = {
  vedic_leadership:        '🔱 Vedic-Leadership',
  banker_coach:            '🏦 Banker-Turned-Coach',
  coaching_transformation: '🔄 Coaching Transformation',
  financial_intelligence:  '📊 Financial Intelligence',
  inner_work:              '🌱 Inner Work',
}

/** Human-readable label for formats */
export const FORMAT_LABELS: Record<string, string> = {
  long_form_article: 'Long-form Article',
  text_post:         'Text Post',
  carousel:          'Carousel',
  market_insights:   'Market Insights',
}

/** Day order for sorting */
export const DAY_ORDER: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2,
  thursday: 3, friday: 4, saturday: 5,
}
