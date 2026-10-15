"use client"

import { FlaskConical } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import type { IsoDate } from "@/lib/domain/dates"
import { simulateWeek } from "@/lib/domain/simulation"
import { minutesToDuration, minutesToHuman } from "@/lib/domain/time"
import { formatWeekdayShort } from "@/lib/format"

function parseDuration(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match || Number(match[2]) > 59) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/** What-if editor for the current week; nothing is saved. */
export function WeekSimulator({
  days,
  today,
  weekTargetMinutes,
  previousWeeksDebt,
}: {
  days: { date: IsoDate; minutes: number }[]
  today: IsoDate
  weekTargetMinutes: number
  previousWeeksDebt: number
}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(days.map((d) => [d.date, minutesToDuration(d.minutes)])),
  )
  const parsed = days.map((d) => ({ date: d.date, minutes: parseDuration(values[d.date]) }))
  const invalid = parsed.some((d) => d.minutes === null)
  const result = simulateWeek({
    days: parsed.map((d) => ({ date: d.date, minutes: d.minutes ?? 0 })),
    today,
    weekTargetMinutes,
    previousWeeksDebt,
  })

  const rows = [
    ["Total da semana", result.totalMinutes],
    ["Até hoje", result.workedUntilTodayMinutes],
    ["Falta para a meta", result.missingMinutes],
    ["Compensação ainda aberta", result.compensationRemainingMinutes],
    ["Horas além da meta e da compensação", result.extraMinutes],
  ] as const

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>
        <FlaskConical />
        Simular semana
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Simulador da semana</SheetTitle>
          <SheetDescription>
            Ajuste as horas de cada dia (HH:MM) e veja o resultado. Nada é salvo.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-6">
          <div className="grid grid-cols-2 gap-3">
            {days.map((d) => (
              <div key={d.date} className="flex flex-col gap-1.5">
                <Label htmlFor={`sim-${d.date}`}>
                  {formatWeekdayShort(d.date)}
                  {d.date === today && <span className="text-primary"> · hoje</span>}
                </Label>
                <Input
                  id={`sim-${d.date}`}
                  inputMode="numeric"
                  value={values[d.date]}
                  aria-invalid={parseDuration(values[d.date]) === null}
                  onChange={(e) => setValues((v) => ({ ...v, [d.date]: e.target.value }))}
                  className="font-mono tabular"
                />
              </div>
            ))}
          </div>
          {invalid && <p className="text-sm text-destructive">Use o formato HH:MM em todos os dias.</p>}
          <dl className="flex flex-col divide-y rounded-lg border">
            {rows.map(([label, minutes]) => (
              <div key={label} className="flex items-center justify-between px-3 py-2 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono font-medium tabular">{minutesToHuman(minutes)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </SheetContent>
    </Sheet>
  )
}
