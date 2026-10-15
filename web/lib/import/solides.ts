// Import from Sólides Ponto (Tangerino) "Apropriação de horas", from the text
// the browser copies when the result table is selected. There is no usable
// API for employees (login needs a browser reCAPTCHA), so the paste is the
// contract. Layout per day:
//
//   01/09/2026 - Terça            (or "07/09/2026 - Segunda (FERIADO)")
//   TRABALHANDO                   status line opens an interval
//    Editado Manualmente          optional
//   09:01  /  13:13  /  04:12     entry, exit and the interval total
//    Sede Empresa   Sede Empresa  entry and exit locations
//   ...
//   Trabalhadas: 09:30  Total de Intervalos: ...  Saldo do dia: ...

import { addDays, type IsoDate } from "@/lib/domain/dates"
import type { WorkDayMeta, WorkMode } from "@/lib/domain/days"
import { zonedInstant, type Punch } from "@/lib/domain/punches"

export interface SolidesInterval {
  /** Local minutes since midnight. */
  start: number
  /** null while the interval is still open (today). */
  end: number | null
  edited: boolean
}

export interface SolidesDay {
  date: IsoDate
  isHoliday: boolean
  intervals: SolidesInterval[]
  /** "Trabalhadas" from the day footer, to cross-check the parse. */
  reportedMinutes: number | null
  /** Inferred from the punch locations; null when they don't say. */
  workMode: WorkMode | null
  warnings: string[]
}

const DAY_HEADER = /^(\d{2})\/(\d{2})\/(\d{4})\s*-\s*\S+(?:\s*\((FERIADO)\))?/i
const TIME_LINE = /^(\d{2}):(\d{2})$/
const FOOTER = /^(Trabalhadas:|Total de Intervalos:|Total Previsto:|Saldo do dia:)/i
const STATUS_LINE = /^[A-ZÀ-Ý][A-ZÀ-Ý ]{2,}$/
const EDITED = /editado manualmente/i

