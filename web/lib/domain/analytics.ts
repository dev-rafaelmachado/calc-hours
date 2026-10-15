// Read-only analytics for the Análise screen: period totals, the month series,
// habits (start, end, breaks) by weekday and work mode, when in the day the
// work happens, and records. Only days up to yesterday are analysed: today is
// still open and lives on the Hoje screen.

import {
  addDays,
  businessDays,
  eachDay,
  monthEnd,
  monthStart,
  shiftMonth,
  weekdayIndex,
  type IsoDate,
} from "./dates"
import { holidaySet, sumMinutes, workedDays, type DayRecord, type WorkMode } from "./days"
import { weekTargetMinutes } from "./week"

export const PERIOD_PRESETS = ["3m", "6m", "12m", "ano", "tudo"] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

export interface AnalyticsRange {
  from: IsoDate
  to: IsoDate
}

/**
 * Whole months back from the current one ("ano" = since January, "tudo" =
 * since the first punch), ending yesterday. Never starts before the first
 * punch, so the months before the app was in use don't count as missing.
 * Null when there is no closed day to analyse.
 */
export function analyticsRange(
  preset: PeriodPreset,
  today: IsoDate,
  days: DayRecord[],
): AnalyticsRange | null {
  const first = days.find((d) => d.hasPunches)?.date
  const to = addDays(today, -1)
  if (!first || first > to) return null

  let from: IsoDate
  if (preset === "tudo") from = first
  else if (preset === "ano") from = `${today.slice(0, 4)}-01-01`
  else from = shiftMonth(today, -(Number.parseInt(preset, 10) - 1))

  if (from < first) from = first
  return from <= to ? { from, to } : null
}

/** A worked day with every interval closed: the base for habit metrics. */
export interface ClosedDay {
  date: IsoDate
  /** 0 = Monday ... 6 = Sunday */
  weekday: number
  workMode: WorkMode | null
  workedMinutes: number
  breakMinutes: number
  /** Local minutes of the first entry and the last exit (past 1440 after midnight). */
  start: number
  end: number
  spans: { start: number; end: number }[]
}

const inRange = (date: IsoDate, range: AnalyticsRange) => date >= range.from && date <= range.to

/** Closed, non-holiday days with punches. Incomplete days are left out of habits. */
export function closedDays(days: DayRecord[], range: AnalyticsRange): ClosedDay[] {
  return days.flatMap((d) => {
    if (!inRange(d.date, range) || d.isHoliday || d.status !== "closed" || d.spans.length === 0) {
      return []
    }
    const spans = d.spans.flatMap((s) => (s.end === null ? [] : [{ start: s.start, end: s.end }]))
    if (spans.length !== d.spans.length) return []
    return [
      {
        date: d.date,
        weekday: weekdayIndex(d.date),
        workMode: d.workMode,
        workedMinutes: d.workedMinutes,
        breakMinutes: d.breakMinutes,
        start: spans[0].start,
        end: spans.at(-1)!.end,
        spans,
      },
    ]
  })
}

export interface HabitStats {
  days: number
  avgWorkedMinutes: number
  avgStart: number
  avgEnd: number
  avgBreakMinutes: number
  /** Share of the days that reached the daily target, 0..1. */
  onTargetRatio: number
}

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length

export function habitStats(days: ClosedDay[], dayTargetMinutes: number): HabitStats | null {
  if (days.length === 0) return null
  return {
    days: days.length,
    avgWorkedMinutes: Math.round(mean(days.map((d) => d.workedMinutes))),
    avgStart: Math.round(mean(days.map((d) => d.start))),
    avgEnd: Math.round(mean(days.map((d) => d.end))),
    avgBreakMinutes: Math.round(mean(days.map((d) => d.breakMinutes))),
    onTargetRatio: days.filter((d) => d.workedMinutes >= dayTargetMinutes).length / days.length,
  }
}

export interface PeriodSummary {
  /** Includes the closed pairs of incomplete days, like the month view. */
  workedMinutes: number
  /** Non-holiday business days in the range times the daily target. */
  targetMinutes: number
  balanceMinutes: number
  workedDays: number
  habits: HabitStats | null
  /** Non-holiday business days without any punch: they count as missing. */
  missingDays: IsoDate[]
  incompleteDays: IsoDate[]
  workedDaysByMode: Record<WorkMode, number>
}

