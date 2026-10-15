import Papa from "papaparse"

import type { MonthMetrics } from "@/lib/domain/month"
import { minutesToDuration } from "@/lib/domain/time"

import type { MonthRow } from "./month-rows"

// BOM so Excel opens the accents correctly, like the legacy utf-8-sig export.
const BOM = "﻿"

export function monthCsv(rows: MonthRow[]): string {
  return (
    BOM +
    Papa.unparse(
      rows.map((r) => ({
        Dia: r.dia,
        "Dia da semana": r.diaSemana,
        Marcações: r.marcacoes,
        Pausas: r.pausas,
        Modalidade: r.modalidade,
        "Total HH:MM": r.total,
      })),
    )
  )
}

export function metricsCsv(metrics: MonthMetrics): string {
  const indicators = Papa.unparse([
    { Indicador: "Horas no mês", Valor: minutesToDuration(metrics.totalMinutes) },
    { Indicador: "Meta do mês", Valor: minutesToDuration(metrics.targetMinutes) },
    { Indicador: "Falta para fechar mês", Valor: minutesToDuration(metrics.remainingMinutes) },
    { Indicador: "Extra no mês", Valor: minutesToDuration(metrics.extraMinutes) },
    { Indicador: "Horas extras por semana (soma)", Valor: minutesToDuration(metrics.weeklyOvertimeMinutes) },
    { Indicador: "Horas faltantes de semanas", Valor: minutesToDuration(metrics.weeklyDebtMinutes) },
  ])
  const weeks = Papa.unparse(
    metrics.weeks.map((w) => ({
      Semana: w.weekStart,
      Período: `${w.weekStart} a ${w.weekEnd}`,
      Horas: minutesToDuration(w.workedMinutes),
      Extra: minutesToDuration(w.extraMinutes),
      Faltou: minutesToDuration(w.debtMinutes),
    })),
  )
  return `${BOM}${indicators}\n\nDetalhe semanal no mês\n${weeks}`
}
