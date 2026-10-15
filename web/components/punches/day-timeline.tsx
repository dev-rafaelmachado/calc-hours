import { localMinutes, type Punch } from "@/lib/domain/punches"
import { minutesToClock } from "@/lib/domain/time"
import { cn } from "@/lib/utils"

/** Horizontal bar of the day's worked intervals, from 07h to 19h or wider. */
export function DayTimeline({
  punches,
  timeZone,
  now,
  isToday,
  className,
}: {
  punches: Punch[]
  timeZone: string
  now: Date
  isToday: boolean
  className?: string
}) {
  const sorted = [...punches].sort((a, b) => Date.parse(a.punchedAt) - Date.parse(b.punchedAt))
  const nowMinutes = localMinutes(now, timeZone)

  const intervals: { start: number; end: number; open: boolean }[] = []
  for (let i = 0; i < sorted.length; i += 2) {
    const start = localMinutes(sorted[i].punchedAt, timeZone)
    const next = sorted[i + 1]
    if (next) {
      let end = localMinutes(next.punchedAt, timeZone)
      if (end < start) end += 1440
      intervals.push({ start, end, open: false })
    } else if (isToday) {
      intervals.push({ start, end: Math.max(nowMinutes, start), open: true })
    }
  }

  const first = intervals[0]?.start ?? 8 * 60
  const last = intervals.at(-1)?.end ?? 18 * 60
  const rangeStart = Math.min(7 * 60, Math.floor(first / 60) * 60)
  const rangeEnd = Math.max(19 * 60, Math.ceil(last / 60) * 60)
  const span = rangeEnd - rangeStart
  const pct = (m: number) => `${((m - rangeStart) / span) * 100}%`

  const ticks: number[] = []
  for (let t = rangeStart; t <= rangeEnd; t += 120) ticks.push(t)

  return (
    <div className={cn("w-full", className)}>
      <div className="relative h-9 overflow-hidden rounded-lg bg-muted">
        {ticks.slice(1, -1).map((t) => (
          <span
            key={t}
            className="absolute inset-y-0 w-px bg-foreground/5"
            style={{ left: pct(t) }}
          />
        ))}
        {intervals.map((interval) => (
          <span
            key={interval.start}
            title={`${minutesToClock(interval.start)} – ${interval.open ? "agora" : minutesToClock(interval.end)}`}
            className={cn(
              "absolute inset-y-1.5 rounded-md bg-working",
              interval.open && "animate-pulse bg-working/70",
            )}
            style={{
              left: pct(interval.start),
              width: `max(4px, calc(${pct(interval.end)} - ${pct(interval.start)}))`,
            }}
          />
        ))}
        {isToday && nowMinutes >= rangeStart && nowMinutes <= rangeEnd && (
          <span
            className="absolute inset-y-0 w-0.5 bg-foreground/60"
            style={{ left: pct(nowMinutes) }}
          />
        )}
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-muted-foreground tabular">
        {ticks.map((t, i) => (
          <span
            key={t}
            className={cn(
              "absolute -translate-x-1/2",
              i === 0 && "translate-x-0",
              i === ticks.length - 1 && "-translate-x-full",
            )}
            style={{ left: pct(t) }}
          >
            {String(Math.floor((t % 1440) / 60)).padStart(2, "0")}h
          </span>
        ))}
      </div>
    </div>
  )
}
