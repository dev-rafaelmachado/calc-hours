import { ChevronRight } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { PeriodNav } from "@/components/period-nav"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { loadWorkspace } from "@/lib/data/repository"
import { addDays, eachDay, monthEnd, monthStart, weekdayIndex, weekStart } from "@/lib/domain/dates"
import { WORK_MODE_LABELS } from "@/lib/domain/days"
import { minutesToHuman } from "@/lib/domain/time"
import { formatMonth, formatWeekdayShort } from "@/lib/format"
import { formatIntervals, groupByWorkDate } from "@/lib/format-punches"
import { dateParam, monthParam } from "@/lib/search-params"
import { cn } from "@/lib/utils"

import { DaySheet } from "./day-sheet"
import { ImportDialog } from "./import-dialog"

export const metadata: Metadata = { title: "Registros" }

export default function RecordsPage({ searchParams }: PageProps<"/registros">) {
  return (
    <Suspense fallback={<RecordsSkeleton />}>
      <RecordsContent searchParams={searchParams} />
    </Suspense>
  )
}

async function RecordsContent({ searchParams }: Pick<PageProps<"/registros">, "searchParams">) {
  const [ws, params] = await Promise.all([loadWorkspace(), searchParams])
  const { timezone } = ws.settings
  const month = monthParam(params.m, monthStart(ws.today))
  const monthKey = month.slice(0, 7)
  const selected = typeof params.d === "string" ? dateParam(params.d, "") : ""
  const isCurrent = month === monthStart(ws.today)

  const byDate = new Map(ws.days.map((d) => [d.date, d]))
  const punchesByDay = groupByWorkDate(ws.punches)
  const rows = eachDay(month, monthEnd(month))
    .filter((date) => byDate.has(date) || (weekdayIndex(date) < 5 && date <= ws.today))
    .reverse()

  const prevMonth = monthStart(addDays(month, -1)).slice(0, 7)
  const nextMonth = monthStart(addDays(month, 32)).slice(0, 7)

  return (
    <>
      <PageHeader
        title="Registros"
        description="Toque num dia para ver, corrigir ou completar as batidas."
        actions={
          <>
            <ImportDialog referenceMonday={weekStart(ws.today)} />
            <PeriodNav
              label={formatMonth(month)}
              prevHref={`/registros?m=${prevMonth}`}
              nextHref={`/registros?m=${nextMonth}`}
              currentHref="/registros"
              isCurrent={isCurrent}
            />
          </>
        }
      />

      <Card className="py-0">
        {rows.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhum registro neste mês.</p>
        )}
        <ul className="divide-y">
          {rows.map((date) => {
            const record = byDate.get(date)
            const text = formatIntervals(punchesByDay.get(date) ?? [], timezone)
            return (
              <li key={date}>
                <Link
                  href={`/registros?m=${monthKey}&d=${date}`}
                  scroll={false}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                    date === selected && "bg-primary/5",
                  )}
                >
                  <div className="w-20 shrink-0">
                    <div className={cn("text-sm font-medium", date === ws.today && "text-primary")}>
                      {formatWeekdayShort(date)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs text-muted-foreground tabular">
                      {record?.isHoliday ? "Feriado" : text || "Sem registro"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 empty:hidden">
                      {record?.isHoliday && <Badge className="bg-holiday/15 text-holiday">Feriado</Badge>}
                      {record?.workMode && <Badge variant="outline">{WORK_MODE_LABELS[record.workMode]}</Badge>}
                      {record?.status === "incomplete" && (
                        <Badge className="bg-pending/15 text-pending">Falta batida</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold tabular">
                      {record?.hasPunches && !record.isHoliday ? minutesToHuman(record.workedMinutes) : "—"}
                    </div>
                    {record?.breakMinutes ? (
                      <div className="text-[11px] text-muted-foreground tabular">
                        pausa {minutesToHuman(record.breakMinutes)}
                      </div>
                    ) : null}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            )
          })}
        </ul>
      </Card>

      {selected && (
        <DaySheet
          key={selected}
          date={selected}
          closeHref={`/registros?m=${monthKey}`}
          punches={punchesByDay.get(selected) ?? []}
          meta={ws.meta.find((m) => m.workDate === selected) ?? null}
          timeZone={timezone}
          today={ws.today}
          serverNow={ws.now.toISOString()}
        />
      )}
    </>
  )
}

function RecordsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-12 w-72" />
      <Skeleton className="h-[28rem] rounded-xl" />
    </div>
  )
}
