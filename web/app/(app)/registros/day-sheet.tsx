"use client"

import { usePathname, useRouter } from "next/navigation"

import { AddPunchButton, DayPunches } from "@/components/punches/day-punches"
import { DayTimeline } from "@/components/punches/day-timeline"
import { WorkDayControls } from "@/components/punches/work-day-controls"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { IsoDate } from "@/lib/domain/dates"
import type { WorkDayMeta } from "@/lib/domain/days"
import { summarizeDay, type Punch } from "@/lib/domain/punches"
import { minutesToHuman } from "@/lib/domain/time"
import { formatDayLong } from "@/lib/format"

/** Editor for one day, opened from the `d` query parameter. */
export function DaySheet({
  date,
  closeHref,
  punches,
  meta,
  timeZone,
  today,
  serverNow,
}: {
  date: IsoDate
  closeHref: string
  punches: Punch[]
  meta: WorkDayMeta | null
  timeZone: string
  today: IsoDate
  serverNow: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const now = new Date(serverNow)
  const isToday = date === today
  const summary = summarizeDay(punches, { isToday, now })

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && pathname === "/registros") router.replace(closeHref, { scroll: false })
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{formatDayLong(date)}</SheetTitle>
          <SheetDescription>
            {summary.intervals.length > 0
              ? `${minutesToHuman(summary.workedMinutes)} trabalhadas · ${minutesToHuman(summary.breakMinutes)} de pausa`
              : "Sem batidas"}
            {summary.status === "incomplete" && " · falta uma batida"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-6">
          <WorkDayControls
            key={`${date}-${meta?.isHoliday}-${meta?.workMode}`}
            date={date}
            isHoliday={meta?.isHoliday ?? false}
            workMode={meta?.workMode ?? null}
            className="self-start"
          />
          <DayTimeline punches={punches} timeZone={timeZone} now={now} isToday={isToday} />
          <DayPunches date={date} punches={punches} timeZone={timeZone} isToday={isToday} now={now} />
          <AddPunchButton date={date} defaultTime="09:00" />
        </div>
      </SheetContent>
    </Sheet>
  )
}
