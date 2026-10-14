// Monthly Excel report, ported from hours_app/report.py.
// - "Horas": days with punches in the month, holidays highlighted, month total.
// - "Valores": pay constants, the itemized month, the invoice total and PIX key.
// With punches, the fixed lunch columns become "Marcações" and "Pausas".

import ExcelJS from "exceljs"

import type { RemunerationBreakdown, RemunerationConfig } from "@/lib/domain/remuneration"
import { minutesToDuration } from "@/lib/domain/time"
import { formatCurrency, formatHours } from "@/lib/format"

import type { MonthRow } from "./month-rows"

const CURRENCY_FORMAT = '"R$" #,##0.00'
const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } })
const HEADER_FILL = fill("FF1F4E78")
const HOLIDAY_FILL = fill("FFFCE4A6")
const TOTAL_FILL = fill("FFDDEBF7")
const SECTION_FILL = fill("FFE2EFDA")
const THIN = { style: "thin", color: { argb: "FFBFBFBF" } } as const
const BORDER: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN }

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.alignment = { horizontal: "center", vertical: "middle" }
    cell.border = BORDER
  })
}

function buildHorasSheet(ws: ExcelJS.Worksheet, rows: MonthRow[]) {
  const headers = ["Dia", "Dia da semana", "Marcações", "Pausas", "Modalidade", "Total (HH:MM)", "Feriado"]
  styleHeader(ws.addRow(headers))
  const totalCol = headers.indexOf("Total (HH:MM)") + 1

  for (const r of rows) {
    const row = ws.addRow([
      r.dia,
      r.diaSemana,
      r.marcacoes,
      r.pausas,
      r.modalidade,
      r.total,
      r.isHoliday ? "Sim" : "Não",
    ])
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = BORDER
      cell.alignment = { horizontal: "center" }
      if (r.isHoliday) cell.fill = HOLIDAY_FILL
    })
    row.getCell(totalCol).font = { bold: true }
  }

  ws.addRow([])
  const totalMinutes = rows.reduce((sum, r) => sum + r.minutes, 0)
  const totalRow = ws.addRow(["Total do mês", "", "", "", "", minutesToDuration(totalMinutes), ""])
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = TOTAL_FILL
    cell.font = { bold: true }
    cell.border = BORDER
  })

  ;[12, 14, 42, 9, 14, 14, 9].forEach((width, i) => (ws.getColumn(i + 1).width = width))
  ws.views = [{ state: "frozen", ySplit: 1 }]
}

function buildValoresSheet(
  ws: ExcelJS.Worksheet,
  config: RemunerationConfig,
  b: RemunerationBreakdown,
  pixKey: string,
) {
  const section = (text: string) => {
    const cell = ws.addRow([text]).getCell(1)
    cell.font = { bold: true }
    cell.fill = SECTION_FILL
  }
  const money = (row: ExcelJS.Row, col: number, value: number) => {
    const cell = row.getCell(col)
    cell.value = value
    cell.numFmt = CURRENCY_FORMAT
  }

  section("Constantes de remuneração")
  styleHeader(ws.addRow(["Constante", "Valor", "Descrição"]))
  const constants: [string, number, string][] = [
    ["Remuneração base", config.valorBase, "Valor fixo mensal"],
    ["Valor hora (ajuste)", config.valorHora, "R$ por hora trabalhada a mais ou a menos vs. a meta"],
    ["Auxílio transporte", config.valorAuxTransporte, "R$ por dia trabalhado presencialmente"],
    ["Bonificação (meta)", config.valorBonus, "Aplicada quando a meta do mês é batida"],
  ]
  for (const [name, value, description] of constants) {
    money(ws.addRow([name, null, description]), 2, value)
  }

  ws.addRow([])
  section("Remuneração do mês (discriminada)")
  styleHeader(ws.addRow(["Item", "Detalhe", "Valor"]))

  const hoursDetail =
    b.horasExcedentes > 0
      ? `${formatHours(b.horasExcedentes)}h extras × ${formatCurrency(config.valorHora)}`
      : b.horasFaltantes > 0
        ? `-${formatHours(b.horasFaltantes)}h faltantes × ${formatCurrency(config.valorHora)}`
        : "Sem ajuste (meta exata)"
  const lines: [string, string, number][] = [
    ["Remuneração base", "", b.valorBase],
    ["Ajuste de horas trabalhadas", hoursDetail, b.ajusteHoras],
    ["Bonificação", b.bonusTotal > 0 ? "Bateu a meta" : "Não bateu a meta", b.bonusTotal],
    [
      "Dias presenciais",
      `${b.presencialDays} dia(s) × ${formatCurrency(config.valorAuxTransporte)}`,
      b.auxTransporteTotal,
    ],
  ]
  for (const [item, detail, value] of lines) money(ws.addRow([item, detail, null]), 3, value)

  const total = ws.addRow(["Total da remuneração", "", null])
  money(total, 3, b.totalRemuneracao)
  total.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true }
    cell.fill = TOTAL_FILL
  })

  ws.addRow([])
  section("Nota fiscal")
  const nf = ws.addRow(["Valor total da NF", "", null])
  money(nf, 3, b.totalRemuneracao)
  nf.eachCell({ includeEmpty: true }, (cell) => (cell.font = { bold: true }))
  ws.addRow(["Chave PIX", pixKey, ""]).getCell(1).font = { bold: true }

  ;[28, 44, 16].forEach((width, i) => (ws.getColumn(i + 1).width = width))
}

export async function buildMonthlyReport({
  rows,
  config,
  breakdown,
  pixKey,
}: {
  rows: MonthRow[]
  config: RemunerationConfig
  breakdown: RemunerationBreakdown
  pixKey: string
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  buildHorasSheet(workbook.addWorksheet("Horas"), rows)
  buildValoresSheet(workbook.addWorksheet("Valores"), config, breakdown, pixKey)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
