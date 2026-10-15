import { ArrowRight, Lightbulb, TrendingUp, TriangleAlert, type LucideIcon } from "lucide-react"
import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Insight, InsightTone } from "@/lib/insights"
import { cn } from "@/lib/utils"

const TONES: Record<InsightTone, { icon: LucideIcon; className: string; label: string }> = {
  positive: { icon: TrendingUp, className: "bg-working/12 text-working", label: "Positivo" },
  warning: { icon: TriangleAlert, className: "bg-pending/12 text-pending", label: "Atenção" },
  neutral: { icon: Lightbulb, className: "bg-primary/10 text-primary", label: "Observação" },
}

export function InsightsCard({ insights }: { insights: Insight[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>O que os dados dizem</CardTitle>
        <CardDescription>Leituras automáticas do período. A projeção olha sempre o mês atual.</CardDescription>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ainda não há dados suficientes para tirar conclusões neste período.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {insights.map((insight) => {
              const tone = TONES[insight.tone]
              const Icon = tone.icon
              return (
                <li key={insight.id} className="flex gap-3 rounded-lg border p-3">
                  <span
                    className={cn("grid size-8 shrink-0 place-items-center rounded-md", tone.className)}
                    title={tone.label}
                  >
                    <Icon className="size-4" aria-label={tone.label} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug font-medium">{insight.title}</p>
                    {insight.detail && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{insight.detail}</p>
                    )}
                    {insight.href && (
                      <Link
                        href={insight.href}
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Ver em Registros
                        <ArrowRight className="size-3" />
                      </Link>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
