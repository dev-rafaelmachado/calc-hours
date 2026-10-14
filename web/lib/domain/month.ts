// Ported from hours_app/services.py (month_metrics).

import { addDays, businessDays, monthEnd, monthStart, weekStart, type IsoDate } from "./dates"
import { sumMinutes, type DayRecord } from "./days"
import { weekTargetMinutes } from "./week"

export interface MonthWeek {
  weekStart: IsoDate
  weekEnd: IsoDate
  workedMinutes: number
  targetMinutes: number
  extraMinutes: number
  debtMinutes: number
}

export interface MonthMetrics {
  monthStart: IsoDate
  monthEnd: IsoDate
  totalMinutes: number
  targetMinutes: number
  remainingMinutes: number
  extraMinutes: number
  weeklyOvertimeMinutes: number
  weeklyDebtMinutes: number
  weeks: MonthWeek[]
}

export function monthMetrics(
  days: DayRecord[],
  month: IsoDate,
  dayTargetMinutes: number,
): MonthMetrics {
  const first = monthStart(month)
  const last = monthEnd(month)
  const empty: MonthMetrics = {
    monthStart: first,
    monthEnd: last,
    totalMinutes: 0,
    targetMinutes: 0,
    remainingMinutes: 0,
    extraMinutes: 0,
    weeklyOvertimeMinutes: 0,
    weeklyDebtMinutes: 0,
    weeks: [],
  }
  if (days.length === 0) return empty

  const inMonth = days.filter((d) => d.date >= first && d.date <= last)
  // Holidays are taken from the month only, like the legacy month_metrics.
  const holidays = new Set(inMonth.filter((d) => d.isHoliday).map((d) => d.date))
  const worked = inMonth.filter((d) => d.hasPunches && !holidays.has(d.date))

  const total = sumMinutes(worked)
  const effectiveDays = businessDays(first, last).filter((d) => !holidays.has(d))
  const target = effectiveDays.length * Math.max(dayTargetMinutes, 0)

  const byWeek = new Map<IsoDate, DayRecord[]>()
  for (const day of worked) {
    const key = weekStart(day.date)
    byWeek.set(key, [...(byWeek.get(key) ?? []), day])
  }

  // A week that crosses the month boundary gets the full-week target while
  // only its in-month hours count, same as the legacy app.
  const weeks = [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([start, weekDays]) => {
      const end = addDays(start, 6)
      const weekWorked = sumMinutes(weekDays)
      const weekTarget = weekTargetMinutes(start, end, dayTargetMinutes, holidays)
      return {
        weekStart: start,
        weekEnd: end,
        workedMinutes: weekWorked,
        targetMinutes: weekTarget,
        extraMinutes: Math.max(weekWorked - weekTarget, 0),
        debtMinutes: Math.max(weekTarget - weekWorked, 0),
      }
    })

  return {
    monthStart: first,
    monthEnd: last,
    totalMinutes: total,
    targetMinutes: target,
    remainingMinutes: Math.max(target - total, 0),
    extraMinutes: Math.max(total - target, 0),
    weeklyOvertimeMinutes: weeks.reduce((s, w) => s + w.extraMinutes, 0),
    weeklyDebtMinutes: weeks.reduce((s, w) => s + w.debtMinutes, 0),
    weeks,
  }
}
