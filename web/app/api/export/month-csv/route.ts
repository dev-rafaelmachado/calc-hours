import type { NextRequest } from "next/server"

import { loadWorkspace } from "@/lib/data/repository"
import { monthStart } from "@/lib/domain/dates"
import { monthCsv } from "@/lib/report/csv"
import { buildMonthRows } from "@/lib/report/month-rows"
import { monthParam } from "@/lib/search-params"

export async function GET(request: NextRequest) {
  const ws = await loadWorkspace()
  const month = monthParam(request.nextUrl.searchParams.get("m") ?? undefined, monthStart(ws.today))
  const csv = monthCsv(buildMonthRows(month, ws.days, ws.punches, ws.settings.timezone))
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="horas_${month.slice(0, 7).replace("-", "_")}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
