// Checks the TypeScript port against outputs of the legacy Python rules.
// The fixture was generated from synthetic data by scripts/gen_parity_fixtures.py
// running hours_app/services.py; both were removed with the Streamlit app and
// live in git history. The fixture is frozen: change it only on purpose.

import { describe, expect, it } from "vitest"

import fixtures from "./__fixtures__/parity.json"
import { addDays, monthEnd, monthStart, weekStart } from "./dates"
import { buildDayRecords, type DayRecord, type WorkDayMeta } from "./days"
import { forecastCurrentWeek } from "./forecast"
import { monthMetrics } from "./month"
import { zonedInstant, type Punch } from "./punches"
import { remunerationBreakdown } from "./remuneration"
import { minutesToDuration, minutesToHuman, parseHHMM } from "./time"
import { currentWeekSummary, weeklySummary } from "./week"

const TZ = "America/Sao_Paulo"

type Entry = (typeof fixtures.entries)[number]

function toRecords(entries: Entry[], today: string) {
  const punches: Punch[] = []
  const meta: WorkDayMeta[] = []
  for (const entry of entries) {
    if (entry.is_holiday) {
      meta.push({ workDate: entry.work_date, isHoliday: true, workMode: null })
      continue
    }
    for (const time of [
      entry.start_time,
      entry.lunch_start_time,
      entry.lunch_end_time,
      entry.end_time,
    ]) {
      punches.push({
        id: punches.length + 1,
        punchedAt: zonedInstant(entry.work_date, parseHHMM(time), TZ).toISOString(),
        workDate: entry.work_date,
        source: "legacy",
      })
    }
    meta.push({
      workDate: entry.work_date,
      isHoliday: false,
      workMode: entry.work_mode === "Presencial" ? "presencial" : "home_office",
    })
  }
  return buildDayRecords(punches, meta, {
    today,
    now: zonedInstant(today, 12 * 60, TZ),
    timeZone: TZ,
  })
}

const allDays = (today: string) => toRecords(fixtures.entries, today)

/** Legacy compensation (sum of every past week's deficit), injected so the
 * forecast algorithm itself can still be compared with the Python output. */
function legacyDebt(days: DayRecord[], today: string, dayTarget: number): number {
  return weeklySummary(days, dayTarget)
    .filter((w) => w.weekStart < weekStart(today))
    .reduce((debt, w) => debt + Math.max(w.targetMinutes - w.workedMinutes, 0), 0)
}

