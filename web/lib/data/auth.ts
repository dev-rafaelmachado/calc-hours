import "server-only"

import { redirect } from "next/navigation"
import { cache } from "react"

import { createClient } from "@/lib/supabase/server"

export interface CurrentUser {
  id: string
  email: string | null
}

/**
 * Data Access Layer entry point: every read and Server Action goes through
 * here, so authorization never relies on proxy.ts alone.
 */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) redirect("/login")
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null }
})
