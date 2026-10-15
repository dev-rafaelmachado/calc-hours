import { diffDays, type IsoDate } from "./dates"
import { localDate, localMinutes, summarizeDay, type DayStatus, type Punch } from "./punches"

export type WorkMode = "home_office" | "presencial"

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  home_office: "Home office",
  presencial: "Presencial",
}

export interface WorkDayMeta {
  workDate: IsoDate
  isHoliday: boolean
  workMode: WorkMode | null
}

/**
 * An interval as local clock minutes from the workday's midnight. A shift that
 * crosses midnight ends past 1440. `end` is null while the interval is open.
 */
export interface DaySpan {
  start: number
  end: number | null
}

/**
 * One calendar day with any record (punches or metadata). Metrics only count
 * "worked days": non-holiday days that have punches. A day that only carries
 * metadata (e.g. marked presencial in advance) never counts as done.
 */
export interface DayRecord {
  date: IsoDate
  workedMinutes: number
  breakMinutes: number
  hasPunches: boolean
  /** Local minutes of the first punch, used to profile the usual start time. */
  firstInMinutes: number | null
  spans: DaySpan[]
  status: DayStatus
  isHoliday: boolean
  workMode: WorkMode | null
}

export function buildDayRecords(
  punches: Punch[],
  meta: WorkDayMeta[],
  { today, now, timeZone }: { today: IsoDate; now: Date; timeZone: string },
): DayRecord[] {
  const punchesByDay = new Map<IsoDate, Punch[]>()
  for (const punch of punches) {
    const list = punchesByDay.get(punch.workDate) ?? []
    list.push(punch)
    punchesByDay.set(punch.workDate, list)
  }
  const metaByDay = new Map(meta.map((m) => [m.workDate, m]))
  const dates = [...new Set([...punchesByDay.keys(), ...metaByDay.keys()])].sort()

  return dates.map((date) => {
    const dayPunches = punchesByDay.get(date) ?? []
    const summary = summarizeDay(dayPunches, { isToday: date === today, now })
    const dayMeta = metaByDay.get(date)
    return {
      date,
      workedMinutes: summary.workedMinutes,
      breakMinutes: summary.breakMinutes,
      hasPunches: dayPunches.length > 0,
      firstInMinutes: summary.intervals[0]
        ? localMinutes(summary.intervals[0].start, timeZone)
        : null,
      spans: summary.intervals.map((interval) => ({
        start: dayMinutes(interval.start, date, timeZone),
        end: interval.end ? dayMinutes(interval.end, date, timeZone) : null,
      })),
      status: summary.status,
      isHoliday: dayMeta?.isHoliday ?? false,
      workMode: dayMeta?.workMode ?? null,
    }
  })
}

function dayMinutes(instant: string, workDate: IsoDate, timeZone: string): number {
  return diffDays(localDate(instant, timeZone), workDate) * 1440 + localMinutes(instant, timeZone)
}

export function holidaySet(days: DayRecord[]): Set<IsoDate> {
  return new Set(days.filter((d) => d.isHoliday).map((d) => d.date))
}

/** Non-holiday days with punches: the only days that count towards metrics. */
export function workedDays(days: DayRecord[]): DayRecord[] {
  const holidays = holidaySet(days)
  return days.filter((d) => d.hasPunches && !holidays.has(d.date))
}

export const sumMinutes = (days: DayRecord[]) =>
  days.reduce((total, d) => total + d.workedMinutes, 0)
