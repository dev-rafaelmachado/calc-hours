import type { NextRequest } from "next/server"

import { loadWorkspace } from "@/lib/data/repository"
import { monthStart } from "@/lib/domain/dates"
import { monthMetrics } from "@/lib/domain/month"
import { metricsCsv } from "@/lib/report/csv"
import { monthParam } from "@/lib/search-params"

export async function GET(request: NextRequest) {
  const ws = await loadWorkspace()
  const month = monthParam(request.nextUrl.searchParams.get("m") ?? undefined, monthStart(ws.today))
  const csv = metricsCsv(monthMetrics(ws.days, month, ws.settings.dayTargetMinutes))
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="metricas_mes_${month.slice(0, 7).replace("-", "_")}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
