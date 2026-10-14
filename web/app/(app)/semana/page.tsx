import { CalendarClock, Hourglass, Scale, TrendingUp } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { KpiCard } from "@/components/kpi-card"
import { PageHeader } from "@/components/page-header"
import { PeriodNav } from "@/components/period-nav"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { loadWorkspace } from "@/lib/data/repository"
import { addDays, eachDay, weekdayIndex, weekStart } from "@/lib/domain/dates"
import { holidaySet, WORK_MODE_LABELS } from "@/lib/domain/days"
import { todayProjection } from "@/lib/domain/forecast"
import { minutesToClock, minutesToHuman } from "@/lib/domain/time"
import { previousWeeksDebt, weekTargetMinutes } from "@/lib/domain/week"
import { formatDayShort, formatWeekdayShort } from "@/lib/format"
import { formatIntervals, groupByWorkDate } from "@/lib/format-punches"
import { dateParam } from "@/lib/search-params"
import { cn } from "@/lib/utils"

import { WeekChart } from "./week-chart"
import { WeekSimulator } from "./week-simulator"

export const metadata: Metadata = { title: "Semana" }

export default function WeekPage({ searchParams }: PageProps<"/semana">) {
  return (
    <Suspense fallback={<WeekSkeleton />}>
      <WeekContent searchParams={searchParams} />
    </Suspense>
  )
}

