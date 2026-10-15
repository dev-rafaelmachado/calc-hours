import Papa from "papaparse"

import { addDays, type IsoDate } from "@/lib/domain/dates"
import { parseHHMM } from "@/lib/domain/time"

export interface ImportedPunch {
  date: IsoDate
  /** Local minutes since midnight. */
  minutes: number
}

export interface CsvImportResult {
  punches: ImportedPunch[]
  skippedRows: number
}

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

const ALIASES: Record<string, string> = {
  data: "date",
  hora: "time",
  horario: "time",
  lunchstart: "lunchStart",
  lunch_start: "lunchStart",
  lunchend: "lunchEnd",
  lunch_end: "lunchEnd",
}

function normalizeHeader(header: string): string {
  const key = header.trim().replace(/\s+/g, "").toLowerCase()
  return ALIASES[key] ?? key
}

function toIsoDate(value: string): IsoDate | null {
  const text = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null
}

function minutesOrNull(value: unknown): number | null {
  try {
    return parseHHMM(String(value ?? ""))
  } catch {
    return null
  }
}

/**
 * Accepts two layouts:
 * - one punch per row: `date,time` (also `data,hora`, dates as YYYY-MM-DD or DD/MM/YYYY);
 * - the legacy 4-slot rows: `day|date,start,lunchStart,lunchEnd,end`. Without
 *   a date column the weekday is placed on the week of `referenceMonday`.
 */
export function parsePunchesCsv(text: string, referenceMonday?: IsoDate): CsvImportResult {
  const { data } = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  })
  const punches: ImportedPunch[] = []
  let skippedRows = 0

  for (const row of data) {
    const date = row.date ? toIsoDate(row.date) : null

    if ("time" in row) {
      const minutes = minutesOrNull(row.time)
      if (!date || minutes === null) skippedRows++
      else punches.push({ date, minutes })
      continue
    }

    const weekday = WEEKDAYS.indexOf(String(row.day ?? "").trim().toLowerCase())
    const rowDate = date ?? (referenceMonday && weekday >= 0 ? addDays(referenceMonday, weekday) : null)
    const [s, ls, le, e] = [row.start, row.lunchStart, row.lunchEnd, row.end].map(minutesOrNull)
    if (!rowDate || s === null || ls === null || le === null || e === null) {
      skippedRows++
      continue
    }

    // Same rule as the legacy migration: a zero-length lunch is one block.
    const intervals = ls === le ? [[s, e]] : [[s, ls], [le, e]]
    for (const [start, end] of intervals) {
      if (end > start) punches.push({ date: rowDate, minutes: start }, { date: rowDate, minutes: end })
    }
  }

  return { punches, skippedRows }
}
