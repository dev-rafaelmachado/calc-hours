"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import type { ActionResult } from "@/app/actions"

/** Runs a Server Action in a transition and reports the result as a toast. */
export function useActionToast() {
  const [pending, startTransition] = useTransition()
  const run = (action: () => Promise<ActionResult>, onSuccess?: () => void) =>
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        if (result.message) toast.success(result.message)
        onSuccess?.()
      } else {
        toast.error(result.error)
      }
    })
  return { pending, run }
}
