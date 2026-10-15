"use client"

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { minutesToHuman } from "@/lib/domain/time"

const config = {
  worked: { label: "Realizado", color: "var(--chart-1)" },
  planned: { label: "Planejado", color: "var(--chart-2)" },
} satisfies ChartConfig

export interface WeekChartPoint {
  label: string
  worked: number
  planned: number
}

/** Values in minutes; the axis shows hours. */
export function WeekChart({ data, dayTargetMinutes }: { data: WeekChartPoint[]; dayTargetMinutes: number }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${Math.round(v / 60)}h`}
          ticks={[0, 120, 240, 360, 480, 600]}
        />
        <ReferenceLine y={dayTargetMinutes} stroke="var(--foreground)" strokeOpacity={0.35} strokeDasharray="4 4" />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <div className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">
                    {config[name as keyof typeof config]?.label ?? name}
                  </span>
                  <span className="font-mono tabular">{minutesToHuman(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="worked" stackId="day" fill="var(--color-worked)" radius={[0, 0, 4, 4]} />
        <Bar dataKey="planned" stackId="day" fill="var(--color-planned)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
