import { CalendarCheck, Hourglass, Target, TrendingUp } from "lucide-react"
import type { Metadata } from "next"
import { Suspense } from "react"

import { KpiCard } from "@/components/kpi-card"
import { PageHeader } from "@/components/page-header"
import { PeriodNav } from "@/components/period-nav"
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
import { addDays, monthStart } from "@/lib/domain/dates"
import { monthMetrics } from "@/lib/domain/month"
import { remunerationBreakdown } from "@/lib/domain/remuneration"
import { minutesToDuration, minutesToHuman } from "@/lib/domain/time"
import { formatDayShort, formatMonth } from "@/lib/format"
import { monthParam } from "@/lib/search-params"

import { MonthCalendar } from "./month-calendar"
import { RemunerationCard } from "./remuneration-card"

export const metadata: Metadata = { title: "Mês" }

export default function MonthPage({ searchParams }: PageProps<"/mes">) {
  return (
    <Suspense fallback={<MonthSkeleton />}>
      <MonthContent searchParams={searchParams} />
    </Suspense>
  )
}

async function MonthContent({ searchParams }: Pick<PageProps<"/mes">, "searchParams">) {
  const [ws, params] = await Promise.all([loadWorkspace(), searchParams])
  const { settings } = ws
  const month = monthParam(params.m, monthStart(ws.today))
  const isCurrent = month === monthStart(ws.today)
  const metrics = monthMetrics(ws.days, month, settings.dayTargetMinutes)
  const config = {
    valorBase: settings.valorBase,
    valorHora: settings.valorHora,
    valorBonus: settings.valorBonus,
    valorAuxTransporte: settings.valorAuxTransporte,
  }
  const remuneration = (bonusApplied: boolean) =>
    remunerationBreakdown(ws.days, month, config, settings.dayTargetMinutes, { bonusApplied })
  const configured = settings.valorBase > 0 || settings.valorHora > 0

  const prevMonth = monthStart(addDays(month, -1)).slice(0, 7)
  const nextMonth = monthStart(addDays(month, 32)).slice(0, 7)

  return (
    <>
      <PageHeader
        title="Mês"
        description={formatMonth(month)}
        actions={
          <PeriodNav
            label={formatMonth(month)}
            prevHref={`/mes?m=${prevMonth}`}
            nextHref={`/mes?m=${nextMonth}`}
            currentHref="/mes"
            isCurrent={isCurrent}
          />
        }
      />

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Horas no mês" icon={TrendingUp} value={minutesToDuration(metrics.totalMinutes)} />
          <KpiCard
            label="Meta do mês"
            icon={Target}
            value={minutesToDuration(metrics.targetMinutes)}
            hint={`${minutesToHuman(settings.dayTargetMinutes)} por dia útil`}
          />
          <KpiCard
            label="Falta para fechar"
            icon={Hourglass}
            value={minutesToDuration(metrics.remainingMinutes)}
            tone={metrics.remainingMinutes > 0 ? "default" : "positive"}
          />
          <KpiCard
            label="Extra no mês"
            icon={CalendarCheck}
            value={minutesToDuration(metrics.extraMinutes)}
            tone={metrics.extraMinutes > 0 ? "positive" : "default"}
            hint={`semanas: +${minutesToDuration(metrics.weeklyOvertimeMinutes)} / -${minutesToDuration(metrics.weeklyDebtMinutes)}`}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <Card>
            <CardHeader>
              <CardTitle>Calendário</CardTitle>
              <CardDescription>Quanto mais forte, mais perto (ou acima) da meta diária.</CardDescription>
            </CardHeader>
            <CardContent>
              <MonthCalendar
                month={month}
                days={ws.days}
                today={ws.today}
                dayTargetMinutes={settings.dayTargetMinutes}
              />
            </CardContent>
          </Card>

          <RemunerationCard
            month={month.slice(0, 7)}
            withoutBonus={remuneration(false)}
            withBonus={remuneration(true)}
            configured={configured}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Semanas do mês</CardTitle>
            <CardDescription>
              Semanas que cruzam a virada do mês usam a meta da semana inteira, como no app antigo.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Semana</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                  <TableHead className="text-right">Meta</TableHead>
                  <TableHead className="text-right">Extra</TableHead>
                  <TableHead className="text-right">Faltou</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.weeks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      Sem registros neste mês.
                    </TableCell>
                  </TableRow>
                )}
                {metrics.weeks.map((w) => (
                  <TableRow key={w.weekStart}>
                    <TableCell>
                      {formatDayShort(w.weekStart)} a {formatDayShort(w.weekEnd)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular">{minutesToDuration(w.workedMinutes)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground tabular">
                      {minutesToDuration(w.targetMinutes)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-working tabular">
                      {w.extraMinutes ? minutesToDuration(w.extraMinutes) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-pending tabular">
                      {w.debtMinutes ? minutesToDuration(w.debtMinutes) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function MonthSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-12 w-72" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}
