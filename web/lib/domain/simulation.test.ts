import { describe, expect, it } from "vitest"

import { simulateWeek } from "./simulation"

describe("simulateWeek", () => {
  const days = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]

  it("uses overtime to pay previous debt before counting extra hours", () => {
    const result = simulateWeek({
      days: days.map((date) => ({ date, minutes: 510 })),
      today: "2026-10-14",
      weekTargetMinutes: 2400,
      previousWeeksDebt: 120,
    })
    expect(result).toEqual({
      totalMinutes: 2550,
      workedUntilTodayMinutes: 1530,
      missingMinutes: 0,
      compensationRemainingMinutes: 0,
      extraMinutes: 30,
    })
  })

  it("keeps the remaining debt when the week falls short", () => {
    const result = simulateWeek({
      days: days.map((date) => ({ date, minutes: 450 })),
      today: "2026-10-16",
      weekTargetMinutes: 2400,
      previousWeeksDebt: 60,
    })
    expect(result.missingMinutes).toBe(150)
    expect(result.compensationRemainingMinutes).toBe(60)
    expect(result.extraMinutes).toBe(0)
  })
})
