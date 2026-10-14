"use client"

import { Coffee, Hourglass, Play, Square, TrendingUp, TriangleAlert, Wallet } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { punchNow } from "@/app/actions"
import { KpiCard } from "@/components/kpi-card"
import { AddPunchButton, DayPunches } from "@/components/punches/day-punches"
import { DayTimeline } from "@/components/punches/day-timeline"
import { useActionToast } from "@/components/punches/use-action-toast"
import { WorkDayControls } from "@/components/punches/work-day-controls"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { addDays, weekStart, WEEKDAY_SHORT, type IsoDate } from "@/lib/domain/dates"
import { buildDayRecords, type DayRecord, type WorkDayMeta } from "@/lib/domain/days"
import { todayProjection } from "@/lib/domain/forecast"
import { localMinutes, summarizeDay, type Punch } from "@/lib/domain/punches"
import { minutesToClock, minutesToHuman } from "@/lib/domain/time"
import { currentWeekSummary } from "@/lib/domain/week"
import { formatDayLong, formatDayShort } from "@/lib/format"
import { cn } from "@/lib/utils"

function useNow(serverNow: string, fast: boolean) {
  const [now, setNow] = useState(() => new Date(serverNow))
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), fast ? 1000 : 30_000)
    return () => clearInterval(id)
  }, [fast])
  return now
}

/** Worked time including seconds, for the live clock. */
function workedSeconds(punches: Punch[], now: Date): number {
  const sorted = [...punches].sort((a, b) => Date.parse(a.punchedAt) - Date.parse(b.punchedAt))
  let ms = 0
  for (let i = 0; i < sorted.length; i += 2) {
    const start = Date.parse(sorted[i].punchedAt)
    const end = sorted[i + 1] ? Date.parse(sorted[i + 1].punchedAt) : now.getTime()
    ms += Math.max(end - start, 0)
  }
  return Math.floor(ms / 1000)
}

const clockWithSeconds = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":")

