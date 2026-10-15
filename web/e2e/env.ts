// Connection details of the local Supabase started by `pnpm e2e:db`. The
// end-to-end tests write data, so they refuse to run against anything that is
// not on this machine.

import { execFileSync } from "node:child_process"

export interface LocalSupabase {
  url: string
  publishableKey: string
  secretKey: string
}

let cached: LocalSupabase | null = null

export function localSupabase(): LocalSupabase {
  if (cached) return cached
  let raw: string
  try {
    raw = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    throw new Error("Supabase local não está rodando. Rode `pnpm e2e:db` antes de `pnpm e2e`.")
  }
  const status = JSON.parse(raw.slice(raw.indexOf("{"))) as Record<string, string>
  const url = status.API_URL
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url ?? "")) {
    throw new Error(`Os testes e2e só rodam contra um Supabase local, não contra ${url}.`)
  }
  cached = { url, publishableKey: status.PUBLISHABLE_KEY, secretKey: status.SECRET_KEY }
  return cached
}

export const E2E_PORT = 3200
export const E2E_USER = { email: "e2e@example.test", password: "e2e-local-password" }
/** Docker container of the local database (supabase_db_<project_id>). */
export const DB_CONTAINER = "supabase_db_calc-hours"
/** Migrations that build the current schema on an empty database, in order. */
export const SCHEMA_FILES = ["20261014_punches.sql"]
