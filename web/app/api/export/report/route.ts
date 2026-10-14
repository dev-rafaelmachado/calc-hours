import type { NextRequest } from "next/server"

import { loadWorkspace } from "@/lib/data/repository"
import { monthStart } from "@/lib/domain/dates"
import { remunerationBreakdown } from "@/lib/domain/remuneration"
import { buildMonthlyReport } from "@/lib/report/excel"
import { buildMonthRows } from "@/lib/report/month-rows"
import { monthParam } from "@/lib/search-params"

export async function GET(request: NextRequest) {
  const ws = await loadWorkspace()
  const { settings } = ws
  const month = monthParam(request.nextUrl.searchParams.get("m") ?? undefined, monthStart(ws.today))
  const config = {
    valorBase: settings.valorBase,
    valorHora: settings.valorHora,
    valorBonus: settings.valorBonus,
    valorAuxTransporte: settings.valorAuxTransporte,
  }
  const breakdown = remunerationBreakdown(ws.days, month, config, settings.dayTargetMinutes, {
    bonusApplied: request.nextUrl.searchParams.get("bonus") === "1",
  })
  const file = await buildMonthlyReport({
    rows: buildMonthRows(month, ws.days, ws.punches, settings.timezone),
    config,
    breakdown,
    pixKey: settings.pixKey,
  })

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="relatorio_jornada_${month.slice(0, 7).replace("-", "_")}.xlsx"`,
      "Cache-Control": "no-store",
    },
  })
}
