// Calendar math on ISO dates ("YYYY-MM-DD"). Workdays are calendar dates, not
// instants, so they are kept as strings and computed in UTC to stay free of
// the server timezone.

export type IsoDate = string

const DAY_MS = 86_400_000

function toUtc(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtc(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(toUtc(date) + days * DAY_MS)
}

export function diffDays(later: IsoDate, earlier: IsoDate): number {
  return Math.round((toUtc(later) - toUtc(earlier)) / DAY_MS)
}

/** 0 = Monday ... 6 = Sunday (Python's date.weekday()). */
export function weekdayIndex(date: IsoDate): number {
  return (new Date(toUtc(date)).getUTCDay() + 6) % 7
}

export function weekStart(date: IsoDate): IsoDate {
  return addDays(date, -weekdayIndex(date))
}

export function weekEnd(date: IsoDate): IsoDate {
  return addDays(weekStart(date), 6)
}

export function monthStart(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`
}

export function monthEnd(date: IsoDate): IsoDate {
  const [y, m] = date.split("-").map(Number)
  return fromUtc(Date.UTC(y, m, 0))
}

/** First day of the month `months` away from `date`'s month. */
export function shiftMonth(date: IsoDate, months: number): IsoDate {
  const [y, m] = date.split("-").map(Number)
  return fromUtc(Date.UTC(y, m - 1 + months, 1))
}

export function eachDay(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

/** Mon-Fri dates in [start, end], like pandas.bdate_range. */
export function businessDays(start: IsoDate, end: IsoDate): IsoDate[] {
  return eachDay(start, end).filter((d) => weekdayIndex(d) < 5)
}

export const WEEKDAY_LABELS = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
] as const

export const WEEKDAY_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const

export function weekdayLabel(date: IsoDate): string {
  return WEEKDAY_LABELS[weekdayIndex(date)]
}
