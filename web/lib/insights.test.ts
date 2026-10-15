import { describe, expect, it } from "vitest"

import type { HabitStats } from "./domain/analytics"
import { buildInsights, type InsightInput } from "./insights"

const stats = (over: Partial<HabitStats> = {}): HabitStats => ({
  days: 10,
  avgWorkedMinutes: 480,
  avgStart: 9 * 60,
  avgEnd: 18 * 60,
  avgBreakMinutes: 60,
  onTargetRatio: 0.5,
  ...over,
})

const base: InsightInput = {
  dayTargetMinutes: 480,
  summary: {
    workedMinutes: 0,
    targetMinutes: 0,
    balanceMinutes: 0,
    workedDays: 0,
    habits: null,
    missingDays: [],
    incompleteDays: [],
    workedDaysByMode: { presencial: 0, home_office: 0 },
  },
  months: [],
  weekdays: [],
  modes: { presencial: null, home_office: null },
  records: {
    longestDay: null,
    shortestDay: null,
    earliestStart: null,
    latestEnd: null,
    longestBreak: null,
    bestStreak: null,
    currentStreak: null,
  },
  shift: null,
  projection: null,
  closed: [],
}

const titles = (input: Partial<InsightInput>) =>
  buildInsights({ ...base, ...input }).map((i) => i.title)

describe("buildInsights", () => {
  it("says nothing without data", () => {
    expect(buildInsights(base)).toEqual([])
  })

  it("projects the month and says what it takes to break even", () => {
    const [insight] = buildInsights({
      ...base,
      projection: {
        month: "2026-10-01",
        workedMinutes: 1440,
        targetMinutes: 10080,
        avgPerDayMinutes: 480,
        closedDays: 3,
        remainingDays: 12,
        projectedBalanceMinutes: -2880,
      },
    })
    expect(insight).toMatchObject({
      tone: "warning",
      title: "No ritmo de outubro, o mês fecha faltando 48h 00m",
    })
    expect(insight.detail).toContain("Para zerar, são 12h 00m por dia.")
  })

  it("points to the latest day without punches", () => {
    const [insight] = buildInsights({
      ...base,
      summary: { ...base.summary, missingDays: ["2026-10-07", "2026-10-13"], incompleteDays: ["2026-10-08"] },
    })
    expect(insight.title).toBe("2 dias úteis sem batida e 1 dia incompleto no período")
    expect(insight.href).toBe("/registros?m=2026-10&d=2026-10-13")
  })

  it("compares work modes only when both have enough days", () => {
    const modes = {
      presencial: stats({ avgStart: 8 * 60 + 25 }),
      home_office: stats({ avgStart: 9 * 60 }),
    }
    expect(titles({ modes })).toEqual(["Nos dias presenciais você começa 35 min mais cedo"])
    expect(titles({ modes: { ...modes, home_office: stats({ days: 4 }) } })).toEqual([])
  })

  it("names the shortest weekday when the gap is relevant", () => {
    const weekdays = [
      { weekday: 0, stats: stats({ avgWorkedMinutes: 520 }) },
      { weekday: 2, stats: stats() },
      { weekday: 4, stats: stats({ avgWorkedMinutes: 440 }) },
    ]
    expect(titles({ weekdays })).toEqual(["Sexta é o seu dia mais curto: 7h 20m em média"])
    const flat = weekdays.map((w) => ({ ...w, stats: stats() }))
    expect(titles({ weekdays: flat })).toEqual([])
  })

  it("ranks only complete months", () => {
    const month = (m: string, balance: number, partial = false) => ({
      month: m,
      from: m,
      to: m,
      partial,
      workedMinutes: 0,
      targetMinutes: 0,
      balanceMinutes: balance,
      workedDays: 0,
      presencialDays: 0,
      habits: null,
    })
    const [insight] = buildInsights({
      ...base,
      months: [month("2026-08-01", -190), month("2026-09-01", 634), month("2026-10-01", 900, true)],
    })
    expect(insight.title).toBe("Melhor mês: setembro, com +10h 34m")
    expect(insight.detail).toBe("O pior foi agosto, com -3h 10m.")
  })

  it("reports a recent change in the start time", () => {
    const shift = { recent: stats({ avgStart: 9 * 60 + 40 }), before: stats({ avgStart: 9 * 60 + 15 }) }
    expect(titles({ shift })).toEqual([
      "Nos últimos 10 dias trabalhados você está começando 25 min mais tarde",
    ])
    expect(titles({ shift: { ...shift, recent: stats({ avgStart: 9 * 60 + 20 }) } })).toEqual([])
  })

  it("celebrates the current streak and keeps the record in view", () => {
    const records = {
      ...base.records,
      bestStreak: { days: 11, from: "2026-09-01", to: "2026-09-15" },
      currentStreak: { days: 4, from: "2026-10-08", to: "2026-10-14" },
    }
    const [insight] = buildInsights({ ...base, records })
    expect(insight.title).toBe("4 dias úteis seguidos batendo a meta")
    expect(insight.detail).toBe("Seu recorde no período é 11, de 01/09 a 15/09.")
  })
})
