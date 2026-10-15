"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import type { OccupancyPoint } from "@/lib/domain/analytics"
import { minutesToClock } from "@/lib/domain/time"

const byMode = {
  presencial: { label: "Presencial", color: "var(--presencial)" },
  home_office: { label: "Home office", color: "var(--home-office)" },
} satisfies ChartConfig

const overall = {
  all: { label: "Todos os dias", color: "var(--chart-1)" },
} satisfies ChartConfig

/**
 * Share of the days you were working at each time of day. Splits by work mode
 * when both modes have enough days; otherwise one series for every day.
 */
export function RhythmChart({ data, splitByMode }: { data: OccupancyPoint[]; splitByMode: boolean }) {
  const config: ChartConfig = splitByMode ? byMode : overall
  const keys = Object.keys(config) as (keyof OccupancyPoint)[]
  const first = data[0]?.minutes ?? 0
  const last = data.at(-1)?.minutes ?? 0
  const ticks: number[] = []
  for (let t = Math.ceil(first / 120) * 120; t <= last; t += 120) ticks.push(t)

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ left: -8, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="minutes"
          type="number"
          domain={[first, last]}
          ticks={ticks}
          tickFormatter={(v: number) => `${minutesToClock(v).slice(0, 2)}h`}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          domain={[0, 1]}
          ticks={[0, 0.25, 0.5, 0.75, 1]}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border)" }}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as OccupancyPoint | undefined
            if (!active || !point) return null
            return (
              <div className="grid min-w-40 gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                <div className="font-medium">Às {minutesToClock(point.minutes)}</div>
                {keys.map((key) => {
                  const value = point[key]
                  if (value === null) return null
                  return (
                    <div key={key} className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="size-2 rounded-[2px]" style={{ background: config[key].color }} />
                        {config[key].label}
                      </span>
                      <span className="font-mono tabular">{Math.round(value * 100)}% dos dias</span>
                    </div>
                  )
                })}
              </div>
            )
          }}
        />
        {splitByMode && <ChartLegend itemSorter={null} content={<ChartLegendContent />} />}
        {keys.map((key) => (
          <Area
            key={key}
            dataKey={key}
            type="monotone"
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            fill={`var(--color-${key})`}
            fillOpacity={0.1}
            connectNulls
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  )
}