export function periodSummary(
  days: DayRecord[],
  range: AnalyticsRange,
  dayTargetMinutes: number,
): PeriodSummary {
  const holidays = holidaySet(days)
  const worked = workedDays(days).filter((d) => inRange(d.date, range))
  const workedDates = new Set(worked.map((d) => d.date))
  const workedMinutes = sumMinutes(worked)
  const targetMinutes = weekTargetMinutes(range.from, range.to, dayTargetMinutes, holidays)
  return {
    workedMinutes,
    targetMinutes,
    balanceMinutes: workedMinutes - targetMinutes,
    workedDays: worked.length,
    habits: habitStats(closedDays(days, range), dayTargetMinutes),
    missingDays: businessDays(range.from, range.to).filter(
      (d) => !holidays.has(d) && !workedDates.has(d),
    ),
    incompleteDays: worked.filter((d) => d.status === "incomplete").map((d) => d.date),
    workedDaysByMode: {
      presencial: worked.filter((d) => d.workMode === "presencial").length,
      home_office: worked.filter((d) => d.workMode === "home_office").length,
    },
  }
}

export interface MonthPoint {
  /** First day of the month. */
  month: IsoDate
  /** The part of the month inside the range. */
  from: IsoDate
  to: IsoDate
  /** The range leaves out business days of this month (the current month, usually). */
  partial: boolean
  workedMinutes: number
  targetMinutes: number
  balanceMinutes: number
  workedDays: number
  presencialDays: number
  habits: HabitStats | null
}

export function monthSeries(
  days: DayRecord[],
  range: AnalyticsRange,
  dayTargetMinutes: number,
): MonthPoint[] {
  const points: MonthPoint[] = []
  for (let month = monthStart(range.from); month <= range.to; month = shiftMonth(month, 1)) {
    const last = monthEnd(month)
    const slice = {
      from: month < range.from ? range.from : month,
      to: last > range.to ? range.to : last,
    }
    const summary = periodSummary(days, slice, dayTargetMinutes)
    const cut =
      businessDays(month, addDays(slice.from, -1)).length > 0 ||
      businessDays(addDays(slice.to, 1), last).length > 0
    points.push({
      month,
      ...slice,
      partial: cut,
      workedMinutes: summary.workedMinutes,
      targetMinutes: summary.targetMinutes,
      balanceMinutes: summary.balanceMinutes,
      workedDays: summary.workedDays,
      presencialDays: summary.workedDaysByMode.presencial,
      habits: summary.habits,
    })
  }
  return points
}

export interface WeekdayHabits {
  weekday: number
  stats: HabitStats
}

/** Habits per weekday, Monday first; weekdays without closed days are left out. */
export function weekdayProfile(days: ClosedDay[], dayTargetMinutes: number): WeekdayHabits[] {
  return [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => {
    const stats = habitStats(
      days.filter((d) => d.weekday === weekday),
      dayTargetMinutes,
    )
    return stats ? [{ weekday, stats }] : []
  })
}

export function modeProfile(
  days: ClosedDay[],
  dayTargetMinutes: number,
): Record<WorkMode, HabitStats | null> {
  return {
    presencial: habitStats(
      days.filter((d) => d.workMode === "presencial"),
      dayTargetMinutes,
    ),
    home_office: habitStats(
      days.filter((d) => d.workMode === "home_office"),
      dayTargetMinutes,
    ),
  }
}

export interface OccupancyPoint {
  /** Local clock minutes. */
  minutes: number
  /** Share of the days that were working at this time, 0..1; null without days. */
  all: number
  presencial: number | null
  home_office: number | null
}

/** For each `step` from the earliest start to the latest end: how often you were working then. */
export function occupancy(days: ClosedDay[], step = 15): OccupancyPoint[] {
  if (days.length === 0) return []
  const first = Math.floor(Math.min(...days.map((d) => d.start)) / 60) * 60
  const last = Math.ceil(Math.max(...days.map((d) => d.end)) / 60) * 60
  const presencial = days.filter((d) => d.workMode === "presencial")
  const homeOffice = days.filter((d) => d.workMode === "home_office")
  const share = (group: ClosedDay[], t: number) =>
    group.length === 0
      ? null
      : group.filter((d) => d.spans.some((s) => s.start <= t && t < s.end)).length / group.length

  const points: OccupancyPoint[] = []
  for (let t = first; t <= last; t += step) {
    points.push({
      minutes: t,
      all: share(days, t) ?? 0,
      presencial: share(presencial, t),
      home_office: share(homeOffice, t),
    })
  }
  return points
}

export interface DayValue {
  date: IsoDate
  minutes: number
}

export interface Streak {
  days: number
  from: IsoDate
  to: IsoDate
}

export interface PeriodRecords {
  longestDay: DayValue | null
  shortestDay: DayValue | null
  earliestStart: DayValue | null
  latestEnd: DayValue | null
  longestBreak: DayValue | null
  /** Most consecutive business days reaching the target (holidays are skipped). */
  bestStreak: Streak | null
  /** The streak that reaches the last business day of the range. */
  currentStreak: Streak | null
}

