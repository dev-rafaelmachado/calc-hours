import { Building2, PartyPopper } from "lucide-react"
import Link from "next/link"

import { eachDay, monthEnd, monthStart, weekdayIndex, WEEKDAY_SHORT, type IsoDate } from "@/lib/domain/dates"
import type { DayRecord } from "@/lib/domain/days"
import { minutesToHuman } from "@/lib/domain/time"
import { cn } from "@/lib/utils"

/** Month grid (Monday first) shaded by worked hours against the daily target. */
export function MonthCalendar({
  month,
  days,
  today,
  dayTargetMinutes,
}: {
  month: IsoDate
  days: DayRecord[]
  today: IsoDate
  dayTargetMinutes: number
}) {
  const dates = eachDay(monthStart(month), monthEnd(month))
  const leading = weekdayIndex(dates[0])
  const byDate = new Map(days.map((d) => [d.date, d]))

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAY_SHORT.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leading }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {dates.map((date) => {
          const record = byDate.get(date)
          const weekend = weekdayIndex(date) >= 5
          const worked = record?.hasPunches && !record.isHoliday ? record.workedMinutes : 0
          const ratio = dayTargetMinutes > 0 ? Math.min(worked / dayTargetMinutes, 1.25) : 0
          return (
            <Link
              key={date}
              href={`/registros?m=${date.slice(0, 7)}&d=${date}`}
              className={cn(
                "relative flex aspect-square flex-col justify-between rounded-md border p-1 text-left transition-colors hover:border-primary/60 sm:aspect-[4/3] sm:p-1.5",
                weekend && !worked && "bg-muted/40 text-muted-foreground",
                record?.isHoliday && "border-holiday/40 bg-holiday/10",
                date === today && "ring-2 ring-primary",
              )}
              style={
                worked > 0
                  ? { backgroundColor: `color-mix(in oklch, var(--primary) ${Math.round(10 + ratio * 40)}%, transparent)` }
                  : undefined
              }
            >
              <span className="flex items-center justify-between text-[11px] font-medium tabular">
                {Number(date.slice(8))}
                {record?.isHoliday ? (
                  <PartyPopper className="size-3 text-holiday" />
                ) : record?.workMode === "presencial" ? (
                  <Building2 className="size-3 text-muted-foreground" />
                ) : null}
              </span>
              {worked > 0 && (
                <span className="hidden text-[11px] font-semibold tabular sm:block">
                  {minutesToHuman(worked)}
                </span>
              )}
              {record?.status === "incomplete" && (
                <span className="absolute right-1 bottom-1 size-1.5 rounded-full bg-pending" />
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
