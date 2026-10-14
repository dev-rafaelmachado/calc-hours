import { localMinutes, type Punch } from "@/lib/domain/punches"
import { minutesToClock } from "@/lib/domain/time"

/** "08:02–12:01 · 13:05–18:10", with "…" for an interval still open. */
export function formatIntervals(punches: Punch[], timeZone: string): string {
  const sorted = [...punches].sort((a, b) => Date.parse(a.punchedAt) - Date.parse(b.punchedAt))
  const clock = (p: Punch) => minutesToClock(localMinutes(p.punchedAt, timeZone))
  const pairs: string[] = []
  for (let i = 0; i < sorted.length; i += 2) {
    const next = sorted[i + 1]
    pairs.push(`${clock(sorted[i])}–${next ? clock(next) : "…"}`)
  }
  return pairs.join(" · ")
}

export function groupByWorkDate(punches: Punch[]): Map<string, Punch[]> {
  const map = new Map<string, Punch[]>()
  for (const punch of punches) {
    map.set(punch.workDate, [...(map.get(punch.workDate) ?? []), punch])
  }
  return map
}
