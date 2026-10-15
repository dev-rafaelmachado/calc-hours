import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"

import { buildDayRecords } from "@/lib/domain/days"
import { zonedInstant, type Punch } from "@/lib/domain/punches"
import { remunerationBreakdown } from "@/lib/domain/remuneration"
import { parseHHMM } from "@/lib/domain/time"

import { buildMonthlyReport } from "./excel"
import { buildMonthRows } from "./month-rows"

const TZ = "America/Sao_Paulo"

function punches(date: string, times: string[]): Punch[] {
  return times.map((t, i) => ({
    id: Number(date.replaceAll("-", "")) * 10 + i,
    punchedAt: zonedInstant(date, parseHHMM(t), TZ).toISOString(),
    workDate: date,
    source: "manual",
  }))
}

describe("buildMonthlyReport", () => {
  it("writes the Horas and Valores sheets with punches, holidays and totals", async () => {
    const all = [
      ...punches("2026-10-13", ["08:00", "12:00", "13:00", "15:30", "16:00", "18:10"]),
      ...punches("2026-10-14", ["09:00", "17:00"]),
    ]
    const meta = [
      { workDate: "2026-10-12", isHoliday: true, workMode: null },
      { workDate: "2026-10-13", isHoliday: false, workMode: "presencial" as const },
    ]
    const days = buildDayRecords(all, meta, { today: "2026-10-20", now: new Date(), timeZone: TZ })
    const config = { valorBase: 1000, valorHora: 10, valorBonus: 0, valorAuxTransporte: 20 }
    const breakdown = remunerationBreakdown(days, "2026-10-01", config, 480, { bonusApplied: false })

    const buffer = await buildMonthlyReport({
      rows: buildMonthRows("2026-10-01", days, all, TZ),
      config,
      breakdown,
      pixKey: "chave-pix-teste",
    })

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    expect(workbook.worksheets.map((ws) => ws.name)).toEqual(["Horas", "Valores"])

    const horas = workbook.getWorksheet("Horas")!
    expect(horas.getRow(1).getCell(3).value).toBe("Marcações")
    const values = (row: number) => (horas.getRow(row).values as unknown[]).slice(1)
    expect(values(2)).toEqual(["12/10/2026", "Segunda", "", "", "Feriado", "00:00", "Sim"])
    expect(values(3)).toEqual([
      "13/10/2026",
      "Terça",
      "08:00–12:00 · 13:00–15:30 · 16:00–18:10",
      "01:30",
      "Presencial",
      "08:40",
      "Não",
    ])
    expect(values(6)[0]).toBe("Total do mês")
    expect(values(6)[5]).toBe("16:40")

    const valores = workbook.getWorksheet("Valores")!
    const lastRow = valores.getRow(valores.rowCount)
    expect(lastRow.getCell(1).value).toBe("Chave PIX")
    expect(lastRow.getCell(2).value).toBe("chave-pix-teste")
  })
})