function extreme(days: ClosedDay[], value: (d: ClosedDay) => number, pick: "max" | "min") {
  let best: DayValue | null = null
  for (const d of days) {
    const v = value(d)
    if (!best || (pick === "max" ? v > best.minutes : v < best.minutes)) {
      best = { date: d.date, minutes: v }
    }
  }
  return best
}

export function periodRecords(
  days: DayRecord[],
  range: AnalyticsRange,
  dayTargetMinutes: number,
): PeriodRecords {
  const closed = closedDays(days, range)
  const holidays = holidaySet(days)
  const workedByDate = new Map(
    workedDays(days)
      .filter((d) => inRange(d.date, range))
      .map((d) => [d.date, d.workedMinutes]),
  )

  let best: Streak | null = null
  let current: Streak | null = null
  for (const date of businessDays(range.from, range.to)) {
    if (holidays.has(date)) continue
    if ((workedByDate.get(date) ?? 0) >= dayTargetMinutes) {
      const next: Streak = current
        ? { days: current.days + 1, from: current.from, to: date }
        : { days: 1, from: date, to: date }
      current = next
      if (!best || next.days > best.days) best = next
    } else {
      current = null
    }
  }

  return {
    longestDay: extreme(closed, (d) => d.workedMinutes, "max"),
    shortestDay: extreme(closed, (d) => d.workedMinutes, "min"),
    earliestStart: extreme(closed, (d) => d.start, "min"),
    latestEnd: extreme(closed, (d) => d.end, "max"),
    longestBreak: extreme(
      closed.filter((d) => d.breakMinutes > 0),
      (d) => d.breakMinutes,
      "max",
    ),
    bestStreak: best,
    currentStreak: current,
  }
}

export interface HabitShift {
  recent: HabitStats
  before: HabitStats
}

/** The last `recentDays` closed days against the ones before them, when both sides have enough data. */
export function habitShift(
  days: ClosedDay[],
  dayTargetMinutes: number,
  recentDays = 20,
): HabitShift | null {
  if (days.length < recentDays * 2) return null
  const recent = habitStats(days.slice(-recentDays), dayTargetMinutes)
  const before = habitStats(days.slice(0, -recentDays), dayTargetMinutes)
  return recent && before ? { recent, before } : null
}

export interface MonthProjection {
  month: IsoDate
  workedMinutes: number
  targetMinutes: number
  avgPerDayMinutes: number
  closedDays: number
  /** Non-holiday business days from today to the end of the month. */
  remainingDays: number
  projectedBalanceMinutes: number
}

/**
 * Where the current month ends if the remaining business days (today
 * included) repeat this month's average. Needs a few closed days to mean
 * anything.
 */
export function monthProjection(
  days: DayRecord[],
  today: IsoDate,
  dayTargetMinutes: number,
  minClosedDays = 3,
): MonthProjection | null {
  const month = monthStart(today)
  const yesterday = addDays(today, -1)
  if (yesterday < month) return null
  const range = { from: month, to: yesterday }
  const closed = closedDays(days, range)
  const stats = habitStats(closed, dayTargetMinutes)
  if (!stats || closed.length < minClosedDays) return null

  const holidays = holidaySet(days)
  const workedMinutes = sumMinutes(workedDays(days).filter((d) => inRange(d.date, range)))
  const remainingDays = businessDays(today, monthEnd(today)).filter((d) => !holidays.has(d)).length
  const targetMinutes = weekTargetMinutes(month, monthEnd(today), dayTargetMinutes, holidays)
  return {
    month,
    workedMinutes,
    targetMinutes,
    avgPerDayMinutes: stats.avgWorkedMinutes,
    closedDays: closed.length,
    remainingDays,
    projectedBalanceMinutes: workedMinutes + stats.avgWorkedMinutes * remainingDays - targetMinutes,
  }
}

export interface HeatmapDay {
  date: IsoDate
  workedMinutes: number
  isHoliday: boolean
  /** A non-holiday business day without punches. */
  missing: boolean
  incomplete: boolean
}

/** Every date of the range, for the calendar heatmap. */
export function heatmapDays(days: DayRecord[], range: AnalyticsRange): HeatmapDay[] {
  const byDate = new Map(days.map((d) => [d.date, d]))
  return eachDay(range.from, range.to).map((date) => {
    const record = byDate.get(date)
    const isHoliday = record?.isHoliday ?? false
    const hasPunches = record?.hasPunches ?? false
    return {
      date,
      workedMinutes: hasPunches && !isHoliday ? record!.workedMinutes : 0,
      isHoliday,
      missing: !isHoliday && !hasPunches && weekdayIndex(date) < 5,
      incomplete: record?.status === "incomplete",
    }
  })
}
