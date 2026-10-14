"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { requireUser } from "@/lib/data/auth"
import { getSettings } from "@/lib/data/repository"
import { addDays } from "@/lib/domain/dates"
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
