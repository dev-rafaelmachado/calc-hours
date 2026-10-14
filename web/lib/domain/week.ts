// Ported from hours_app/services.py (_week_target_minutes, current_week_summary,
// weekly_summary). previousWeeksDebt follows the monthly-balance rule instead
// of the legacy one; see its comment.

import { addDays, businessDays, monthStart, weekEnd, weekStart, type IsoDate } from "./dates"
import { holidaySet, sumMinutes, workedDays, type DayRecord } from "./days"

/** Business days in [start, end] that are not holidays, times the daily target. */
export function weekTargetMinutes(
  start: IsoDate,
  end: IsoDate,
  dayTargetMinutes: number,
  holidays: Set<IsoDate>,
): number {
  const effective = businessDays(start, end).filter((d) => !holidays.has(d))
  return effective.length * Math.max(dayTargetMinutes, 0)
}

export interface CurrentWeekSummary {
  weekStart: IsoDate
  weekEnd: IsoDate
  workedMinutes: number
  targetMinutes: number
  remainingMinutes: number
  /** 0..1 */
  progress: number
}

export function currentWeekSummary(
  days: DayRecord[],
  today: IsoDate,
  dayTargetMinutes: number,
): CurrentWeekSummary {
  const start = weekStart(today)
  const end = weekEnd(today)
  const worked = sumMinutes(workedDays(days).filter((d) => d.date >= start && d.date <= end))
  const target = weekTargetMinutes(start, end, dayTargetMinutes, holidaySet(days))
  return {
    weekStart: start,
    weekEnd: end,
    workedMinutes: worked,
    targetMinutes: target,
    remainingMinutes: Math.max(target - worked, 0),
    progress: target > 0 ? Math.min(worked / target, 1) : 1,
  }
}

export interface WeekTotals {
  weekStart: IsoDate
  weekEnd: IsoDate
  workedMinutes: number
  /** Worked days in the week. */
  days: number
  targetMinutes: number
}

/** Totals per week that has worked days, newest first. */
export function weeklySummary(days: DayRecord[], dayTargetMinutes: number): WeekTotals[] {
  const holidays = holidaySet(days)
  const byWeek = new Map<IsoDate, DayRecord[]>()
  for (const day of workedDays(days)) {
    const key = weekStart(day.date)
    byWeek.set(key, [...(byWeek.get(key) ?? []), day])
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([start, weekDays]) => ({
      weekStart: start,
      weekEnd: addDays(start, 6),
      workedMinutes: sumMinutes(weekDays),
      days: weekDays.length,
      targetMinutes: weekTargetMinutes(start, addDays(start, 6), dayTargetMinutes, holidays),
    }))
}

/**
 * What the week has to make up from earlier in the month: the target of the
 * business days from the 1st of `asOf`'s month until the day before
 * `weekStartDate`, minus what was worked in that range, never negative.
 *
 * Overtime offsets missing hours and the balance resets every month, matching
 * the monthly pay settlement. A business day without punches counts as
 * missing, like the month's "falta para fechar". (The legacy app summed the
 * deficit of every past week forever, without netting overtime.)
 */
export function previousWeeksDebt(
  days: DayRecord[],
  weekStartDate: IsoDate,
  dayTargetMinutes: number,
  asOf: IsoDate,
): number {
  const from = monthStart(asOf)
  const to = addDays(weekStartDate, -1)
  if (to < from) return 0
  const target = weekTargetMinutes(from, to, dayTargetMinutes, holidaySet(days))
  const worked = sumMinutes(workedDays(days).filter((d) => d.date >= from && d.date <= to))
  return Math.max(target - worked, 0)
}
