import Link from "next/link"

import type { PeriodPreset } from "@/lib/domain/analytics"
import { cn } from "@/lib/utils"

const LABELS: Record<PeriodPreset, string> = {
  "3m": "3 meses",
  "6m": "6 meses",
  "12m": "12 meses",
  ano: "Este ano",
  tudo: "Tudo",
}

/** Segmented links: the period scopes every number and chart on the page. */
export function PeriodFilter({ value, presets }: { value: PeriodPreset; presets: readonly PeriodPreset[] }) {
  return (
    <nav aria-label="Período" className="flex w-full overflow-x-auto rounded-lg bg-muted p-[3px] sm:inline-flex sm:w-auto">
      {presets.map((preset) => (
        <Link
          key={preset}
          href={`/analise?p=${preset}`}
          scroll={false}
          aria-current={preset === value ? "page" : undefined}
          className={cn(
            "flex-1 rounded-md px-2 py-1 text-center text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:px-2.5",
            preset === value && "bg-background text-foreground shadow-sm",
          )}
        >
          {LABELS[preset]}
        </Link>
      ))}
    </nav>
  )
}
