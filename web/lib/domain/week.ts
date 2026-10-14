// Ported from hours_app/services.py (_week_target_minutes, current_week_summary,
// weekly_summary and the previous-weeks debt inside forecast_for_current_week).

import { addDays, businessDays, weekEnd, weekStart, type IsoDate } from "./dates"
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
 * Sum of the deficits of every week before `currentWeekStart` that has worked
 * days. Same rule as the legacy app: overtime in a past week does not offset
 * another week's deficit.
 */
export function previousWeeksDebt(
  days: DayRecord[],
  currentWeekStart: IsoDate,
  dayTargetMinutes: number,
): number {
  return weeklySummary(days, dayTargetMinutes)
    .filter((w) => w.weekStart < currentWeekStart)
    .reduce((debt, w) => debt + Math.max(w.targetMinutes - w.workedMinutes, 0), 0)
}
