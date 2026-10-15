// Ported from hours_app/services.py (forecast_for_current_week,
// _rebalance_plan_minutes, _historical_day_profile, build_live_today_projection).
// The 4-slot "lunch" suggestions are gone: with punches the forecast gives the
// hours per day and the expected exit time.

import { addDays, weekEnd, weekStart, weekdayIndex, type IsoDate } from "./dates"
import { holidaySet, sumMinutes, workedDays, type DayRecord } from "./days"
import { roundHalfEven } from "./time"
import { previousWeeksDebt, weekTargetMinutes } from "./week"

export interface PlanRow {
  date: IsoDate
  minutes: number
  isToday: boolean
  /** Usual start for that weekday (local minutes since midnight). */
  suggestedStartMinutes: number
  /** suggestedStart + minutes + usual breaks. */
  suggestedEndMinutes: number
}

export interface ForecastDetails {
  /** Worked minutes in the current week, from the days given. */
  workedCurrentWeek: number
  /** Current week target minus worked (never negative). */
  missingCurrentWeek: number
  previousWeeksDebt: number
  /** What the remaining days must cover: missing + previous debt. */
  targetToPlan: number
  projectedWeekTotal: number
}

export interface Forecast {
  plan: PlanRow[]
  details: ForecastDetails
}

