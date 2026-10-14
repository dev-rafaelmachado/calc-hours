import { monthEnd, monthStart, weekdayLabel, type IsoDate } from "@/lib/domain/dates"
import { WORK_MODE_LABELS, type DayRecord } from "@/lib/domain/days"
import type { Punch } from "@/lib/domain/punches"
import { minutesToDuration } from "@/lib/domain/time"
import { formatDateBr } from "@/lib/format"
import { formatIntervals, groupByWorkDate } from "@/lib/format-punches"

export interface MonthRow {
  date: IsoDate
  dia: string
  diaSemana: string
  marcacoes: string
  pausas: string
  modalidade: string
  total: string
  minutes: number
  isHoliday: boolean
}

/** One row per day of the month with punches or marked as holiday. */
export function buildMonthRows(
  month: IsoDate,
  days: DayRecord[],
  punches: Punch[],
  timeZone: string,
): MonthRow[] {
  const first = monthStart(month)
  const last = monthEnd(month)
  const byDay = groupByWorkDate(punches)
  return days
    .filter((d) => d.date >= first && d.date <= last && (d.hasPunches || d.isHoliday))
    .map((d) => {
      const minutes = d.isHoliday ? 0 : d.workedMinutes
      return {
        date: d.date,
        dia: formatDateBr(d.date),
        diaSemana: weekdayLabel(d.date),
        marcacoes: d.isHoliday ? "" : formatIntervals(byDay.get(d.date) ?? [], timeZone),
        pausas: d.isHoliday ? "" : minutesToDuration(d.breakMinutes),
        modalidade: d.isHoliday ? "Feriado" : d.workMode ? WORK_MODE_LABELS[d.workMode] : "",
        total: minutesToDuration(minutes),
        minutes,
        isHoliday: d.isHoliday,
      }
    })
}
