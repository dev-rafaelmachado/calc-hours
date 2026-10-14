// Ported from the results block of render_simulacao_livre (dashboard.py):
// what-if totals for the current week from hours typed per day.

import type { IsoDate } from "./dates"

export interface SimulationInput {
  /** Minutes per non-holiday day of the week. */
  days: { date: IsoDate; minutes: number }[]
  today: IsoDate
  weekTargetMinutes: number
  previousWeeksDebt: number
}

export interface SimulationResult {
  totalMinutes: number
  workedUntilTodayMinutes: number
  missingMinutes: number
  /** Debt from previous weeks still open after this week's overtime. */
  compensationRemainingMinutes: number
  /** Beyond the week target and the previous debt. */
  extraMinutes: number
}

export function simulateWeek(input: SimulationInput): SimulationResult {
  const total = input.days.reduce((sum, d) => sum + d.minutes, 0)
  const untilToday = input.days
    .filter((d) => d.date <= input.today)
    .reduce((sum, d) => sum + d.minutes, 0)
  const overtime = Math.max(total - input.weekTargetMinutes, 0)
  return {
    totalMinutes: total,
    workedUntilTodayMinutes: untilToday,
    missingMinutes: Math.max(input.weekTargetMinutes - total, 0),
    compensationRemainingMinutes: Math.max(input.previousWeeksDebt - overtime, 0),
    extraMinutes: Math.max(total - (input.weekTargetMinutes + input.previousWeeksDebt), 0),
  }
}
