import { describe, expect, it } from "vitest"

import {
  analyticsRange,
  closedDays,
  habitShift,
  heatmapDays,
  modeProfile,
  monthProjection,
  monthSeries,
  occupancy,
  periodRecords,
  periodSummary,
  weekdayProfile,
} from "./analytics"
import { addDays } from "./dates"
import { buildDayRecords, type WorkDayMeta, type WorkMode } from "./days"
import { monthMetrics } from "./month"
import { zonedInstant, type Punch } from "./punches"
import { parseHHMM } from "./time"

const TZ = "America/Sao_Paulo"
const TODAY = "2026-10-15" // Thursday

/** "26:30" is 02:30 of the next calendar day, still on `date`'s workday. */
function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function records(
  entries: Record<string, string[]>,
  meta: WorkDayMeta[] = [],
  today = TODAY,
) {
  let id = 0
  const punches: Punch[] = Object.entries(entries).flatMap(([date, times]) =>
    times.map((time) => {
      const minutes = minutesOf(time)
      const calendarDate = minutes >= 1440 ? addDays(date, 1) : date
      return {
        id: ++id,
        punchedAt: zonedInstant(calendarDate, minutes % 1440, TZ).toISOString(),
        workDate: date,
        source: "manual" as const,
      }
    }),
  )
  return buildDayRecords(punches, meta, {
    today,
    now: zonedInstant(today, parseHHMM("12:00"), TZ),
    timeZone: TZ,
  })
}

const mode = (workDate: string, workMode: WorkMode): WorkDayMeta => ({
  workDate,
  isHoliday: false,
  workMode,
})
const holiday = (workDate: string): WorkDayMeta => ({ workDate, isHoliday: true, workMode: null })

// Week of Mon 05/10/2026: two presencial days, a day without punches, an
// incomplete day and a home office Friday.
const WEEK = {
  "2026-10-05": ["09:00", "12:00", "13:00", "18:00"], // 8h, break 1h
  "2026-10-06": ["08:30", "12:30", "13:30", "18:30"], // 9h, break 1h
  "2026-10-08": ["09:00", "12:00", "13:00"], // incomplete, 3h
  "2026-10-09": ["10:00", "14:00", "14:30", "18:30"], // 8h, break 30m
}
const WEEK_META = [
  mode("2026-10-05", "presencial"),
  mode("2026-10-06", "presencial"),
  mode("2026-10-09", "home_office"),
]
const WEEK_RANGE = { from: "2026-10-05", to: "2026-10-09" }

describe("DayRecord spans", () => {
  it("keeps a shift that crosses midnight on its workday, past 1440", () => {
    const [day] = records({ "2026-10-05": ["22:00", "26:30"] })
    expect(day.spans).toEqual([{ start: 22 * 60, end: 26 * 60 + 30 }])
    expect(day.workedMinutes).toBe(4 * 60 + 30)
  })
})

describe("analyticsRange", () => {
  const days = records({ "2026-03-02": ["09:00", "17:00"], "2026-10-14": ["09:00", "17:00"] })

  it("goes back whole months and ends yesterday", () => {
    expect(analyticsRange("3m", TODAY, days)).toEqual({ from: "2026-08-01", to: "2026-10-14" })
    expect(analyticsRange("6m", TODAY, days)).toEqual({ from: "2026-05-01", to: "2026-10-14" })
  })

  it("never starts before the first punch", () => {
    expect(analyticsRange("12m", TODAY, days)?.from).toBe("2026-03-02")
    expect(analyticsRange("ano", TODAY, days)?.from).toBe("2026-03-02")
    expect(analyticsRange("tudo", TODAY, days)?.from).toBe("2026-03-02")
  })

  it("is null while there is no closed day", () => {
    expect(analyticsRange("tudo", "2026-03-02", days)).toBeNull()
    expect(analyticsRange("tudo", TODAY, [])).toBeNull()
  })
})

describe("periodSummary", () => {
  const days = records(WEEK, WEEK_META)
  const summary = periodSummary(days, WEEK_RANGE, 480)

  it("nets hours against the target, counting a day without punches as missing", () => {
    expect(summary.targetMinutes).toBe(5 * 480)
    expect(summary.workedMinutes).toBe(480 + 540 + 180 + 480)
    expect(summary.balanceMinutes).toBe(1680 - 2400)
    expect(summary.missingDays).toEqual(["2026-10-07"])
    expect(summary.incompleteDays).toEqual(["2026-10-08"])
    expect(summary.workedDays).toBe(4)
    expect(summary.workedDaysByMode).toEqual({ presencial: 2, home_office: 1 })
  })

  it("averages habits over closed days only", () => {
    expect(summary.habits).toEqual({
      days: 3,
      avgWorkedMinutes: 500,
      avgStart: (540 + 510 + 600) / 3,
      avgEnd: (1080 + 1110 + 1110) / 3,
      avgBreakMinutes: 50,
      onTargetRatio: 1,
    })
  })

  it("leaves holidays out of the target and of the hours", () => {
    const withHoliday = records(
      { ...WEEK, "2026-10-07": ["09:00", "11:00"] },
      [...WEEK_META, holiday("2026-10-07")],
    )
    const s = periodSummary(withHoliday, WEEK_RANGE, 480)
    expect(s.targetMinutes).toBe(4 * 480)
    expect(s.workedMinutes).toBe(1680)
    expect(s.missingDays).toEqual([])
  })
})

