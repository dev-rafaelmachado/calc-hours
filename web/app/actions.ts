"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { requireUser } from "@/lib/data/auth"
import { getPunches, getSettings, getWorkDays } from "@/lib/data/repository"
import { addDays } from "@/lib/domain/dates"
import type { WorkMode } from "@/lib/domain/days"
import { formatIntervals } from "@/lib/format-punches"
import { parsePunchesCsv } from "@/lib/import/csv"
import { parseSolidesTimesheet, planSolidesImport, type DayAction } from "@/lib/import/solides"
import { localDate, localMinutes, zonedInstant } from "@/lib/domain/punches"
import { minutesToClock, parseHHMM } from "@/lib/domain/time"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string }

const UNIQUE_VIOLATION = "23505"
/** An open interval from yesterday this recent is still the same shift. */
const OVERNIGHT_WINDOW_MS = 16 * 60 * 60 * 1000

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
const clockTime = z.string().refine((value) => {
  try {
    parseHHMM(value)
    return true
  } catch {
    return false
  }
}, "Horário inválido, use HH:MM")

function fail(error: unknown, fallback: string): ActionResult {
  if (typeof error === "object" && error && "code" in error && error.code === UNIQUE_VIOLATION) {
    return { ok: false, error: "Já existe uma batida nesse horário." }
  }
  console.error(error)
  return { ok: false, error: fallback }
}

export async function signIn(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ email: z.email("E-mail inválido"), password: z.string().min(1, "Informe a senha") })
    .safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { ok: false, error: "E-mail ou senha inválidos." }
  redirect("/")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

/** Records a punch at the current time on the right workday. */
export async function punchNow(): Promise<ActionResult> {
  await requireUser()
  const { timezone } = await getSettings()
  const supabase = await createClient()
  const now = new Date()
  const today = localDate(now, timezone)
  const yesterday = addDays(today, -1)

  const { data: recent, error: readError } = await supabase
    .from("punches")
    .select("work_date, punched_at")
    .in("work_date", [yesterday, today])
    .order("punched_at")
  if (readError) return fail(readError, "Não foi possível ler as batidas.")

  // A shift that started yesterday and is still open keeps yesterday's date.
  const fromYesterday = recent.filter((p) => p.work_date === yesterday)
  const fromToday = recent.filter((p) => p.work_date === today)
  const lastYesterday = fromYesterday.at(-1)
  const continuesShift =
    fromToday.length === 0 &&
    fromYesterday.length % 2 === 1 &&
    lastYesterday !== undefined &&
    now.getTime() - Date.parse(lastYesterday.punched_at) < OVERNIGHT_WINDOW_MS
  const workDate = continuesShift ? yesterday : today
  const count = continuesShift ? fromYesterday.length : fromToday.length

  const { error } = await supabase
    .from("punches")
    .insert({ punched_at: now.toISOString(), work_date: workDate, source: "manual" })
  if (error) return fail(error, "Não foi possível registrar a batida.")

  refresh()
  const kind = count % 2 === 0 ? "Entrada" : "Saída"
  return { ok: true, message: `${kind} registrada às ${minutesToClock(localMinutes(now, timezone))}` }
}

const punchInput = z.object({ date: isoDate, time: clockTime })

export async function addPunch(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireUser()
  const parsed = punchInput.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { timezone } = await getSettings()
  const { date, time } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from("punches").insert({
    punched_at: zonedInstant(date, parseHHMM(time), timezone).toISOString(),
    work_date: date,
    source: "manual",
  })
  if (error) return fail(error, "Não foi possível adicionar a batida.")
  refresh()
  return { ok: true, message: `Batida das ${time} adicionada` }
}

export async function updatePunch(
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireUser()
  const parsed = punchInput
    .extend({ id: z.coerce.number().int().positive() })
    .safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { timezone } = await getSettings()
  const { id, date, time } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from("punches")
    .update({ punched_at: zonedInstant(date, parseHHMM(time), timezone).toISOString() })
    .eq("id", id)
  if (error) return fail(error, "Não foi possível alterar a batida.")
  refresh()
  return { ok: true, message: `Batida alterada para ${time}` }
}

