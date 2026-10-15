import { CalendarCheck, Gauge, Scale, TrendingUp } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { KpiCard } from "@/components/kpi-card"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { loadWorkspace } from "@/lib/data/repository"
import {
  analyticsRange,
  closedDays,
  habitShift,
  heatmapDays,
  modeProfile,
  monthProjection,
  monthSeries,
  occupancy,
  PERIOD_PRESETS,
  periodRecords,
  periodSummary,
  weekdayProfile,
  type DayValue,
  type HabitStats,
  type PeriodPreset,
} from "@/lib/domain/analytics"
import { WEEKDAY_LABELS } from "@/lib/domain/dates"
import { minutesToClock, minutesToDuration, minutesToHuman } from "@/lib/domain/time"
import { formatCurrency, formatDateBr, formatDayShort, formatMonth, formatMonthShort, formatWeekdayShort } from "@/lib/format"
import { buildInsights } from "@/lib/insights"
import { cn } from "@/lib/utils"

import { BalanceChart } from "./balance-chart"
import { InsightsCard } from "./insights-card"
import { PeriodFilter } from "./period-filter"
import { PeriodHeatmap } from "./period-heatmap"
import { RhythmChart } from "./rhythm-chart"

export const metadata: Metadata = { title: "Análise" }

const DEFAULT_PRESET: PeriodPreset = "12m"
/** Days per work mode before the rhythm chart splits by mode. */
const MIN_MODE_DAYS = 5

const signedDuration = (minutes: number) =>
  `${minutes > 0 ? "+" : ""}${minutesToDuration(minutes)}`
const percent = (ratio: number) => `${Math.round(ratio * 100)}%`
/** Clock time, with "+1" when it is past midnight of the workday. */
const clock = (minutes: number) => `${minutesToClock(minutes)}${minutes >= 1440 ? " (+1)" : ""}`
const dayHref = (date: string) => `/registros?m=${date.slice(0, 7)}&d=${date}`

export default function AnalysisPage({ searchParams }: PageProps<"/analise">) {
  return (
    <Suspense fallback={<AnalysisSkeleton />}>
      <AnalysisContent searchParams={searchParams} />
    </Suspense>
  )
}

