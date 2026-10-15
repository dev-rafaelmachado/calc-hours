import { describe, expect, it } from "vitest"

import { buildDayRecords } from "./days"
import { forecastCurrentWeek, rebalancePlanMinutes, todayProjection } from "./forecast"
import { localDate, localMinutes, summarizeDay, zonedInstant, type Punch } from "./punches"
import { parseHHMM, roundHalfEven } from "./time"

const TZ = "America/Sao_Paulo"

function punchesAt(date: string, times: string[], workDate = date): Punch[] {
  return times.map((time, i) => ({
    id: i + 1,
    punchedAt: zonedInstant(date, parseHHMM(time), TZ).toISOString(),
    workDate,
    source: "manual",
  }))
}

const at = (date: string, time: string) => zonedInstant(date, parseHHMM(time), TZ)

describe("summarizeDay", () => {
  it("sums any number of in/out pairs and reports the breaks", () => {
    const day = summarizeDay(
      punchesAt("2026-10-14", ["08:00", "12:00", "13:00", "15:30", "16:00", "18:10"]),
      { isToday: false, now: at("2026-10-15", "09:00") },
    )
    expect(day.workedMinutes).toBe(4 * 60 + 150 + 130)
    expect(day.breakMinutes).toBe(60 + 30)
    expect(day.intervals).toHaveLength(3)
    expect(day.status).toBe("closed")
    expect(day.nextPunch).toBe("in")
  })

  it("ignores input order", () => {
    const ordered = punchesAt("2026-10-14", ["08:00", "12:00", "13:00", "17:00"])
    const shuffled = [ordered[2], ordered[0], ordered[3], ordered[1]]
    const day = summarizeDay(shuffled, { isToday: false, now: new Date() })
    expect(day.workedMinutes).toBe(8 * 60)
  })

  it("counts the open interval until now when today has an odd count", () => {
    const day = summarizeDay(punchesAt("2026-10-14", ["08:00", "12:00", "13:00"]), {
      isToday: true,
      now: at("2026-10-14", "14:25"),
    })
    expect(day.status).toBe("working")
    expect(day.nextPunch).toBe("out")
    expect(day.workedMinutes).toBe(4 * 60 + 85)
    expect(day.intervals.at(-1)?.end).toBeNull()
  })

  it("marks a past day with an odd count as incomplete and counts only closed pairs", () => {
    const day = summarizeDay(punchesAt("2026-10-13", ["08:00", "12:00", "13:00"]), {
      isToday: false,
      now: at("2026-10-14", "10:00"),
    })
    expect(day.status).toBe("incomplete")
    expect(day.workedMinutes).toBe(4 * 60)
  })

  it("reports 'out' for an even count today and 'empty' without punches", () => {
    const now = at("2026-10-14", "12:30")
    expect(
      summarizeDay(punchesAt("2026-10-14", ["08:00", "12:00"]), { isToday: true, now }).status,
    ).toBe("out")
    expect(summarizeDay([], { isToday: true, now }).status).toBe("empty")
  })

  it("handles a shift that crosses midnight", () => {
    const punches = [
      ...punchesAt("2026-10-14", ["22:00"], "2026-10-14"),
      ...punchesAt("2026-10-15", ["02:30"], "2026-10-14"),
    ]
    const day = summarizeDay(punches, { isToday: false, now: at("2026-10-16", "09:00") })
    expect(day.workedMinutes).toBe(4 * 60 + 30)
  })

  it("floors seconds after summing, not per interval", () => {
    const base = Date.parse("2026-10-14T11:00:00.000Z")
    const punches: Punch[] = [0, 90_000, 120_000, 210_000].map((offset, i) => ({
      id: i,
      punchedAt: new Date(base + offset).toISOString(),
      workDate: "2026-10-14",
      source: "solides",
    }))
    // 1.5 min + 1.5 min = 3 min (flooring each would give 2)
    expect(summarizeDay(punches, { isToday: false, now: new Date() }).workedMinutes).toBe(3)
  })
})

describe("timezone helpers", () => {
  it("round-trips local date and minutes in São Paulo", () => {
    const instant = at("2026-10-14", "23:45")
    expect(instant.toISOString()).toBe("2026-10-15T02:45:00.000Z")
    expect(localDate(instant, TZ)).toBe("2026-10-14")
    expect(localMinutes(instant, TZ)).toBe(23 * 60 + 45)
  })
})

describe("rebalancePlanMinutes", () => {
  // Expected values checked against hours_app.services._rebalance_plan_minutes.
  it("adds round-robin; each removal pass takes a minute from every positive row, largest first", () => {
    const up = [{ minutes: 10 }, { minutes: 10 }]
    rebalancePlanMinutes(up, 23)
    expect(up.map((r) => r.minutes)).toEqual([12, 11])

    const down = [{ minutes: 10 }, { minutes: 5 }, { minutes: 10 }]
    rebalancePlanMinutes(down, 21)
    expect(down.map((r) => r.minutes)).toEqual([8, 4, 9])
  })
})

describe("roundHalfEven", () => {
  it("matches Python's round()", () => {
    expect([0.5, 1.5, 2.5, 2.4, 2.6, 481.5].map(roundHalfEven)).toEqual([0, 2, 2, 2, 3, 482])
  })
})

describe("deviations from the legacy app (intentional)", () => {
  const today = "2026-10-14" // Wednesday
  const now = at(today, "10:00")

  it("does not treat a metadata-only day as done", () => {
    const days = buildDayRecords(
      punchesAt("2026-10-13", ["08:00", "12:00", "13:00", "17:00"]),
      [{ workDate: "2026-10-15", isHoliday: false, workMode: "presencial" }],
      { today, now, timeZone: TZ },
    )
    const { plan } = forecastCurrentWeek(days, today, 480)
    expect(plan.map((r) => r.date)).toContain("2026-10-15")
  })

  it("projects the exit from the open interval", () => {
    const days = buildDayRecords(
      [
        ...punchesAt("2026-10-13", ["08:00", "12:00", "13:00", "17:00"]),
        ...punchesAt(today, ["08:00"]),
      ],
      [],
      { today, now, timeZone: TZ },
    )
    const projection = todayProjection(days, today, 10 * 60, 480)
    expect(projection.workedMinutes).toBe(120)
    expect(projection.remainingMinutes).toBe(projection.suggestedMinutes - 120)
    expect(projection.expectedEndMinutes).toBe(10 * 60 + projection.remainingMinutes)
  })

  it("gives no target on a holiday today", () => {
    const days = buildDayRecords(
      punchesAt("2026-10-13", ["08:00", "17:00"]),
      [{ workDate: today, isHoliday: true, workMode: null }],
      { today, now, timeZone: TZ },
    )
    const projection = todayProjection(days, today, 10 * 60, 480)
    expect(projection.suggestedMinutes).toBe(0)
    expect(projection.expectedEndMinutes).toBeNull()
  })
})
