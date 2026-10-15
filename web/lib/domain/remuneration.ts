// Ported from hours_app/services.py (remuneration_breakdown).

import { monthEnd, monthStart, type IsoDate } from "./dates"
import type { DayRecord } from "./days"
import { monthMetrics } from "./month"

export interface RemunerationConfig {
  valorBase: number
  valorHora: number
  valorBonus: number
  valorAuxTransporte: number
}

export interface RemunerationBreakdown extends RemunerationConfig {
  workedHours: number
  targetHours: number
  horasExcedentes: number
  horasFaltantes: number
  ajusteHoras: number
  presencialDays: number
  auxTransporteTotal: number
  bonusTotal: number
  totalRemuneracao: number
}

export function remunerationBreakdown(
  days: DayRecord[],
  month: IsoDate,
  config: RemunerationConfig,
  dayTargetMinutes: number,
  { bonusApplied }: { bonusApplied: boolean },
): RemunerationBreakdown {
  const metrics = monthMetrics(days, month, dayTargetMinutes)
  const { totalMinutes, targetMinutes } = metrics

  let horasExcedentes = 0
  let horasFaltantes = 0
  let ajusteHoras: number
  if (totalMinutes >= targetMinutes) {
    horasExcedentes = (totalMinutes - targetMinutes) / 60
    ajusteHoras = config.valorHora * horasExcedentes
  } else {
    horasFaltantes = (targetMinutes - totalMinutes) / 60
    ajusteHoras = -config.valorHora * horasFaltantes
  }

  const first = monthStart(month)
  const last = monthEnd(month)
  // Counts every presencial day in the month, with or without punches, like
  // the legacy rule that also counted day markers.
  const presencialDays = days.filter(
    (d) => d.date >= first && d.date <= last && !d.isHoliday && d.workMode === "presencial",
  ).length

  const auxTransporteTotal = presencialDays * config.valorAuxTransporte
  const bonusTotal = bonusApplied ? config.valorBonus : 0

  return {
    ...config,
    workedHours: totalMinutes / 60,
    targetHours: targetMinutes / 60,
    horasExcedentes,
    horasFaltantes,
    ajusteHoras,
    presencialDays,
    auxTransporteTotal,
    bonusTotal,
    totalRemuneracao: config.valorBase + ajusteHoras + bonusTotal + auxTransporteTotal,
  }
}