async function AnalysisContent({ searchParams }: Pick<PageProps<"/analise">, "searchParams">) {
  const [ws, params] = await Promise.all([loadWorkspace(), searchParams])
  const { dayTargetMinutes, valorHora } = ws.settings
  const preset = PERIOD_PRESETS.find((p) => p === params.p) ?? DEFAULT_PRESET
  const range = analyticsRange(preset, ws.today, ws.days)
  const filter = <PeriodFilter value={preset} presets={PERIOD_PRESETS} />

  if (!range) {
    return (
      <>
        <PageHeader title="Análise" actions={filter} />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Ainda não há dias fechados neste período. A análise começa a partir do primeiro dia completo.
          </CardContent>
        </Card>
      </>
    )
  }

  const summary = periodSummary(ws.days, range, dayTargetMinutes)
  const closed = closedDays(ws.days, range)
  const months = monthSeries(ws.days, range, dayTargetMinutes)
  const weekdays = weekdayProfile(closed, dayTargetMinutes)
  const modes = modeProfile(closed, dayTargetMinutes)
  const records = periodRecords(ws.days, range, dayTargetMinutes)
  const insights = buildInsights({
    dayTargetMinutes,
    summary,
    months,
    weekdays,
    modes,
    records,
    shift: habitShift(closed, dayTargetMinutes),
    projection: monthProjection(ws.days, ws.today, dayTargetMinutes),
    closed,
  })
  const splitByMode =
    (modes.presencial?.days ?? 0) >= MIN_MODE_DAYS && (modes.home_office?.days ?? 0) >= MIN_MODE_DAYS
  const multiYear = range.from.slice(0, 4) !== range.to.slice(0, 4)
  const money = (minutes: number) => formatCurrency((minutes / 60) * valorHora)

  return (
    <>
      <PageHeader
        title="Análise"
        description={`${formatDateBr(range.from)} a ${formatDateBr(range.to)} · dias fechados até ontem`}
        actions={filter}
      />

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Horas no período"
            icon={TrendingUp}
            value={minutesToDuration(summary.workedMinutes)}
            hint={`meta ${minutesToDuration(summary.targetMinutes)}`}
          />
          <KpiCard
            label="Saldo"
            icon={Scale}
            value={signedDuration(summary.balanceMinutes)}
            tone={summary.balanceMinutes >= 0 ? "positive" : "warning"}
            hint={valorHora > 0 ? `≈ ${money(summary.balanceMinutes)} pelo valor-hora atual` : "horas menos a meta"}
          />
          <KpiCard
            label="Média por dia"
            icon={Gauge}
            value={summary.habits ? minutesToHuman(summary.habits.avgWorkedMinutes) : "—"}
            hint={summary.habits ? `na meta em ${percent(summary.habits.onTargetRatio)} dos dias` : undefined}
          />
          <KpiCard
            label="Dias trabalhados"
            icon={CalendarCheck}
            value={summary.workedDays}
            hint={`${summary.workedDaysByMode.presencial} presenciais · ${summary.workedDaysByMode.home_office} home office`}
          />
        </div>

        <InsightsCard insights={insights} />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Saldo por mês</CardTitle>
              <CardDescription>
                Horas trabalhadas menos a meta de cada mês. O mês atual, mais claro, vai até ontem.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BalanceChart
                data={months.map((m) => ({
                  label: formatMonthShort(m.month, multiYear),
                  title: formatMonth(m.month),
                  balance: m.balanceMinutes,
                  worked: m.workedMinutes,
                  target: m.targetMinutes,
                  partial: m.partial,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ritmo do dia</CardTitle>
              <CardDescription>
                Em quantos dias você estava trabalhando em cada horário
                {splitByMode ? ", por modo de trabalho." : "."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RhythmChart data={occupancy(closed)} splitByMode={splitByMode} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Mês a mês</CardTitle>
            <CardDescription>
              Médias calculadas sobre os dias fechados.
              {valorHora > 0 && " O ajuste usa o valor-hora atual."}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Meta</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Média/dia</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Entrada</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Saída</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Pausa</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Presencial</TableHead>
                  {valorHora > 0 && <TableHead className="hidden text-right lg:table-cell">Ajuste</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>
                      <Link href={`/mes?m=${m.month.slice(0, 7)}`} className="hover:underline">
                        {formatMonth(m.month)}
                      </Link>
                      {m.partial && <span className="ml-1 text-xs text-muted-foreground">parcial</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular">{minutesToDuration(m.workedMinutes)}</TableCell>
                    <TableCell className="hidden text-right font-mono text-muted-foreground tabular sm:table-cell">
                      {minutesToDuration(m.targetMinutes)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono tabular",
                        m.balanceMinutes >= 0 ? "text-working" : "text-pending",
                      )}
                    >
                      {signedDuration(m.balanceMinutes)}
                    </TableCell>
                    <HabitCells stats={m.habits} />
                    <TableCell className="hidden text-right font-mono tabular lg:table-cell">{m.presencialDays}</TableCell>
                    {valorHora > 0 && (
                      <TableCell className="hidden text-right font-mono tabular lg:table-cell">
                        {money(m.balanceMinutes)}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Período</TableCell>
                  <TableCell className="text-right font-mono tabular">{minutesToDuration(summary.workedMinutes)}</TableCell>
                  <TableCell className="hidden text-right font-mono tabular sm:table-cell">
                    {minutesToDuration(summary.targetMinutes)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono tabular",
                      summary.balanceMinutes >= 0 ? "text-working" : "text-pending",
                    )}
                  >
                    {signedDuration(summary.balanceMinutes)}
                  </TableCell>
                  <HabitCells stats={summary.habits} />
                  <TableCell className="hidden text-right font-mono tabular lg:table-cell">
                    {summary.workedDaysByMode.presencial}
                  </TableCell>
                  {valorHora > 0 && (
                    <TableCell className="hidden text-right font-mono tabular lg:table-cell">
                      {money(summary.balanceMinutes)}
                    </TableCell>
                  )}
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Dias da semana</CardTitle>
              <CardDescription>Média de cada dia; a marca na barra é a meta diária.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <WeekdayTable weekdays={weekdays} dayTargetMinutes={dayTargetMinutes} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Presencial × home office</CardTitle>
              <CardDescription>Como cada modo de trabalho se compara nos dias fechados.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <ModeTable presencial={modes.presencial} homeOffice={modes.home_office} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Calendário do período</CardTitle>
            <CardDescription>Cada quadrado é um dia; quanto mais forte, mais horas. Toque para abrir o dia.</CardDescription>
          </CardHeader>
          <CardContent>
            <PeriodHeatmap days={heatmapDays(ws.days, range)} dayTargetMinutes={dayTargetMinutes} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recordes do período</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Record label="Dia mais longo" day={records.longestDay} format={minutesToHuman} />
              <Record label="Dia mais curto" day={records.shortestDay} format={minutesToHuman} />
              <Record label="Entrada mais cedo" day={records.earliestStart} format={clock} />
              <Record label="Saída mais tarde" day={records.latestEnd} format={clock} />
              <Record label="Maior pausa" day={records.longestBreak} format={minutesToHuman} />
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">Sequência na meta</dt>
                <dd className="mt-1 text-lg font-semibold tracking-tight">
                  {records.bestStreak ? `${records.bestStreak.days} dias úteis` : "—"}
                </dd>
                {records.bestStreak && (
                  <dd className="text-xs text-muted-foreground">
                    {formatDayShort(records.bestStreak.from)} a {formatDayShort(records.bestStreak.to)}
                  </dd>
                )}
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function HabitCells({ stats }: { stats: HabitStats | null }) {
  const cell = "hidden text-right font-mono tabular"
  return (
    <>
      <TableCell className={cn(cell, "sm:table-cell")}>{stats ? minutesToHuman(stats.avgWorkedMinutes) : "—"}</TableCell>
      <TableCell className={cn(cell, "md:table-cell")}>{stats ? clock(stats.avgStart) : "—"}</TableCell>
      <TableCell className={cn(cell, "md:table-cell")}>{stats ? clock(stats.avgEnd) : "—"}</TableCell>
      <TableCell className={cn(cell, "lg:table-cell")}>{stats ? minutesToHuman(stats.avgBreakMinutes) : "—"}</TableCell>
    </>
  )
}

function WeekdayTable({
  weekdays,
  dayTargetMinutes,
}: {
  weekdays: ReturnType<typeof weekdayProfile>
  dayTargetMinutes: number
}) {
  if (weekdays.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem dias fechados no período.</p>
  }
  const scale = Math.max(dayTargetMinutes, ...weekdays.map((w) => w.stats.avgWorkedMinutes)) * 1.05
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Dia</TableHead>
          <TableHead>Média</TableHead>
          <TableHead className="text-right">Entrada</TableHead>
          <TableHead className="text-right">Saída</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Pausa</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Dias</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {weekdays.map(({ weekday, stats }) => (
          <TableRow key={weekday}>
            <TableCell>{WEEKDAY_LABELS[weekday]}</TableCell>
            <TableCell className="w-full min-w-32">
              <div className="flex items-center gap-2">
                <div className="relative h-2 flex-1 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(stats.avgWorkedMinutes / scale) * 100}%` }}
                  />
                  <div
                    className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-foreground/50"
                    style={{ left: `${(dayTargetMinutes / scale) * 100}%` }}
                  />
                </div>
                <span className="w-14 text-right font-mono text-xs tabular">{minutesToHuman(stats.avgWorkedMinutes)}</span>
              </div>
            </TableCell>
            <TableCell className="text-right font-mono tabular">{clock(stats.avgStart)}</TableCell>
            <TableCell className="text-right font-mono tabular">{clock(stats.avgEnd)}</TableCell>
            <TableCell className="hidden text-right font-mono tabular sm:table-cell">
              {minutesToHuman(stats.avgBreakMinutes)}
            </TableCell>
            <TableCell className="hidden text-right font-mono text-muted-foreground tabular sm:table-cell">
              {stats.days}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ModeTable({ presencial, homeOffice }: { presencial: HabitStats | null; homeOffice: HabitStats | null }) {
  const rows: { label: string; value: (s: HabitStats) => string }[] = [
    { label: "Dias fechados", value: (s) => String(s.days) },
    { label: "Média por dia", value: (s) => minutesToHuman(s.avgWorkedMinutes) },
    { label: "Na meta", value: (s) => percent(s.onTargetRatio) },
    { label: "Entrada média", value: (s) => clock(s.avgStart) },
    { label: "Saída média", value: (s) => clock(s.avgEnd) },
    { label: "Pausa média", value: (s) => minutesToHuman(s.avgBreakMinutes) },
  ]
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          <TableHead className="text-right">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-presencial" />
              Presencial
            </span>
          </TableHead>
          <TableHead className="text-right">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-home-office" />
              Home office
            </span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="text-muted-foreground">{row.label}</TableCell>
            <TableCell className="text-right font-mono tabular">{presencial ? row.value(presencial) : "—"}</TableCell>
            <TableCell className="text-right font-mono tabular">{homeOffice ? row.value(homeOffice) : "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Record({
  label,
  day,
  format,
}: {
  label: string
  day: DayValue | null
  format: (minutes: number) => string
}) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tracking-tight">{day ? format(day.minutes) : "—"}</dd>
      {day && (
        <dd>
          <Link href={dayHref(day.date)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            {formatWeekdayShort(day.date)}
          </Link>
        </dd>
      )}
    </div>
  )
}

function AnalysisSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-12 w-72" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  )
}
