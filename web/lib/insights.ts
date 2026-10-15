// Turns the analytics into the short sentences of "O que os dados dizem".
// Each rule speaks only when the difference is large enough to matter.

import type {
  ClosedDay,
  HabitShift,
  HabitStats,
  MonthPoint,
  MonthProjection,
  PeriodRecords,
  PeriodSummary,
  WeekdayHabits,
} from "@/lib/domain/analytics"
import { WEEKDAY_LABELS } from "@/lib/domain/dates"
import type { WorkMode } from "@/lib/domain/days"
import { minutesToClock, minutesToHuman } from "@/lib/domain/time"
import { formatDayShort, formatMonthName } from "@/lib/format"

export type InsightTone = "positive" | "warning" | "neutral"

export interface Insight {
  id: string
  tone: InsightTone
  title: string
  detail?: string
  href?: string
}

export interface InsightInput {
  dayTargetMinutes: number
  summary: PeriodSummary
  months: MonthPoint[]
  weekdays: WeekdayHabits[]
  modes: Record<WorkMode, HabitStats | null>
  records: PeriodRecords
  shift: HabitShift | null
  projection: MonthProjection | null
  closed: ClosedDay[]
}

/** Minimum differences (minutes) and sample sizes before a rule speaks. */
const MIN_START_GAP = 10
const MIN_WORKED_GAP = 15
const MIN_WEEKDAY_GAP = 20
const MIN_SHIFT_GAP = 15
const MIN_MODE_DAYS = 5
const MIN_WEEKDAY_DAYS = 3
const LATE_EXIT = 19 * 60

/** 35 -> "35 min", 70 -> "1h 10m" */
function gap(minutes: number): string {
  const abs = Math.abs(minutes)
  return abs < 60 ? `${abs} min` : minutesToHuman(abs)
}

/** 540 -> "9h", 570 -> "9h 30m" */
function hours(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60}h` : minutesToHuman(minutes)
}

const signed = (minutes: number) => `${minutes >= 0 ? "+" : "-"}${minutesToHuman(Math.abs(minutes))}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const dayHref = (date: string) => `/registros?m=${date.slice(0, 7)}&d=${date}`

function projectionInsight(p: MonthProjection): Insight {
  const month = formatMonthName(p.month)
  const balance = p.projectedBalanceMinutes
  let detail = `Média de ${minutesToHuman(p.avgPerDayMinutes)} em ${plural(p.closedDays, "dia fechado", "dias fechados")}`
  detail += p.remainingDays > 0 ? `; faltam ${plural(p.remainingDays, "dia útil", "dias úteis")}.` : "."
  if (balance < 0 && p.remainingDays > 0) {
    const perDay = Math.ceil((p.targetMinutes - p.workedMinutes) / p.remainingDays)
    detail += ` Para zerar, são ${minutesToHuman(perDay)} por dia.`
  }
  return {
    id: "projection",
    tone: balance >= 0 ? "positive" : "warning",
    title:
      balance >= 0
        ? `No ritmo de ${month}, você fecha o mês com ${signed(balance)}`
        : `No ritmo de ${month}, o mês fecha faltando ${minutesToHuman(-balance)}`,
    detail,
  }
}

function dataInsight(summary: PeriodSummary): Insight | null {
  const missing = summary.missingDays.length
  const incomplete = summary.incompleteDays.length
  if (missing + incomplete === 0) return null
  const parts = [
    missing > 0 && plural(missing, "dia útil sem batida", "dias úteis sem batida"),
    incomplete > 0 && plural(incomplete, "dia incompleto", "dias incompletos"),
  ].filter(Boolean)
  const latest = [...summary.missingDays, ...summary.incompleteDays].sort().at(-1)!
  return {
    id: "data",
    tone: "warning",
    title: `${parts.join(" e ")} no período`,
    detail: "Contam como falta no saldo. Se foi folga ou feriado, marque o dia em Registros.",
    href: dayHref(latest),
  }
}

function shiftInsight(shift: HabitShift): Insight | null {
  const { recent, before } = shift
  const lead = `Nos últimos ${recent.days} dias trabalhados`
  const start = recent.avgStart - before.avgStart
  if (Math.abs(start) >= MIN_SHIFT_GAP) {
    return {
      id: "shift",
      tone: "neutral",
      title: `${lead} você está começando ${gap(start)} mais ${start > 0 ? "tarde" : "cedo"}`,
      detail: `Entrada média ${minutesToClock(recent.avgStart)}; antes, ${minutesToClock(before.avgStart)}.`,
    }
  }
  const worked = recent.avgWorkedMinutes - before.avgWorkedMinutes
  if (Math.abs(worked) >= MIN_SHIFT_GAP) {
    return {
      id: "shift",
      tone: "neutral",
      title: `${lead} você está trabalhando ${gap(worked)} a ${worked > 0 ? "mais" : "menos"} por dia`,
      detail: `${minutesToHuman(recent.avgWorkedMinutes)} por dia; antes, ${minutesToHuman(before.avgWorkedMinutes)}.`,
    }
  }
  const pause = recent.avgBreakMinutes - before.avgBreakMinutes
  if (Math.abs(pause) >= MIN_SHIFT_GAP) {
    return {
      id: "shift",
      tone: "neutral",
      title: `${lead} sua pausa está ${gap(pause)} mais ${pause > 0 ? "longa" : "curta"}`,
      detail: `Pausa média ${minutesToHuman(recent.avgBreakMinutes)}; antes, ${minutesToHuman(before.avgBreakMinutes)}.`,
    }
  }
  return null
}

