// Prepares the local database: applies the schema (idempotent) and makes sure
// the test user exists.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

import { createClient } from "@supabase/supabase-js"

import { DB_CONTAINER, E2E_USER, localSupabase, SCHEMA_FILES } from "./env"

const MIGRATIONS_DIR = path.resolve(__dirname, "../../scripts/migrations")

export default async function globalSetup() {
  const { url, secretKey } = localSupabase()

  for (const file of SCHEMA_FILES) {
    execFileSync(
      "docker",
      ["exec", "-i", DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
      { input: readFileSync(path.join(MIGRATIONS_DIR, file)), stdio: ["pipe", "ignore", "inherit"] },
    )
  }
  // PostgREST caches the schema; ask it to pick up the tables just created.
  execFileSync(
    "docker",
    ["exec", DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-c", "notify pgrst, 'reload schema'"],
    { stdio: "ignore" },
  )

  const admin = createClient(url, secretKey, { auth: { persistSession: false } })
  const { error } = await admin.auth.admin.createUser({ ...E2E_USER, email_confirm: true })
  if (error && error.code !== "email_exists") throw error
}