export async function deletePunch(id: number): Promise<ActionResult> {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from("punches").delete().eq("id", id)
  if (error) return fail(error, "Não foi possível remover a batida.")
  refresh()
  return { ok: true, message: "Batida removida" }
}

const workDayInput = z.object({
  date: isoDate,
  isHoliday: z.boolean(),
  workMode: z.enum(["home_office", "presencial"]).nullable(),
})

export async function saveWorkDay(input: z.input<typeof workDayInput>): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = workDayInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { date, isHoliday, workMode } = parsed.data

  const supabase = await createClient()
  const { error } =
    !isHoliday && workMode === null
      ? await supabase.from("work_days").delete().eq("work_date", date)
      : await supabase.from("work_days").upsert({
          user_id: user.id,
          work_date: date,
          is_holiday: isHoliday,
          work_mode: workMode,
          updated_at: new Date().toISOString(),
        })
  if (error) return fail(error, "Não foi possível salvar o dia.")
  refresh()
  return { ok: true, message: "Dia atualizado" }
}

const MAX_CSV_BYTES = 1_000_000

export async function importCsv(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser()
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Escolha um arquivo CSV." }
  if (file.size > MAX_CSV_BYTES) return { ok: false, error: "Arquivo grande demais (máx. 1 MB)." }
  const referenceMonday = isoDate.safeParse(formData.get("referenceMonday"))

  const { punches, skippedRows } = parsePunchesCsv(
    await file.text(),
    referenceMonday.success ? referenceMonday.data : undefined,
  )
  if (punches.length === 0) {
    return { ok: false, error: "Nenhuma batida reconhecida. Confira as colunas do arquivo." }
  }

  const { timezone } = await getSettings()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("punches")
    .upsert(
      punches.map((p) => ({
        user_id: user.id,
        punched_at: zonedInstant(p.date, p.minutes, timezone).toISOString(),
        work_date: p.date,
        source: "csv",
      })),
      { onConflict: "user_id,punched_at", ignoreDuplicates: true },
    )
    .select("id")
  if (error) return fail(error, "Não foi possível importar o arquivo.")

  refresh()
  const inserted = data.length
  const ignored = punches.length - inserted
  const parts = [`${inserted} batida(s) importada(s)`]
  if (ignored > 0) parts.push(`${ignored} já existiam`)
  if (skippedRows > 0) parts.push(`${skippedRows} linha(s) ignorada(s)`)
  return { ok: true, message: parts.join(" · ") }
}

const MAX_SOLIDES_CHARS = 500_000

async function buildSolidesPlan(text: string) {
  const days = parseSolidesTimesheet(text)
  if (days.length === 0) return null
  const dates = days.map((d) => d.date).sort()
  const { timezone } = await getSettings()
  const [punches, meta] = await Promise.all([getPunches(dates[0], dates.at(-1)), getWorkDays()])
  const today = localDate(new Date(), timezone)
  return { plans: planSolidesImport(days, punches, meta, { today, timeZone: timezone }), timezone }
}

export interface SolidesPreviewDay {
  date: string
  action: DayAction
  imported: string
  current: string
  importedMinutes: number
  isHoliday: boolean
  workMode: WorkMode | null
  editedCount: number
  warnings: string[]
}

export type SolidesPreview = { ok: true; days: SolidesPreviewDay[] } | { ok: false; error: string }

const SOLIDES_EMPTY =
  "Nenhum dia reconhecido. Copie a tabela da Apropriação de horas a partir da linha com a data."