describe("parity with hours_app/services.py", () => {
  it.each(fixtures.currentWeek)("current_week_summary (target $dayTarget)", (c) => {
    const result = currentWeekSummary(allDays(c.today), c.today, c.dayTarget)
    expect(result.weekStart).toBe(c.week_start)
    expect(result.weekEnd).toBe(c.week_end)
    expect(result.workedMinutes).toBe(c.worked_minutes)
    expect(result.remainingMinutes).toBe(c.remaining_minutes)
    expect(result.progress).toBeCloseTo(c.progress, 10)
  })

  it.each(fixtures.weeklySummary)("weekly_summary (target $dayTarget)", (c) => {
    const rows = weeklySummary(allDays("2026-04-15"), c.dayTarget).map((w) => ({
      Semana: w.weekStart,
      Período: `${w.weekStart} a ${w.weekEnd}`,
      Horas: minutesToHuman(w.workedMinutes),
      Registros: w.days,
      Status:
        w.targetMinutes === 0
          ? "Sem meta"
          : w.workedMinutes >= w.targetMinutes
            ? "Meta batida"
            : `Faltam ${minutesToHuman(w.targetMinutes - w.workedMinutes)}`,
    }))
    expect(rows).toEqual(c.rows)
  })

  it.each(fixtures.forecast)(
    "forecast_for_current_week (today $today, target $dayTarget, lock $todayPlanMinutes)",
    (c) => {
      const entries = fixtures.entries.filter(
        (e) => c.today !== "2026-04-13" || e.work_date < "2026-04-13",
      )
      const days = toRecords(entries, c.today)
      const forecast = forecastCurrentWeek(days, c.today, c.dayTarget, {
        todayPlanMinutes: c.todayPlanMinutes ?? undefined,
        previousDebt: legacyDebt(days, c.today, c.dayTarget),
      })
      expect(
        forecast.plan.map((r) => ({ date: r.date, hours: minutesToHuman(r.minutes) })),
      ).toEqual(c.plan)
      expect(forecast.details).toEqual({
        workedCurrentWeek: c.details.worked_current_week,
        missingCurrentWeek: c.details.missing_current_week,
        previousWeeksDebt: c.details.previous_weeks_debt,
        targetToPlan: c.details.target_to_plan,
        projectedWeekTotal: c.details.projected_week_total,
      })
    },
  )

  // Month totals are unchanged. Weeks crossing the month boundary now use a
  // proportional target (see month.ts), so only weeks fully inside the month
  // are compared, and the weekly overtime/debt sums are covered in rules.test.ts.
  it.each(fixtures.monthMetrics)("month_metrics ($month, target $dayTarget)", (c) => {
    const result = monthMetrics(allDays("2026-04-15"), c.month, c.dayTarget)
    expect({
      total_minutes: result.totalMinutes,
      target_minutes: result.targetMinutes,
      remaining_minutes: result.remainingMinutes,
      extra_minutes: result.extraMinutes,
    }).toEqual({
      total_minutes: c.metrics.total_minutes,
      target_minutes: c.metrics.target_minutes,
      remaining_minutes: c.metrics.remaining_minutes,
      extra_minutes: c.metrics.extra_minutes,
    })
    const inside = (w: { weekStart: string; weekEnd: string }) =>
      w.weekStart >= monthStart(c.month) && w.weekEnd <= monthEnd(c.month)
    const expectedWeeks = c.weeks.filter((w) =>
      inside({ weekStart: w.Semana, weekEnd: w.Período.slice(-10) }),
    )
    expect(expectedWeeks.length).toBeGreaterThan(0)
    expect(
      result.weeks
        .filter((w) => inside(w) && w.weekEnd === addDays(w.weekStart, 6))
        .map((w) => ({
          Semana: w.weekStart,
          Período: `${w.weekStart} a ${w.weekEnd}`,
          Horas: minutesToDuration(w.workedMinutes),
          Extra: minutesToDuration(w.extraMinutes),
          Faltou: minutesToDuration(w.debtMinutes),
        })),
    ).toEqual(expectedWeeks)
  })

  it.each(fixtures.remuneration)(
    "remuneration_breakdown ($month, bonus $bonusApplied)",
    (c) => {
      const result = remunerationBreakdown(
        allDays("2026-04-15"),
        c.month,
        {
          valorBase: c.config.valor_base,
          valorHora: c.config.valor_hora,
          valorBonus: c.config.valor_bonus,
          valorAuxTransporte: c.config.valor_aux_transporte,
        },
        c.dayTarget,
        { bonusApplied: c.bonusApplied },
      )
      const expected = c.result
      expect(result.workedHours).toBeCloseTo(expected.worked_hours, 10)
      expect(result.targetHours).toBeCloseTo(expected.target_hours, 10)
      expect(result.horasExcedentes).toBeCloseTo(expected.horas_excedentes, 10)
      expect(result.horasFaltantes).toBeCloseTo(expected.horas_faltantes, 10)
      expect(result.ajusteHoras).toBeCloseTo(expected.ajuste_horas, 8)
      expect(result.presencialDays).toBe(expected.presencial_days)
      expect(result.auxTransporteTotal).toBeCloseTo(expected.aux_transporte_total, 8)
      expect(result.bonusTotal).toBeCloseTo(expected.bonus_total, 8)
      expect(result.totalRemuneracao).toBeCloseTo(expected.total_remuneracao, 8)
    },
  )
})