const toMinutes = (h: string, m: string) => Number(h) * 60 + Number(m)
const duration = (start: number, end: number) => (end - start + 1440) % 1440
const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`

interface Block {
  times: number[]
  edited: boolean
}

function intervalsFromBlock(block: Block, date: IsoDate, warnings: string[]): SolidesInterval[] {
  const t = block.times
  if (t.length === 0) return []
  if (t.length === 1) return [{ start: t[0], end: null, edited: block.edited }]
  if (t.length === 2) {
    warnings.push(`${date}: período ${clock(t[0])}–${clock(t[1])} sem total para conferir`)
    return [{ start: t[0], end: t[1], edited: block.edited }]
  }

  // Normally exactly [entry, exit, total]; scan in triples to survive stray times.
  const out: SolidesInterval[] = []
  for (let i = 0; i < t.length; ) {
    if (i + 2 < t.length && duration(t[i], t[i + 1]) === t[i + 2]) {
      out.push({ start: t[i], end: t[i + 1], edited: block.edited })
      i += 3
    } else {
      warnings.push(`${date}: horário ${clock(t[i])} ignorado (não fecha com o total do período)`)
      i += 1
    }
  }
  return out
}

function inferWorkMode(locations: string[]): WorkMode | null {
  const text = locations.join(" ")
  // Any time at the office makes it a commuting (presencial) day.
  if (/\bsede\b/i.test(text)) return "presencial"
  if (/home\s*office/i.test(text)) return "home_office"
  return null
}

export function parseSolidesTimesheet(text: string): SolidesDay[] {
  const lines = text
    .replace(/ /g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())

  const days: SolidesDay[] = []
  let day: SolidesDay | null = null
  let blocks: Block[] = []
  let locations: string[] = []
  let footer = ""
  let inFooter = false

  const flush = () => {
    if (!day) return
    day.intervals = blocks.flatMap((b) => intervalsFromBlock(b, day!.date, day!.warnings))
    day.workMode = inferWorkMode(locations)
    const reported = /Trabalhadas:\s*(\d{2}):(\d{2})/i.exec(footer)
    day.reportedMinutes = reported ? toMinutes(reported[1], reported[2]) : null
    const parsed = day.intervals.reduce((s, i) => s + (i.end === null ? 0 : duration(i.start, i.end)), 0)
    if (day.reportedMinutes !== null && day.reportedMinutes !== parsed) {
      day.warnings.push(
        `${day.date}: soma lida ${clock(parsed)} difere do "Trabalhadas" da Sólides (${clock(day.reportedMinutes)})`,
      )
    }
    days.push(day)
  }

  for (const line of lines) {
    const header = DAY_HEADER.exec(line)
    if (header) {
      flush()
      day = {
        date: `${header[3]}-${header[2]}-${header[1]}`,
        isHoliday: Boolean(header[4]),
        intervals: [],
        reportedMinutes: null,
        workMode: null,
        warnings: [],
      }
      blocks = []
      locations = []
      footer = ""
      inFooter = false
      continue
    }
    if (!day || !line) continue

    if (FOOTER.test(line)) inFooter = true
    if (inFooter) {
      footer += ` ${line}`
      continue
    }

    const time = TIME_LINE.exec(line)
    if (time) {
      if (blocks.length === 0) blocks.push({ times: [], edited: false })
      blocks.at(-1)!.times.push(toMinutes(time[1], time[2]))
    } else if (STATUS_LINE.test(line)) {
      blocks.push({ times: [], edited: false })
    } else if (EDITED.test(line)) {
      if (blocks.length === 0) blocks.push({ times: [], edited: true })
      else blocks.at(-1)!.edited = true
    } else if (line !== "Escolha") {
      locations.push(line)
    }
  }
  flush()
  return days
}

// ---------------------------------------------------------------------------
// Plan: what importing the parsed days does to the existing records.

/** A manual punch this close to an imported one is the same punch (today only). */
const MERGE_WINDOW_MS = 5 * 60_000

export type DayAction = "new" | "same" | "replace" | "merge" | "skip"

export interface DayPlan {
  date: IsoDate
  action: DayAction
  imported: SolidesDay
  existing: Punch[]
  /** Instants to insert (source "solides"). */
  insert: { punchedAt: string; workDate: IsoDate }[]
  deleteIds: number[]
  /** Existing punches at an imported instant, to relabel as "solides". */
  relabelIds: number[]
  /** work_days row to write, or null when nothing changes. */
  meta: WorkDayMeta | null
}

function importedInstants(day: SolidesDay, timeZone: string): string[] {
  return day.intervals.flatMap((interval) => {
    const start = zonedInstant(day.date, interval.start, timeZone).toISOString()
    if (interval.end === null) return [start]
    const endDate = interval.end < interval.start ? addDays(day.date, 1) : day.date
    return [start, zonedInstant(endDate, interval.end, timeZone).toISOString()]
  })
}

/**
 * Closed days: Sólides is the source of truth and replaces the day's punches.
 * Today: imported punches are merged; a non-Sólides punch within 5 minutes of
 * an imported one is dropped. Days with no punches in Sólides keep the app's
 * punches. Holidays are added and the work mode is only filled when empty.
 */
export function planSolidesImport(
  days: SolidesDay[],
  existingPunches: Punch[],
  existingMeta: WorkDayMeta[],
  { today, timeZone }: { today: IsoDate; timeZone: string },
): DayPlan[] {
  return days.map((day) => {
    const existing = existingPunches.filter((p) => p.workDate === day.date)
    const meta = existingMeta.find((m) => m.workDate === day.date)
    const instants = importedInstants(day, timeZone)
    const importedMs = new Set(instants.map((i) => Date.parse(i)))
    const existingMs = new Set(existing.map((p) => Date.parse(p.punchedAt)))

    const insert = instants
      .filter((i) => !existingMs.has(Date.parse(i)))
      .map((punchedAt) => ({ punchedAt, workDate: day.date }))
    const matching = existing.filter((p) => importedMs.has(Date.parse(p.punchedAt)))
    const relabelIds = matching.filter((p) => p.source !== "solides").map((p) => p.id)

    const holiday = day.isHoliday && !meta?.isHoliday
    const workMode = day.workMode && !meta?.workMode ? day.workMode : null
    const metaChange: WorkDayMeta | null =
      holiday || workMode
        ? {
            workDate: day.date,
            isHoliday: (meta?.isHoliday ?? false) || day.isHoliday,
            workMode: meta?.workMode ?? workMode,
          }
        : null

    let action: DayAction
    let deleteIds: number[] = []
    if (instants.length === 0) {
      action = "skip"
      return { date: day.date, action, imported: day, existing, insert: [], deleteIds, relabelIds: [], meta: metaChange }
    }
    if (day.date === today) {
      action = "merge"
      deleteIds = existing
        .filter((p) => !importedMs.has(Date.parse(p.punchedAt)) && p.source !== "solides")
        .filter((p) => [...importedMs].some((ms) => Math.abs(ms - Date.parse(p.punchedAt)) <= MERGE_WINDOW_MS))
        .map((p) => p.id)
    } else {
      deleteIds = existing.filter((p) => !importedMs.has(Date.parse(p.punchedAt))).map((p) => p.id)
      action = existing.length === 0 ? "new" : insert.length === 0 && deleteIds.length === 0 ? "same" : "replace"
    }
    return { date: day.date, action, imported: day, existing, insert, deleteIds, relabelIds, meta: metaChange }
  })
}
