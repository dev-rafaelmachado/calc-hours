import { describe, expect, it } from "vitest"

import { parsePunchesCsv } from "./csv"

const m = (hhmm: string) => {
  const [h, min] = hhmm.split(":").map(Number)
  return h * 60 + min
}

describe("parsePunchesCsv", () => {
  it("reads one punch per row, in ISO or Brazilian dates", () => {
    const result = parsePunchesCsv("data,hora\n2026-10-14,08:02\n14/10/2026,12:01\n2026-10-14,xx")
    expect(result.punches).toEqual([
      { date: "2026-10-14", minutes: m("08:02") },
      { date: "2026-10-14", minutes: m("12:01") },
    ])
    expect(result.skippedRows).toBe(1)
  })

  it("converts legacy rows with a date column into 4 punches", () => {
    const result = parsePunchesCsv(
      "date,start,lunchStart,lunchEnd,end\n2026-03-02,8:00,12:00,13:00,17:00",
    )
    expect(result.punches.map((p) => p.minutes)).toEqual([m("08:00"), m("12:00"), m("13:00"), m("17:00")])
  })

  it("places legacy weekday rows on the reference week", () => {
    const result = parsePunchesCsv(
      "day,start,lunchStart,lunchEnd,end\nwednesday,08:00,12:00,13:00,17:00",
      "2026-03-02",
    )
    expect(new Set(result.punches.map((p) => p.date))).toEqual(new Set(["2026-03-04"]))
  })

  it("collapses a zero-length lunch into a single interval", () => {
    const result = parsePunchesCsv(
      "date,start,lunch_start,lunch_end,end\n2026-06-27,09:32,13:15,13:15,13:15\n2026-05-30,14:43,14:43,14:43,22:37",
    )
    expect(result.punches).toEqual([
      { date: "2026-06-27", minutes: m("09:32") },
      { date: "2026-06-27", minutes: m("13:15") },
      { date: "2026-05-30", minutes: m("14:43") },
      { date: "2026-05-30", minutes: m("22:37") },
    ])
  })

  it("skips legacy rows without a resolvable date", () => {
    const result = parsePunchesCsv("day,start,lunchStart,lunchEnd,end\nmonday,08:00,12:00,13:00,17:00")
    expect(result).toEqual({ punches: [], skippedRows: 1 })
  })
})
