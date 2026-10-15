// Rules that intentionally differ from the legacy app (decided on 2026-10-14):
// compensation is the month's net balance, and month weeks crossing the
// boundary use a proportional target.

import { describe, expect, it } from "vitest"

import type { DayRecord } from "./days"
import { forecastCurrentWeek } from "./forecast"
import { monthMetrics } from "./month"
import { previousWeeksDebt } from "./week"

function day(date: string, minutes: number, extra: Partial<DayRecord> = {}): DayRecord {
  return {
    date,
    workedMinutes: minutes,
    breakMinutes: 60,
    hasPunches: minutes > 0,
    firstInMinutes: minutes > 0 ? 9 * 60 : null,
    status: minutes > 0 ? "closed" : "empty",
    isHoliday: false,
    workMode: null,
    ...extra,
  }
}

const week = (monday: string, minutesPerDay: number[]) =>
  minutesPerDay.map((m, i) => {
    const d = new Date(`${monday}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    return day(d.toISOString().slice(0, 10), m)
  })

describe("previousWeeksDebt (month balance)", () => {
  // October 2026: Thu 1st, Fri 2nd, then full weeks from Mon 5th.
  it("nets overtime against missing hours inside the month", () => {
    const days = [
      ...week("2026-10-01", [480, 480]), // Thu-Fri on target
      ...week("2026-10-05", [540, 540, 540, 540, 540]), // +5h
      ...week("2026-10-12", [420, 420, 420, 420, 420]), // -5h
    ]
    expect(previousWeeksDebt(days, "2026-10-19", 480, "2026-10-21")).toBe(0)
  })

  it("counts an unrecorded business day as missing and skips holidays", () => {
    const days = [
      ...week("2026-10-01", [480, 480]),
      ...week("2026-10-05", [480, 0, 480, 480, 480]), // Tuesday not recorded
      day("2026-10-12", 0, { isHoliday: true }),
      ...week("2026-10-13", [480, 480, 480, 480]),
    ]
    expect(previousWeeksDebt(days, "2026-10-19", 480, "2026-10-20")).toBe(480)
  })

  it("only counts the part of a week that falls inside the month", () => {
    // Week of Mon 28/09: Mon-Wed are September (ignored), Thu-Fri are October.
    const days = [...week("2026-09-28", [0, 0, 0, 480, 300])]
    expect(previousWeeksDebt(days, "2026-10-05", 480, "2026-10-07")).toBe(180)
  })

  it("resets at the start of a month", () => {
    // A whole missing week in September does not carry into October: only
    // October's Thu 1st and Fri 2nd (16h, unrecorded) count.
    const days = week("2026-09-21", [0, 0, 0, 0, 0])
    expect(previousWeeksDebt(days, "2026-10-05", 480, "2026-10-06")).toBe(960)
  })

  it("is zero when the current week starts before the 1st", () => {
    expect(previousWeeksDebt([], "2026-09-28", 480, "2026-10-01")).toBe(0)
  })

  it("feeds the forecast by default", () => {
    const days = [...week("2026-10-01", [480, 480]), ...week("2026-10-05", [420, 420, 420, 420, 420])]
    const { details } = forecastCurrentWeek(days, "2026-10-12", 480)
    expect(details.previousWeeksDebt).toBe(300)
    expect(details.targetToPlan).toBe(2400 + 300)
  })
})

describe("monthMetrics boundary weeks", () => {
  it("cuts a week crossing the month end to the days inside the month", () => {
    const days = [...week("2026-08-24", [480, 480, 480, 480, 480]), day("2026-08-31", 530)]
    const { weeks } = monthMetrics(days, "2026-08-01", 480)
    expect(weeks.at(-1)).toEqual({
      weekStart: "2026-08-31",
      weekEnd: "2026-08-31",
      workedMinutes: 530,
      targetMinutes: 480,
      extraMinutes: 50,
      debtMinutes: 0,
    })
  })

  it("cuts a week crossing the month start", () => {
    const days = week("2026-09-28", [480, 480, 480, 480, 480])
    const { weeks } = monthMetrics(days, "2026-10-01", 480)
    expect(weeks[0]).toMatchObject({
      weekStart: "2026-10-01",
      weekEnd: "2026-10-04",
      workedMinutes: 960,
      targetMinutes: 960,
      debtMinutes: 0,
    })
  })
})