/** Read-only: what importing the pasted text would change, day by day. */
export async function previewSolidesImport(text: string): Promise<SolidesPreview> {
  await requireUser()
  if (text.length > MAX_SOLIDES_CHARS) return { ok: false, error: "Texto grande demais." }
  const built = await buildSolidesPlan(text)
  if (!built) return { ok: false, error: SOLIDES_EMPTY }
  const clock = (m: number) => minutesToClock(m)
  return {
    ok: true,
    days: built.plans.map((plan) => ({
      date: plan.date,
      action: plan.action,
      imported: plan.imported.intervals
        .map((i) => `${clock(i.start)}–${i.end === null ? "…" : clock(i.end)}`)
        .join(" · "),
      current: formatIntervals(plan.existing, built.timezone),
      importedMinutes: plan.imported.intervals.reduce(
        (sum, i) => sum + (i.end === null ? 0 : (i.end - i.start + 1440) % 1440),
        0,
      ),
      isHoliday: plan.imported.isHoliday,
      workMode: plan.imported.workMode,
      editedCount: plan.imported.intervals.filter((i) => i.edited).length,
      warnings: plan.imported.warnings,
    })),
  }
}

export async function applySolidesImport(text: string): Promise<ActionResult> {
  const user = await requireUser()
  if (text.length > MAX_SOLIDES_CHARS) return { ok: false, error: "Texto grande demais." }
  const built = await buildSolidesPlan(text)
  if (!built) return { ok: false, error: SOLIDES_EMPTY }
  const { plans } = built
  const supabase = await createClient()

  // Insert before deleting, so a failure never leaves a day empty.
  const inserts = plans.flatMap((p) => p.insert)
  if (inserts.length > 0) {
    const { error } = await supabase.from("punches").upsert(
      inserts.map((i) => ({
        user_id: user.id,
        punched_at: i.punchedAt,
        work_date: i.workDate,
        source: "solides",
      })),
      { onConflict: "user_id,punched_at", ignoreDuplicates: true },
    )
    if (error) return fail(error, "Não foi possível gravar as batidas da Sólides.")
  }
  const deleteIds = plans.flatMap((p) => p.deleteIds)
  if (deleteIds.length > 0) {
    const { error } = await supabase.from("punches").delete().in("id", deleteIds)
    if (error) return fail(error, "As batidas novas entraram, mas não foi possível remover as antigas.")
  }
  const relabelIds = plans.flatMap((p) => p.relabelIds)
  if (relabelIds.length > 0) {
    // Only the "Sólides" badge depends on this, so a failure is logged, not fatal.
    const { error } = await supabase.from("punches").update({ source: "solides" }).in("id", relabelIds)
    if (error) console.error("relabel solides punches", error)
  }
  const metas = plans.flatMap((p) => (p.meta ? [p.meta] : []))
  if (metas.length > 0) {
    const { error } = await supabase.from("work_days").upsert(
      metas.map((m) => ({
        user_id: user.id,
        work_date: m.workDate,
        is_holiday: m.isHoliday,
        work_mode: m.workMode,
        updated_at: new Date().toISOString(),
      })),
    )
    if (error) return fail(error, "As batidas entraram, mas não foi possível marcar feriados e modos.")
  }

  refresh()
  const count = (action: DayAction) => plans.filter((p) => p.action === action).length
  const parts = [`${count("new") + count("replace") + count("merge")} dia(s) atualizados`]
  if (count("same") > 0) parts.push(`${count("same")} já estavam iguais`)
  const holidays = metas.filter((m) => m.isHoliday).length
  if (holidays > 0) parts.push(`${holidays} feriado(s) marcado(s)`)
  return { ok: true, message: parts.join(" · ") }
}

const money = z.coerce.number().min(0, "Valores não podem ser negativos")

export async function saveSettings(
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = z
    .object({
      dayTargetHours: z.coerce.number().min(0).max(24),
      valorBase: money,
      valorHora: money,
      valorBonus: money,
      valorAuxTransporte: money,
      pixKey: z.string().trim().max(200),
    })
    .safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const s = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from("user_settings").upsert({
    user_id: user.id,
    day_target_minutes: Math.round(s.dayTargetHours * 60),
    valor_base: s.valorBase,
    valor_hora: s.valorHora,
    valor_bonus: s.valorBonus,
    valor_aux_transporte: s.valorAuxTransporte,
    pix_key: s.pixKey || null,
    updated_at: new Date().toISOString(),
  })
  if (error) return fail(error, "Não foi possível salvar as configurações.")
  refresh()
  return { ok: true, message: "Configurações salvas" }
}
