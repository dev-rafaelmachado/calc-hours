"use client"

import { Building2, House, PartyPopper } from "lucide-react"
import { useOptimistic } from "react"

import { saveWorkDay } from "@/app/actions"
import type { IsoDate } from "@/lib/domain/dates"
import type { WorkMode } from "@/lib/domain/days"
import { cn } from "@/lib/utils"

import { useActionToast } from "./use-action-toast"

interface DayState {
  isHoliday: boolean
  workMode: WorkMode | null
}

const OPTIONS = [
  { key: "home_office", label: "Home office", icon: House },
  { key: "presencial", label: "Presencial", icon: Building2 },
  { key: "holiday", label: "Feriado", icon: PartyPopper },
] as const

/** Segmented control for the day's mode; clicking the active option clears it. */
export function WorkDayControls({
  date,
  isHoliday,
  workMode,
  className,
}: DayState & { date: IsoDate; className?: string }) {
  const [state, setOptimistic] = useOptimistic<DayState>({ isHoliday, workMode })
  const { run } = useActionToast()

  const select = (key: (typeof OPTIONS)[number]["key"]) => {
    const next: DayState =
      key === "holiday"
        ? { isHoliday: !state.isHoliday, workMode: state.workMode }
        : { isHoliday: state.isHoliday, workMode: state.workMode === key ? null : key }
    run(async () => {
      setOptimistic(next)
      return saveWorkDay({ date, ...next })
    })
  }

  return (
    <div
      role="group"
      aria-label="Modo do dia"
      className={cn("inline-flex rounded-lg bg-muted p-0.5", className)}
    >
      {OPTIONS.map(({ key, label, icon: Icon }) => {
        const active = key === "holiday" ? state.isHoliday : state.workMode === key
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => select(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-background text-foreground shadow-sm",
              active && key === "holiday" && "text-holiday",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