export function TodayDashboard({
  today,
  serverNow,
  timeZone,
  dayTargetMinutes,
  todayPunches,
  todayMeta,
  history,
}: {
  today: IsoDate
  serverNow: string
  timeZone: string
  dayTargetMinutes: number
  todayPunches: Punch[]
  todayMeta: WorkDayMeta | null
  history: DayRecord[]
}) {
  const working = todayPunches.length % 2 === 1
  const now = useNow(serverNow, working)
  const { pending, run } = useActionToast()

  const [todayRecord] = buildDayRecords(todayPunches, todayMeta ? [todayMeta] : [], {
    today,
    now,
    timeZone,
  })
  const days = todayRecord ? [...history, todayRecord] : history
  const summary = summarizeDay(todayPunches, { isToday: true, now })
  const nowMinutes = localMinutes(now, timeZone)
  const projection = todayProjection(days, today, nowMinutes, dayTargetMinutes)
  const week = currentWeekSummary(days, today, dayTargetMinutes)
  const details = projection.forecast.details
  const isHoliday = todayMeta?.isHoliday ?? false

  const seconds = workedSeconds(todayPunches, now)
  const progress =
    projection.suggestedMinutes > 0
      ? Math.min((summary.workedMinutes / projection.suggestedMinutes) * 100, 100)
      : 100
  const lastInterval = summary.intervals.at(-1)
  const sortedPunches = [...todayPunches].sort(
    (a, b) => Date.parse(a.punchedAt) - Date.parse(b.punchedAt),
  )
  const lastPunch = sortedPunches.at(-1)
  const pendingDays = history.filter((d) => d.status === "incomplete").slice(-5).reverse()

  let statusText = "Ainda sem batidas hoje"
  if (isHoliday) statusText = "Feriado: horas de hoje não contam na meta"
  else if (summary.status === "working" && lastInterval)
    statusText = `Trabalhando desde ${minutesToClock(localMinutes(lastInterval.start, timeZone))}`
  else if (summary.status === "out" && lastPunch)
    statusText = `Fora desde ${minutesToClock(localMinutes(lastPunch.punchedAt, timeZone))}`

  return (
    <div className="flex flex-col gap-6">
      <Card className="relative overflow-visible">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-2xl font-semibold tracking-tight">Hoje</CardTitle>
            <CardDescription>{formatDayLong(today)}</CardDescription>
          </div>
          <WorkDayControls
            date={today}
            isHoliday={isHoliday}
            workMode={todayMeta?.workMode ?? null}
          />
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-[1fr_16rem] md:items-end">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span
                className={cn(
                  "size-2 rounded-full bg-muted-foreground/40",
                  summary.status === "working" && "animate-pulse bg-working",
                  summary.status === "out" && "bg-break",
                  isHoliday && "bg-holiday",
                )}
              />
              {statusText}
            </div>
            <div className="font-mono text-5xl font-semibold tracking-tight tabular sm:text-6xl">
              {clockWithSeconds(seconds)}
            </div>
            <p className="text-sm text-muted-foreground">
              de <strong className="text-foreground">{minutesToHuman(projection.suggestedMinutes)}</strong>{" "}
              previstas hoje ·{" "}
              {projection.remainingMinutes > 0 ? (
                <>
                  faltam{" "}
                  <strong className="text-foreground">
                    {minutesToHuman(projection.remainingMinutes)}
                  </strong>
                </>
              ) : (
                <span className="text-working">meta do dia batida</span>
              )}
            </p>
            <Progress value={progress} className="h-2" />
          </div>

          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              className="h-14 text-base"
              variant={summary.nextPunch === "out" ? "secondary" : "default"}
              disabled={pending}
              onClick={() => run(punchNow)}
            >
              {summary.nextPunch === "in" ? <Play /> : <Square />}
              {summary.nextPunch === "in" ? "Registrar entrada" : "Registrar saída"}
            </Button>
            <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {summary.status === "out" ? "Se voltar agora, sai às" : "Saída prevista"}
              </span>
              <span className="font-mono font-semibold tabular">
                {projection.expectedEndMinutes === null
                  ? "—"
                  : minutesToClock(projection.expectedEndMinutes)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Semana"
          icon={TrendingUp}
          value={minutesToHuman(projection.weekWorkedMinutes)}
          hint={`de ${minutesToHuman(week.targetMinutes)} · ${Math.round(
            week.targetMinutes > 0 ? (projection.weekWorkedMinutes / week.targetMinutes) * 100 : 100,
          )}%`}
        />
        <KpiCard
          label="Falta na semana"
          icon={Hourglass}
          value={minutesToHuman(projection.weekMissingMinutes)}
          hint={
            details.previousWeeksDebt > 0
              ? `inclui ${minutesToHuman(details.previousWeeksDebt)} de compensação`
              : "sem compensação pendente"
          }
        />
        <KpiCard
          label="Projeção da semana"
          icon={Wallet}
          value={minutesToHuman(details.projectedWeekTotal)}
          hint="seguindo o plano dos próximos dias"
        />
        <KpiCard
          label="Pausas hoje"
          icon={Coffee}
          value={minutesToHuman(summary.breakMinutes)}
          hint={`${summary.intervals.length} ${summary.intervals.length === 1 ? "período" : "períodos"} de trabalho`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Batidas de hoje</CardTitle>
            <AddPunchButton date={today} defaultTime={minutesToClock(nowMinutes)} />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <DayTimeline punches={todayPunches} timeZone={timeZone} now={now} isToday />
            <DayPunches
              date={today}
              punches={todayPunches}
              timeZone={timeZone}
              isToday
              now={now}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <WeekBars
            today={today}
            days={days}
            plan={projection.forecast.plan}
            dayTargetMinutes={dayTargetMinutes}
          />
          {pendingDays.length > 0 && (
            <Card size="sm" className="ring-pending/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-pending">
                  <TriangleAlert className="size-4" />
                  Dias com batida faltando
                </CardTitle>
                <CardDescription>Número ímpar de batidas: só os pares fechados contam.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {pendingDays.map((d) => (
                  <Link
                    key={d.date}
                    href={`/registros?m=${d.date.slice(0, 7)}&d=${d.date}`}
                    className="flex justify-between rounded-md px-2 py-1 text-sm hover:bg-muted"
                  >
                    {formatDayShort(d.date)}
                    <span className="text-muted-foreground tabular">{minutesToHuman(d.workedMinutes)}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function WeekBars({
  today,
  days,
  plan,
  dayTargetMinutes,
}: {
  today: IsoDate
  days: DayRecord[]
  plan: { date: IsoDate; minutes: number }[]
  dayTargetMinutes: number
}) {
  const start = weekStart(today)
  const bars = [0, 1, 2, 3, 4].map((i) => {
    const date = addDays(start, i)
    const record = days.find((d) => d.date === date)
    const planned = plan.find((p) => p.date === date)?.minutes ?? 0
    return {
      date,
      label: WEEKDAY_SHORT[i],
      worked: record?.isHoliday ? 0 : (record?.workedMinutes ?? 0),
      planned: date >= today ? planned : 0,
      isHoliday: record?.isHoliday ?? false,
    }
  })
  const max = Math.max(dayTargetMinutes * 1.25, ...bars.map((b) => Math.max(b.worked, b.planned)), 1)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Esta semana</CardTitle>
        <CardDescription>Realizado e plano para fechar a meta</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative flex h-36 items-end gap-2">
          <span
            className="absolute inset-x-0 border-t border-dashed border-foreground/20"
            style={{ bottom: `${(dayTargetMinutes / max) * 100}%` }}
          />
          {bars.map((bar) => (
            <div key={bar.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] text-muted-foreground tabular">
                {bar.isHoliday
                  ? "feriado"
                  : minutesToHuman(Math.max(bar.worked, bar.planned)).replace(" ", "")}
              </span>
              <div className="relative w-full flex-1">
                {bar.planned > bar.worked && (
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-md border border-dashed border-primary/50 bg-primary/5"
                    style={{ height: `${(bar.planned / max) * 100}%` }}
                  />
                )}
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-0 rounded-md bg-primary",
                    bar.date === today && "bg-working",
                    bar.isHoliday && "h-1.5 bg-holiday",
                  )}
                  style={bar.isHoliday ? undefined : { height: `${(bar.worked / max) * 100}%` }}
                />
              </div>
              <span
                className={cn(
                  "text-xs text-muted-foreground",
                  bar.date === today && "font-semibold text-foreground",
                )}
              >
                {bar.label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
