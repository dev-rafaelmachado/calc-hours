import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  children,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: "default" | "positive" | "warning"
  children?: ReactNode
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          {label}
          {Icon && <Icon className="size-4" />}
        </div>
        <div
          className={cn(
            "text-2xl font-semibold tracking-tight tabular",
            tone === "positive" && "text-working",
            tone === "warning" && "text-pending",
          )}
        >
          {value}
        </div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        {children}
      </CardContent>
    </Card>
  )
}
