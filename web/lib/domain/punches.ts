import { TZDate } from "@date-fns/tz"

import type { IsoDate } from "./dates"

export type PunchSource = "manual" | "solides" | "csv" | "ocr" | "legacy"

export interface Punch {
  id: number
  /** Instant of the punch, ISO 8601 with offset. */
  punchedAt: string
  /** Workday the punch belongs to (differs from the local date only past midnight). */
  workDate: IsoDate
  source: PunchSource
  note?: string | null
}

export interface Interval {
  start: string
  /** null while the interval is still open. */
  end: string | null
  minutes: number
}

/**
 * - empty: no punches
 * - working: odd count today, the last interval runs until now
 * - out: even count today (on a break, or done for the day)
 * - closed: even count on a past day
 * - incomplete: odd count on a past day, a punch is missing
 */
export type DayStatus = "empty" | "working" | "out" | "closed" | "incomplete"

export interface DaySummary {
  intervals: Interval[]
  workedMinutes: number
  breakMinutes: number
  status: DayStatus
  /** Whether the next punch is an entry or an exit. */
  nextPunch: "in" | "out"
}

const MINUTE_MS = 60_000

const byInstant = (a: Punch, b: Punch) => Date.parse(a.punchedAt) - Date.parse(b.punchedAt)

/** Pairs punches in order (in, out, in, out...) and sums the closed pairs. */
export function summarizeDay(
  punches: Punch[],
  { isToday, now }: { isToday: boolean; now: Date },
): DaySummary {
  const sorted = [...punches].sort(byInstant)
  const intervals: Interval[] = []
  let workedMs = 0
  let breakMs = 0

  for (let i = 0; i < sorted.length; i += 2) {
    const start = sorted[i].punchedAt
    const end = sorted[i + 1]?.punchedAt ?? null
    const startMs = Date.parse(start)

    let intervalMs = 0
    if (end) intervalMs = Date.parse(end) - startMs
    else if (isToday) intervalMs = Math.max(now.getTime() - startMs, 0)
    workedMs += intervalMs

    const previous = intervals.at(-1)
    if (previous?.end) breakMs += startMs - Date.parse(previous.end)

    intervals.push({ start, end, minutes: Math.floor(intervalMs / MINUTE_MS) })
  }

  const odd = sorted.length % 2 === 1
  let status: DayStatus
  if (sorted.length === 0) status = "empty"
  else if (odd) status = isToday ? "working" : "incomplete"
  else status = isToday ? "out" : "closed"

  return {
    intervals,
    workedMinutes: Math.floor(workedMs / MINUTE_MS),
    breakMinutes: Math.floor(breakMs / MINUTE_MS),
    status,
    nextPunch: odd ? "out" : "in",
  }
}

/** Minutes since local midnight of an instant in the given timezone. */
export function localMinutes(instant: string | Date, timeZone: string): number {
  const zoned = new TZDate(new Date(instant).getTime(), timeZone)
  return zoned.getHours() * 60 + zoned.getMinutes()
}

/** Local calendar date of an instant in the given timezone. */
export function localDate(instant: string | Date, timeZone: string): IsoDate {
  const zoned = new TZDate(new Date(instant).getTime(), timeZone)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${zoned.getFullYear()}-${pad(zoned.getMonth() + 1)}-${pad(zoned.getDate())}`
}

/** Instant for a local date + minutes since midnight in the given timezone. */
export function zonedInstant(date: IsoDate, minutes: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number)
  const zoned = new TZDate(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, timeZone)
  return new Date(zoned.getTime())
}