/** Spreads the difference minute by minute, exactly like the legacy app. */
export function rebalancePlanMinutes(rows: { minutes: number }[], targetMinutes: number): void {
  if (rows.length === 0) return
  const target = Math.max(targetMinutes, 0)
  const current = rows.reduce((total, r) => total + r.minutes, 0)
  if (current === target) return

  if (current < target) {
    for (let remaining = target - current, i = 0; remaining > 0; remaining--, i++) {
      rows[i % rows.length].minutes += 1
    }
    return
  }

  let over = current - target
  while (over > 0) {
    const candidates = rows.filter((r) => r.minutes > 0).sort((a, b) => b.minutes - a.minutes)
    if (candidates.length === 0) break
    for (const row of candidates) {
      if (over === 0) break
      row.minutes -= 1
      over -= 1
    }
  }
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

export interface DayProfile {
  startMinutes: number
  breakMinutes: number
}

/** Average start and total breaks for a weekday, falling back to all days. */
export function dayProfile(history: DayRecord[], weekday: number): DayProfile {
  const sameWeekday = history.filter((d) => weekdayIndex(d.date) === weekday)
  const candidates = sameWeekday.length > 0 ? sameWeekday : history
  const starts = candidates.flatMap((d) => (d.firstInMinutes === null ? [] : [d.firstInMinutes]))
  const breaks = candidates.filter((d) => d.breakMinutes > 0).map((d) => d.breakMinutes)
  return {
    startMinutes: starts.length > 0 ? roundHalfEven(mean(starts)) : 9 * 60,
    breakMinutes: breaks.length > 0 ? roundHalfEven(mean(breaks)) : 60,
  }
}

export function forecastCurrentWeek(
  days: DayRecord[],
  today: IsoDate,
  dayTargetMinutes: number,
  {
    todayPlanMinutes,
    previousDebt,
  }: {
    todayPlanMinutes?: number
    /** Overrides the month-balance debt (the parity test injects the legacy rule). */
    previousDebt?: number
  } = {},
): Forecast {
  const start = weekStart(today)
  const end = weekEnd(today)
  const holidays = holidaySet(days)
  const weekTarget = weekTargetMinutes(start, end, dayTargetMinutes, holidays)
  const history = workedDays(days)

  if (history.length === 0) {
    return {
      plan: [],
      details: {
        workedCurrentWeek: 0,
        missingCurrentWeek: weekTarget,
        previousWeeksDebt: 0,
        targetToPlan: weekTarget,
        projectedWeekTotal: 0,
      },
    }
  }

  const current = history.filter((d) => d.date >= start && d.date <= end)
  const done = new Set(current.map((d) => d.date))
  const remainingDays = [0, 1, 2, 3, 4]
    .map((i) => addDays(start, i))
    .filter((d) => d >= today && !done.has(d) && !holidays.has(d))

  const debt = previousDebt ?? previousWeeksDebt(days, start, dayTargetMinutes, today)
  const worked = sumMinutes(current)
  const deficit = Math.max(weekTarget - worked, 0)
  const targetToPlan = deficit + debt

  if (remainingDays.length === 0) {
    return {
      plan: [],
      details: {
        workedCurrentWeek: worked,
        missingCurrentWeek: deficit,
        previousWeeksDebt: debt,
        targetToPlan,
        projectedWeekTotal: worked,
      },
    }
  }

  const globalAvg = roundHalfEven(mean(history.map((d) => d.workedMinutes)))
  const rows = remainingDays.map((date) => {
    const sameWeekday = history.filter((d) => weekdayIndex(d.date) === weekdayIndex(date))
    const predicted =
      sameWeekday.length > 0
        ? roundHalfEven(mean(sameWeekday.map((d) => d.workedMinutes)))
        : globalAvg
    return { date, minutes: predicted, isToday: date === today }
  })

  if (todayPlanMinutes === undefined) {
    rebalancePlanMinutes(rows, targetToPlan)
  } else {
    let lockedToday = 0
    const todayRow = rows.find((r) => r.isToday)
    if (todayRow) {
      todayRow.minutes = Math.max(todayPlanMinutes, 0)
      lockedToday = todayRow.minutes
    }
    rebalancePlanMinutes(
      rows.filter((r) => !r.isToday),
      Math.max(targetToPlan - lockedToday, 0),
    )
  }

  const plan = rows.map((row) => {
    const profile = dayProfile(history, weekdayIndex(row.date))
    return {
      ...row,
      suggestedStartMinutes: profile.startMinutes,
      suggestedEndMinutes: profile.startMinutes + row.minutes + profile.breakMinutes,
    }
  })

  return {
    plan,
    details: {
      workedCurrentWeek: worked,
      missingCurrentWeek: deficit,
      previousWeeksDebt: debt,
      targetToPlan,
      projectedWeekTotal: worked + plan.reduce((total, r) => total + r.minutes, 0),
    },
  }
}

export interface TodayProjection {
  isHoliday: boolean
  /** What today should cover so the week (plus previous debt) closes. */
  suggestedMinutes: number
  workedMinutes: number
  remainingMinutes: number
  /** Today's minutes assumed when re-planning the week. */
  projectedMinutes: number
  /**
   * Working: when to leave. Out: when you'd leave if you came back now.
   * Empty: usual start + suggested + usual breaks. null when nothing is left.
   */
  expectedEndMinutes: number | null
  forecast: Forecast
  /** Worked this week including what is already done today. */
  weekWorkedMinutes: number
  /** What is still missing for the week (plus debt) after today's work so far. */
  weekMissingMinutes: number
}

/**
 * Live projection for today. `nowMinutes` is the local time of day. Today's
 * record is taken out of the history, like build_live_today_projection did,
 * and locked back into the plan with its projected minutes.
 */
export function todayProjection(
  days: DayRecord[],
  today: IsoDate,
  nowMinutes: number,
  dayTargetMinutes: number,
): TodayProjection {
  const todayRecord = days.find((d) => d.date === today)
  const planning = days.filter((d) => d.date !== today || d.isHoliday)
  const isHoliday = todayRecord?.isHoliday ?? false

  const base = forecastCurrentWeek(planning, today, dayTargetMinutes)
  const todayRow = base.plan.find((r) => r.isToday)
  const suggested = isHoliday ? 0 : (todayRow?.minutes ?? Math.max(dayTargetMinutes, 0))

  const worked = isHoliday ? 0 : (todayRecord?.workedMinutes ?? 0)
  const remaining = Math.max(suggested - worked, 0)
  const projected = isHoliday ? 0 : Math.max(worked, suggested)

  let expectedEnd: number | null = null
  const status = todayRecord?.status ?? "empty"
  if (!isHoliday && remaining > 0) {
    if (status === "working" || status === "out") expectedEnd = nowMinutes + remaining
    else {
      const profile = dayProfile(workedDays(planning), weekdayIndex(today))
      expectedEnd = profile.startMinutes + suggested + profile.breakMinutes
    }
  }

  const forecast = forecastCurrentWeek(planning, today, dayTargetMinutes, {
    todayPlanMinutes: projected,
  })

  return {
    isHoliday,
    suggestedMinutes: suggested,
    workedMinutes: worked,
    remainingMinutes: remaining,
    projectedMinutes: projected,
    expectedEndMinutes: expectedEnd,
    forecast,
    weekWorkedMinutes: forecast.details.workedCurrentWeek + worked,
    weekMissingMinutes: Math.max(forecast.details.targetToPlan - worked, 0),
  }
}
