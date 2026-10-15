import { describe, expect, it } from "vitest"

import { zonedInstant, type Punch } from "@/lib/domain/punches"
import { parseHHMM } from "@/lib/domain/time"

import { parseSolidesTimesheet, planSolidesImport } from "./solides"

const TZ = "America/Sao_Paulo"

// Same layout as the text Chrome copies from "Apropriação de horas"
// (anonymized: names, addresses and company replaced).
const PASTE = `
Ação    Status    Entrada Saída    Total Horas    Anexos        Local Entrada    Local Saída    Descrição

01/09/2026 - Terça
TRABALHANDO

09:01

13:13
04:12

Escolha
 Sede Empresa     Sede Empresa
TRABALHANDO

14:13

19:31
05:18

Escolha
 Sede Empresa     Sede Empresa
Trabalhadas:
09:30    Total de Intervalos:
01:00
Total Previsto:
09:00
Saldo do dia:
00:30

02/09/2026 - Quarta
TRABALHANDO

09:32

13:30
03:58

Escolha
 Rua Exemplo, 100 - Cidade     Rua Exemplo, 100 - Cidade
TRABALHANDO
 Editado Manualmente
17:22

20:47
03:25

Escolha
 Rua Exemplo, 100 - Cidade
Trabalhadas:
07:23    Total de Intervalos:
03:52
Total Previsto:
09:00
Saldo do dia:
-01:37

05/09/2026 - Sábado
Total de Intervalos:

Total Previsto:
Saldo do dia:
00:00

07/09/2026 - Segunda (FERIADO)
Total de Intervalos:

Total Previsto:
Saldo do dia:
00:00

09/09/2026 - Quarta
TRABALHANDO

09:11

13:26
04:15

Escolha
 Home Office Fulano     Home Office Fulano
Trabalhadas:
04:15    Total de Intervalos:

Total Previsto:
09:00
Saldo do dia:
-04:45
`

const m = (hhmm: string) => parseHHMM(hhmm)

describe("parseSolidesTimesheet", () => {
  const days = parseSolidesTimesheet(PASTE)

  it("reads every day, including empty ones and holidays", () => {
    expect(days.map((d) => [d.date, d.isHoliday, d.intervals.length])).toEqual([
      ["2026-09-01", false, 2],
      ["2026-09-02", false, 2],
      ["2026-09-05", false, 0],
      ["2026-09-07", true, 0],
      ["2026-09-09", false, 1],
    ])
  })

  it("keeps entry and exit, drops the interval total and flags manual edits", () => {
    expect(days[1].intervals).toEqual([
      { start: m("09:32"), end: m("13:30"), edited: false },
      { start: m("17:22"), end: m("20:47"), edited: true },
    ])
  })

  it("cross-checks with 'Trabalhadas' and infers the mode from the locations", () => {
    expect(days.map((d) => d.reportedMinutes)).toEqual([570, 443, null, null, 255])
    expect(days.flatMap((d) => d.warnings)).toEqual([])
    expect(days.map((d) => d.workMode)).toEqual(["presencial", null, null, null, "home_office"])
  })

  it("handles a shift past midnight", () => {
    const [day] = parseSolidesTimesheet("10/09/2026 - Quinta\nTRABALHANDO\n22:00\n02:30\n04:30\nTrabalhadas:\n04:30")
    expect(day.intervals).toEqual([{ start: m("22:00"), end: m("02:30"), edited: false }])
    expect(day.warnings).toEqual([])
  })

  it("keeps an open interval and warns about times that don't add up", () => {
    const [open] = parseSolidesTimesheet("14/10/2026 - Quarta\nTRABALHANDO\n09:00")
    expect(open.intervals).toEqual([{ start: m("09:00"), end: null, edited: false }])

    const [broken] = parseSolidesTimesheet(
      "11/09/2026 - Sexta\nTRABALHANDO\n09:00\n12:00\n02:00\nTrabalhadas:\n03:00",
    )
    expect(broken.warnings.length).toBeGreaterThan(0)
  })
})

describe("planSolidesImport", () => {
  const instant = (date: string, time: string) => zonedInstant(date, m(time), TZ).toISOString()
  const punch = (id: number, date: string, time: string, source: Punch["source"] = "manual"): Punch => ({
    id,
    punchedAt: instant(date, time),
    workDate: date,
    source,
  })
  const days = parseSolidesTimesheet(PASTE)
  const plan = (existing: Punch[], meta = [] as Parameters<typeof planSolidesImport>[2], today = "2026-10-14") =>
    planSolidesImport(days, existing, meta, { today, timeZone: TZ })

  it("inserts days the app doesn't have", () => {
    const first = plan([])[0]
    expect(first.action).toBe("new")
    expect(first.insert.map((i) => i.punchedAt)).toEqual(
      ["09:01", "13:13", "14:13", "19:31"].map((t) => instant("2026-09-01", t)),
    )
  })

  it("replaces a closed day with what Sólides says", () => {
    const existing = [
      punch(1, "2026-09-01", "09:01"),
      punch(2, "2026-09-01", "13:00"),
      punch(3, "2026-09-01", "14:13"),
      punch(4, "2026-09-01", "19:31"),
    ]
    const first = plan(existing)[0]
    expect(first.action).toBe("replace")
    expect(first.deleteIds).toEqual([2])
    expect(first.insert.map((i) => i.punchedAt)).toEqual([instant("2026-09-01", "13:13")])
    expect(first.relabelIds).toEqual([1, 3, 4])
  })

  it("reports identical days as unchanged", () => {
    const existing = ["09:01", "13:13", "14:13", "19:31"].map((t, i) => punch(i + 1, "2026-09-01", t, "solides"))
    const first = plan(existing)[0]
    expect(first).toMatchObject({ action: "same", insert: [], deleteIds: [], relabelIds: [] })
  })

  it("keeps the app's punches when Sólides has none for the day", () => {
    const saturday = plan([punch(9, "2026-09-05", "10:00"), punch(10, "2026-09-05", "12:00")])[2]
    expect(saturday).toMatchObject({ action: "skip", insert: [], deleteIds: [] })
  })

  it("merges today, dropping manual punches within 5 minutes of an imported one", () => {
    const todayPaste = parseSolidesTimesheet("14/10/2026 - Quarta\nTRABALHANDO\n09:00\n12:00\n03:00\nTRABALHANDO\n13:00")
    const [today] = planSolidesImport(
      todayPaste,
      [punch(1, "2026-10-14", "09:03"), punch(2, "2026-10-14", "12:30")],
      [],
      { today: "2026-10-14", timeZone: TZ },
    )
    expect(today.action).toBe("merge")
    expect(today.deleteIds).toEqual([1])
    expect(today.insert).toHaveLength(3)
  })

  it("adds holidays and fills the work mode only when it is empty", () => {
    const result = plan([], [
      { workDate: "2026-09-01", isHoliday: false, workMode: "home_office" },
      { workDate: "2026-09-09", isHoliday: false, workMode: null },
    ])
    expect(result[0].meta).toBeNull()
    expect(result[3].meta).toEqual({ workDate: "2026-09-07", isHoliday: true, workMode: null })
    expect(result[4].meta).toEqual({ workDate: "2026-09-09", isHoliday: false, workMode: "home_office" })
  })
})