function modeInsight(modes: Record<WorkMode, HabitStats | null>): Insight | null {
  const p = modes.presencial
  const h = modes.home_office
  if (!p || !h || p.days < MIN_MODE_DAYS || h.days < MIN_MODE_DAYS) return null
  const start = p.avgStart - h.avgStart
  const worked = p.avgWorkedMinutes - h.avgWorkedMinutes
  let title: string
  if (Math.abs(start) >= MIN_START_GAP) {
    title = `Nos dias presenciais você começa ${gap(start)} mais ${start > 0 ? "tarde" : "cedo"}`
  } else if (Math.abs(worked) >= MIN_WORKED_GAP) {
    title = `Nos dias presenciais você trabalha ${gap(worked)} a ${worked > 0 ? "mais" : "menos"} por dia`
  } else {
    title = "Presencial e home office têm o mesmo ritmo"
  }
  return {
    id: "mode",
    tone: "neutral",
    title,
    detail:
      `Presencial × home office: entrada ${minutesToClock(p.avgStart)} × ${minutesToClock(h.avgStart)}, ` +
      `saída ${minutesToClock(p.avgEnd)} × ${minutesToClock(h.avgEnd)}, ` +
      `${minutesToHuman(p.avgWorkedMinutes)} × ${minutesToHuman(h.avgWorkedMinutes)} por dia.`,
  }
}

function weekdayInsight(weekdays: WeekdayHabits[]): Insight | null {
  const candidates = weekdays.filter((w) => w.weekday < 5 && w.stats.days >= MIN_WEEKDAY_DAYS)
  if (candidates.length < 3) return null
  const byWorked = [...candidates].sort((a, b) => a.stats.avgWorkedMinutes - b.stats.avgWorkedMinutes)
  const shortest = byWorked[0]
  const longest = byWorked.at(-1)!
  if (longest.stats.avgWorkedMinutes - shortest.stats.avgWorkedMinutes < MIN_WEEKDAY_GAP) return null
  return {
    id: "weekday",
    tone: "neutral",
    title: `${WEEKDAY_LABELS[shortest.weekday]} é o seu dia mais curto: ${minutesToHuman(shortest.stats.avgWorkedMinutes)} em média`,
    detail: `O mais longo é ${WEEKDAY_LABELS[longest.weekday].toLowerCase()}, com ${minutesToHuman(longest.stats.avgWorkedMinutes)}.`,
  }
}

function monthsInsight(months: MonthPoint[]): Insight | null {
  const complete = months.filter((m) => !m.partial)
  if (complete.length < 2) return null
  const byBalance = [...complete].sort((a, b) => a.balanceMinutes - b.balanceMinutes)
  const worst = byBalance[0]
  const best = byBalance.at(-1)!
  return {
    id: "months",
    tone: best.balanceMinutes >= 0 ? "positive" : "warning",
    title: `Melhor mês: ${formatMonthName(best.month)}, com ${signed(best.balanceMinutes)}`,
    detail:
      worst.balanceMinutes < 0
        ? `O pior foi ${formatMonthName(worst.month)}, com ${signed(worst.balanceMinutes)}.`
        : `Os ${complete.length} meses fechados terminaram sem faltar hora.`,
  }
}

function streakInsight(records: PeriodRecords): Insight | null {
  const { bestStreak: best, currentStreak: current } = records
  if (current && current.days >= 3) {
    return {
      id: "streak",
      tone: "positive",
      title: `${current.days} dias úteis seguidos batendo a meta`,
      detail:
        best && best.days > current.days
          ? `Seu recorde no período é ${best.days}, de ${formatDayShort(best.from)} a ${formatDayShort(best.to)}.`
          : "É o seu recorde no período.",
    }
  }
  if (best && best.days >= 5) {
    return {
      id: "streak",
      tone: "neutral",
      title: `Recorde: ${best.days} dias úteis seguidos batendo a meta`,
      detail: `De ${formatDayShort(best.from)} a ${formatDayShort(best.to)}.`,
    }
  }
  return null
}

function longDaysInsight(closed: ClosedDay[], dayTargetMinutes: number): Insight | null {
  const threshold = dayTargetMinutes + 60
  const long = closed.filter((d) => d.workedMinutes >= threshold).length
  if (long < 3) return null
  const late = closed.filter((d) => d.end > LATE_EXIT).length
  return {
    id: "long-days",
    tone: "neutral",
    title: `Você passou de ${hours(threshold)} em ${long} dias (${Math.round((long / closed.length) * 100)}%)`,
    detail: late > 0 ? `Saiu depois das ${hours(LATE_EXIT)} em ${plural(late, "dia", "dias")}.` : undefined,
  }
}

export function buildInsights(input: InsightInput): Insight[] {
  return [
    input.projection && projectionInsight(input.projection),
    dataInsight(input.summary),
    input.shift && shiftInsight(input.shift),
    modeInsight(input.modes),
    weekdayInsight(input.weekdays),
    monthsInsight(input.months),
    streakInsight(input.records),
    longDaysInsight(input.closed, input.dayTargetMinutes),
  ].filter((insight): insight is Insight => Boolean(insight))
}
