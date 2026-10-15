import "server-only"

import { cache } from "react"

import type { IsoDate } from "@/lib/domain/dates"
import { buildDayRecords, type DayRecord, type WorkDayMeta, type WorkMode } from "@/lib/domain/days"
import { localDate, localMinutes, type Punch, type PunchSource } from "@/lib/domain/punches"
import type { RemunerationConfig } from "@/lib/domain/remuneration"
import { createClient } from "@/lib/supabase/server"

import { requireUser, type CurrentUser } from "./auth"

export interface Settings extends RemunerationConfig {
  dayTargetMinutes: number
  timezone: string
  pixKey: string
  solidesLastSyncAt: string | null
}

const DEFAULT_SETTINGS: Settings = {
  dayTargetMinutes: 480,
  timezone: "America/Sao_Paulo",
  valorBase: 0,
  valorHora: 0,
  valorBonus: 0,
  valorAuxTransporte: 0,
  pixKey: "",
  solidesLastSyncAt: null,
}

// PostgREST caps a response at 1000 rows; history grows past that in a year.
const PAGE_SIZE = 1000

export const getSettings = cache(async (): Promise<Settings> => {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from("user_settings").select("*").maybeSingle()
  if (error) throw error
  if (!data) return DEFAULT_SETTINGS
  return {
    dayTargetMinutes: data.day_target_minutes,
    timezone: data.timezone,
    valorBase: Number(data.valor_base),
    valorHora: Number(data.valor_hora),
    valorBonus: Number(data.valor_bonus),
    valorAuxTransporte: Number(data.valor_aux_transporte),
    pixKey: data.pix_key ?? "",
    solidesLastSyncAt: data.solides_last_sync_at,
  }
})

interface PunchRow {
  id: number
  punched_at: string
  work_date: string
  source: PunchSource
  note: string | null
}

export const getPunches = cache(async (from?: IsoDate, to?: IsoDate): Promise<Punch[]> => {
  await requireUser()
  const supabase = await createClient()
  const rows: PunchRow[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from("punches")
      .select("id, punched_at, work_date, source, note")
      .order("punched_at")
      .range(offset, offset + PAGE_SIZE - 1)
    if (from) query = query.gte("work_date", from)
    if (to) query = query.lte("work_date", to)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data as PunchRow[]))
    if (data.length < PAGE_SIZE) break
  }
  return rows.map((r) => ({
    id: r.id,
    punchedAt: r.punched_at,
    workDate: r.work_date,
    source: r.source,
    note: r.note,
  }))
})

export const getWorkDays = cache(async (): Promise<WorkDayMeta[]> => {
  await requireUser()
  const supabase = await createClient()
  const rows: { work_date: string; is_holiday: boolean; work_mode: WorkMode | null }[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("work_days")
      .select("work_date, is_holiday, work_mode")
      .order("work_date")
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return rows.map((r) => ({ workDate: r.work_date, isHoliday: r.is_holiday, workMode: r.work_mode }))
})

type RawRow = Record<string, unknown>

async function allRows(table: "punches" | "work_days", orderBy: string): Promise<RawRow[]> {
  const supabase = await createClient()
  const rows: RawRow[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(orderBy)
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

/** Every row the user owns, with all columns, for the JSON backup. */
export async function getAllData(): Promise<{
  settings: RawRow | null
  workDays: RawRow[]
  punches: RawRow[]
}> {
  await requireUser()
  const supabase = await createClient()
  const [settings, workDays, punches] = await Promise.all([
    supabase.from("user_settings").select("*").maybeSingle(),
    allRows("work_days", "work_date"),
    allRows("punches", "punched_at"),
  ])
  if (settings.error) throw settings.error
  return { settings: settings.data, workDays, punches }
}

export interface Workspace {
  user: CurrentUser
  settings: Settings
  /** Server time of this render. */
  now: Date
  today: IsoDate
  /** Local minutes since midnight of `now`. */
  nowMinutes: number
  punches: Punch[]
  meta: WorkDayMeta[]
  days: DayRecord[]
}

/** Everything a page needs, loaded once per request. */
export const loadWorkspace = cache(async (): Promise<Workspace> => {
  const user = await requireUser()
  const [settings, punches, meta] = await Promise.all([getSettings(), getPunches(), getWorkDays()])
  const now = new Date()
  const today = localDate(now, settings.timezone)
  return {
    user,
    settings,
    now,
    today,
    nowMinutes: localMinutes(now, settings.timezone),
    punches,
    meta,
    days: buildDayRecords(punches, meta, { today, now, timeZone: settings.timezone }),
  }
})
