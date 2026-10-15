import Link from "next/link"

import type { HeatmapDay } from "@/lib/domain/analytics"
import { addDays, weekStart, WEEKDAY_SHORT, type IsoDate } from "@/lib/domain/dates"
import { minutesToHuman } from "@/lib/domain/time"
import { formatMonthShort, formatWeekdayShort } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Upper bounds of each level as a share of the daily target; the last level is open. */
const LEVELS = [0.5, 0.75, 1, 1.125]
const LEVEL_MIX = [22, 42, 62, 82, 100]

function level(minutes: number, target: number): number {
  const index = LEVELS.findIndex((bound) => minutes < bound * target)
  return index === -1 ? LEVELS.length : index
}

const levelColor = (index: number) =>
  `color-mix(in oklch, var(--primary) ${LEVEL_MIX[index]}%, var(--muted))`

/** 270 -> "4h30", 480 -> "8h" */
const shortHours = (minutes: number) => {
  const rest = minutes % 60
  return `${Math.floor(minutes / 60)}h${rest ? String(rest).padStart(2, "0") : ""}`
}

function describe(day: HeatmapDay): string {
  const label = formatWeekdayShort(day.date)
  if (day.isHoliday) return `${label} · feriado`
  if (day.missing) return `${label} · sem batida`
  if (day.workedMinutes === 0) return label
  return `${label} · ${minutesToHuman(day.workedMinutes)}${day.incomplete ? " (incompleto)" : ""}`
}

/** Calendar heatmap of the period: one column per week, Monday on top. */
export function PeriodHeatmap({ days, dayTargetMinutes }: { days: HeatmapDay[]; dayTargetMinutes: number }) {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const last = days.at(-1)!.date
  const weeks: IsoDate[] = []
  for (let w = weekStart(days[0].date); w <= last; w = addDays(w, 7)) weeks.push(w)
  const multiYear = days[0].date.slice(0, 4) !== last.slice(0, 4)

  const bounds = [0, ...LEVELS.map((b) => Math.round(b * dayTargetMinutes))]
  const legend = bounds.map((from, i) =>
    i === bounds.length - 1 ? `${shortHours(from)}+` : `${shortHours(from)}–${shortHours(bounds[i + 1])}`,
  )
  legend[0] = `até ${shortHours(bounds[1])}`

  return (
    <div className="flex flex-col gap-4">
      <div
        className="grid w-full gap-[3px]"
        style={{
          gridTemplateColumns: `1.75rem repeat(${weeks.length}, minmax(0, 1fr))`,
          maxWidth: `calc(1.75rem + ${weeks.length} * 1.75rem)`,
        }}
      >
        <span />
        {weeks.map((w, i) => {
          // The first column names the range's first month; later columns the month starting in them.
          const monthFirst = [0, 1, 2, 3, 4, 5, 6]
            .map((d) => addDays(w, d))
            .find((d) => d.endsWith("-01") && d > days[0].date)
          const labelDate = i === 0 ? days[0].date : monthFirst
          return (
            <span key={w} className="h-4 overflow-visible text-[10px] whitespace-nowrap text-muted-foreground">
              {labelDate ? formatMonthShort(labelDate, multiYear) : ""}
            </span>
          )
        })}
        {WEEKDAY_SHORT.map((weekday, row) => (
          <Row key={weekday} label={row % 2 === 0 ? weekday : ""}>
            {weeks.map((w) => {
              const date = addDays(w, row)
              const day = byDate.get(date)
              if (!day) return <span key={date} className="aspect-square" />
              const worked = day.workedMinutes > 0
              return (
                <Link
                  key={date}
                  href={`/registros?m=${date.slice(0, 7)}&d=${date}`}
                  prefetch={false}
                  title={describe(day)}
                  aria-label={describe(day)}
                  className={cn(
                    "aspect-square rounded-[3px] outline-offset-1 hover:outline-2 hover:outline-foreground/40",
                    !worked && "bg-muted/60",
                    day.isHoliday && "bg-holiday/35",
                    (day.missing || day.incomplete) && "ring-1 ring-pending ring-inset",
                    day.missing && "bg-transparent",
                  )}
                  style={worked ? { backgroundColor: levelColor(level(day.workedMinutes, dayTargetMinutes)) } : undefined}
                />
              )
            })}
          </Row>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {legend.map((label, i) => (
            <span key={label} className="flex items-center gap-1">
              <span className="size-3 rounded-[3px]" style={{ backgroundColor: levelColor(i) }} />
              {label}
            </span>
          ))}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-[3px] bg-holiday/35" />
          Feriado
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-[3px] ring-1 ring-pending ring-inset" />
          Sem batida ou incompleto
        </span>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="self-center text-[10px] leading-none text-muted-foreground">{label}</span>
      {children}
    </>
  )
}
