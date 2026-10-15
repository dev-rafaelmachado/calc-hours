// `db` gives each test a clean slate for the test user and helpers to seed
// days straight into the local database.

import { test as base, expect } from "@playwright/test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { addDays, weekdayIndex } from "../lib/domain/dates"
import { localDate, zonedInstant } from "../lib/domain/punches"
import { parseHHMM } from "../lib/domain/time"

import { E2E_USER, localSupabase } from "./env"

export const TZ = "America/Sao_Paulo"

/** Today in São Paulo, like the app computes it. */
export const today = () => localDate(new Date(), TZ)

/** The `count` most recent weekdays before today, oldest first. */
export function pastWeekdays(count: number, before = today()): string[] {
  const out: string[] = []
  for (let d = addDays(before, -1); out.length < count; d = addDays(d, -1)) {
    if (weekdayIndex(d) < 5) out.unshift(d)
  }
  return out
}

export interface Db {
  client: SupabaseClient
  userId: string
  reset(): Promise<void>
  seedDay(date: string, times: string[], meta?: { holiday?: boolean; mode?: "presencial" | "home_office" }): Promise<void>
  countPunches(): Promise<number>
}

export const test = base.extend<{ db: Db }, { userId: string }>({
  userId: [
    async ({}, provide) => {
      const { url, secretKey } = localSupabase()
      const admin = createClient(url, secretKey, { auth: { persistSession: false } })
      const { data, error } = await admin.auth.admin.listUsers()
      if (error) throw error
      const user = data.users.find((u) => u.email === E2E_USER.email)
      if (!user) throw new Error("Usuário de teste não encontrado; o global setup rodou?")
      await provide(user.id)
    },
    { scope: "worker" },
  ],

  db: async ({ userId }, provide) => {
    const { url, secretKey } = localSupabase()
    const client = createClient(url, secretKey, { auth: { persistSession: false } })
    const check = ({ error }: { error: unknown }) => {
      if (error) throw error
    }

    const db: Db = {
      client,
      userId,
      async reset() {
        for (const table of ["punches", "work_days", "user_settings"]) {
          check(await client.from(table).delete().eq("user_id", userId))
        }
      },
      async seedDay(date, times, meta) {
        if (times.length > 0) {
          check(
            await client.from("punches").insert(
              times.map((time) => ({
                user_id: userId,
                work_date: date,
                punched_at: zonedInstant(date, parseHHMM(time), TZ).toISOString(),
                source: "manual",
              })),
            ),
          )
        }
        if (meta) {
          check(
            await client.from("work_days").upsert({
              user_id: userId,
              work_date: date,
              is_holiday: meta.holiday ?? false,
              work_mode: meta.mode ?? null,
            }),
          )
        }
      },
      async countPunches() {
        const { count, error } = await client
          .from("punches")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
        if (error) throw error
        return count ?? 0
      },
    }

    await db.reset()
    await provide(db)
  },
})

export { expect }