async function WeekContent({ searchParams }: Pick<PageProps<"/semana">, "searchParams">) {
  const [ws, params] = await Promise.all([loadWorkspace(), searchParams])
  const { dayTargetMinutes, timezone } = ws.settings
  const currentStart = weekStart(ws.today)
  const start = weekStart(dateParam(params.w, ws.today))
  const end = addDays(start, 6)
  const isCurrent = start === currentStart

  const holidays = holidaySet(ws.days)
  const target = weekTargetMinutes(start, end, dayTargetMinutes, holidays)
  const debt = previousWeeksDebt(ws.days, start, dayTargetMinutes)
  const projection = isCurrent
    ? todayProjection(ws.days, ws.today, ws.nowMinutes, dayTargetMinutes)
    : null
  const plan = projection?.forecast.plan ?? []
  const punchesByDay = groupByWorkDate(ws.punches.filter((p) => p.workDate >= start && p.workDate <= end))

  const weekDays = eachDay(start, end)
    .map((date) => {
      const record = ws.days.find((d) => d.date === date)
      const planned = plan.find((p) => p.date === date)
      return { date, record, planned }
    })
    .filter(({ date, record }) => weekdayIndex(date) < 5 || record?.hasPunches)

  const worked = weekDays.reduce(
    (sum, d) => sum + (d.record && !d.record.isHoliday ? d.record.workedMinutes : 0),
    0,
  )
  const balance = worked - target

  const chartData = weekDays.map(({ date, record, planned }) => {
    const done = record && !record.isHoliday ? record.workedMinutes : 0
    return {
      label: formatWeekdayShort(date).split(" ")[0],
      worked: done,
      planned: planned && date >= ws.today ? Math.max(planned.minutes - done, 0) : 0,
    }
  })

  const simulatorDays = weekDays
    .filter(({ date, record }) => weekdayIndex(date) < 5 && !record?.isHoliday)
    .map(({ date, record, planned }) => ({
      date,
      minutes:
        date < ws.today || (date === ws.today && !planned)
          ? (record?.workedMinutes ?? 0)
          : Math.max(planned?.minutes ?? 0, record?.workedMinutes ?? 0),
    }))

  return (
    <>
      <PageHeader
        title="Semana"
        description={`${formatDayShort(start)} a ${formatDayShort(end)}`}
        actions={
          <>
            {isCurrent && (
              <WeekSimulator
                days={simulatorDays}
                today={ws.today}
                weekTargetMinutes={target}
                previousWeeksDebt={debt}
              />
            )}
            <PeriodNav
              label={`Semana de ${formatDayShort(start)}`}
              prevHref={`/semana?w=${addDays(start, -7)}`}
              nextHref={`/semana?w=${addDays(start, 7)}`}
              currentHref="/semana"
              isCurrent={isCurrent}
            />
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Trabalhado"
            icon={TrendingUp}
            value={minutesToHuman(worked)}
            hint={`de ${minutesToHuman(target)} na semana`}
          />
          <KpiCard
            label="Saldo da semana"
            icon={Scale}
            value={`${balance > 0 ? "+" : ""}${minutesToHuman(balance)}`}
            tone={balance >= 0 ? "positive" : "default"}
            hint={balance >= 0 ? "meta batida" : "abaixo da meta até agora"}
          />
          <KpiCard
            label="Compensação anterior"
            icon={Hourglass}
            value={minutesToHuman(debt)}
            tone={debt > 0 ? "warning" : "default"}
            hint="déficits de semanas passadas"
          />
          <KpiCard
            label={isCurrent ? "Projeção" : "Dias trabalhados"}
            icon={CalendarClock}
            value={
              projection
                ? minutesToHuman(projection.forecast.details.projectedWeekTotal)
                : weekDays.filter((d) => d.record?.hasPunches && !d.record.isHoliday).length
            }
            hint={isCurrent ? "com o plano dos próximos dias" : "com batidas"}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Horas por dia</CardTitle>
            <CardDescription>A linha tracejada é a meta diária ({minutesToHuman(dayTargetMinutes)}).</CardDescription>
          </CardHeader>
          <CardContent>
            <WeekChart data={chartData} dayTargetMinutes={dayTargetMinutes} />
          </CardContent>
        </Card>

        <div className={cn("grid gap-6", isCurrent && "lg:grid-cols-[1fr_22rem]")}>
          <Card>
            <CardHeader>
              <CardTitle>Dias</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dia</TableHead>
                    <TableHead>Marcações</TableHead>
                    <TableHead className="text-right">Pausas</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weekDays.map(({ date, record }) => (
                    <TableRow key={date} className={cn(date === ws.today && "bg-primary/5")}>
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/registros?m=${date.slice(0, 7)}&d=${date}`} className="font-medium hover:underline">
                          {formatWeekdayShort(date)}
                        </Link>
                        <div className="mt-1 flex gap-1">
                          {record?.isHoliday && <Badge className="bg-holiday/15 text-holiday">Feriado</Badge>}
                          {record?.workMode && <Badge variant="outline">{WORK_MODE_LABELS[record.workMode]}</Badge>}
                          {record?.status === "incomplete" && (
                            <Badge className="bg-pending/15 text-pending">Incompleto</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground tabular">
                        {formatIntervals(punchesByDay.get(date) ?? [], timezone) || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular">
                        {record?.breakMinutes ? minutesToHuman(record.breakMinutes) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium tabular">
                        {record?.hasPunches && !record.isHoliday ? minutesToHuman(record.workedMinutes) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {isCurrent && (
            <Card>
              <CardHeader>
                <CardTitle>Plano para fechar a semana</CardTitle>
                <CardDescription>
                  {plan.length > 0
                    ? `Distribui ${minutesToHuman(projection!.forecast.details.targetToPlan)} entre os dias restantes, pela sua média de cada dia.`
                    : "Não há dias pendentes nesta semana."}
                </CardDescription>
              </CardHeader>
              {plan.length > 0 && (
                <CardContent className="flex flex-col divide-y">
                  {plan.map((row) => (
                    <div key={row.date} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <div className="font-medium">
                          {formatWeekdayShort(row.date)}
                          {row.isToday && <span className="text-primary"> · hoje</span>}
                        </div>
                        <div className="text-xs text-muted-foreground tabular">
                          {minutesToClock(row.suggestedStartMinutes)} → {minutesToClock(row.suggestedEndMinutes)}
                          {row.suggestedEndMinutes >= 1440 && <span className="text-pending"> (+1 dia)</span>}
                        </div>
                      </div>
                      <span className="font-mono font-semibold tabular">{minutesToHuman(row.minutes)}</span>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

function WeekSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-12 w-72" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  )
}