describe("habit breakdowns", () => {
  const closed = closedDays(records(WEEK, WEEK_META), WEEK_RANGE)

  it("groups by weekday, Monday first", () => {
    expect(weekdayProfile(closed, 480).map((w) => [w.weekday, w.stats.avgWorkedMinutes])).toEqual([
      [0, 480],
      [1, 540],
      [4, 480],
    ])
  })

  it("groups by work mode", () => {
    const modes = modeProfile(closed, 480)
    expect(modes.presencial).toMatchObject({ days: 2, avgWorkedMinutes: 510, avgStart: 525 })
    expect(modes.home_office).toMatchObject({ days: 1, avgWorkedMinutes: 480, avgStart: 600 })
  })

  it("measures how often each time of day was worked", () => {
    const points = occupancy(closed, 60)
    expect(points[0].minutes).toBe(8 * 60)
    expect(points.at(-1)?.minutes).toBe(19 * 60)
    const at = (h: number) => points.find((p) => p.minutes === h * 60)!
    expect(at(9).all).toBeCloseTo(2 / 3)
    expect(at(12)).toMatchObject({ presencial: 0.5, home_office: 1 })
    expect(at(19).all).toBe(0)
  })

  it("compares the latest days with the ones before only with enough data", () => {
    expect(habitShift(closed, 480, 2)).toBeNull()
    const shift = habitShift(closed, 480, 1)
    expect(shift?.recent.avgStart).toBe(600)
    expect(shift?.before.avgStart).toBe(525)
  })
})

describe("periodRecords", () => {
  it("finds the extremes and the streaks of days on target", () => {
    const r = periodRecords(records(WEEK, WEEK_META), WEEK_RANGE, 480)
    expect(r.longestDay).toEqual({ date: "2026-10-06", minutes: 540 })
    expect(r.shortestDay).toEqual({ date: "2026-10-05", minutes: 480 })
    expect(r.earliestStart).toEqual({ date: "2026-10-06", minutes: 510 })
    expect(r.latestEnd).toEqual({ date: "2026-10-06", minutes: 1110 })
    expect(r.longestBreak).toEqual({ date: "2026-10-05", minutes: 60 })
    expect(r.bestStreak).toEqual({ days: 2, from: "2026-10-05", to: "2026-10-06" })
    expect(r.currentStreak).toEqual({ days: 1, from: "2026-10-09", to: "2026-10-09" })
  })

  it("skips weekends and holidays inside a streak", () => {
    const days = records(
      { "2026-10-09": ["09:00", "17:00"], "2026-10-13": ["09:00", "17:00"] },
      [holiday("2026-10-12")],
    )
    const r = periodRecords(days, { from: "2026-10-09", to: "2026-10-13" }, 480)
    expect(r.currentStreak).toEqual({ days: 2, from: "2026-10-09", to: "2026-10-13" })
  })
})

describe("monthSeries", () => {
  const entries: Record<string, string[]> = {}
  for (const date of ["2026-09-01", "2026-09-02", "2026-09-30", "2026-10-01", "2026-10-14"]) {
    entries[date] = ["09:00", "12:00", "13:00", "18:30"]
  }
  const days = records(entries, [holiday("2026-09-07")])
  const series = monthSeries(days, { from: "2026-09-01", to: "2026-10-14" }, 480)

  it("matches the month view for a complete month", () => {
    const metrics = monthMetrics(days, "2026-09-01", 480)
    expect(series[0]).toMatchObject({
      month: "2026-09-01",
      partial: false,
      workedMinutes: metrics.totalMinutes,
      targetMinutes: metrics.targetMinutes,
      balanceMinutes: metrics.totalMinutes - metrics.targetMinutes,
      workedDays: 3,
    })
  })

  it("cuts the current month at the end of the range", () => {
    expect(series[1]).toMatchObject({ month: "2026-10-01", to: "2026-10-14", partial: true })
    expect(series[1].targetMinutes).toBe(10 * 480)
  })
})

describe("monthProjection", () => {
  it("repeats the month's average over the remaining business days", () => {
    const days = records(
      {
        "2026-10-01": ["09:00", "17:00"],
        "2026-10-02": ["09:00", "18:00"],
        "2026-10-05": ["09:00", "16:00"],
      },
      [holiday("2026-10-12")],
    )
    expect(monthProjection(days, TODAY, 480)).toEqual({
      month: "2026-10-01",
      workedMinutes: 1440,
      targetMinutes: 21 * 480,
      avgPerDayMinutes: 480,
      closedDays: 3,
      remainingDays: 12,
      projectedBalanceMinutes: 1440 + 480 * 12 - 21 * 480,
    })
  })

  it("waits for a few closed days", () => {
    const days = records({ "2026-10-01": ["09:00", "17:00"] })
    expect(monthProjection(days, TODAY, 480)).toBeNull()
    expect(monthProjection(days, "2026-10-01", 480)).toBeNull()
  })
})

describe("heatmapDays", () => {
  it("flags missing business days, holidays and incomplete days", () => {
    const days = records(WEEK, [...WEEK_META, holiday("2026-10-12")])
    const map = new Map(
      heatmapDays(days, { from: "2026-10-05", to: "2026-10-12" }).map((d) => [d.date, d]),
    )
    expect(map.get("2026-10-05")).toMatchObject({ workedMinutes: 480, missing: false })
    expect(map.get("2026-10-07")).toMatchObject({ workedMinutes: 0, missing: true })
    expect(map.get("2026-10-08")).toMatchObject({ incomplete: true, workedMinutes: 180 })
    expect(map.get("2026-10-10")).toMatchObject({ missing: false })
    expect(map.get("2026-10-12")).toMatchObject({ isHoliday: true, missing: false })
  })
})
