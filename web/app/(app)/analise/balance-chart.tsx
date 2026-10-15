"use client"

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { minutesToDuration, minutesToHuman } from "@/lib/domain/time"

const config = {
  balance: { label: "Saldo" },
} satisfies ChartConfig

export interface BalancePoint {
  label: string
  title: string
  balance: number
  worked: number
  target: number
  partial: boolean
}

const signed = (minutes: number) => `${minutes >= 0 ? "+" : "-"}${minutesToHuman(Math.abs(minutes))}`

/** Monthly balance (hours minus target) around a zero baseline. Values in minutes. */
export function BalanceChart({ data }: { data: BalancePoint[] }) {
  // The axis spans only the signs present, always including zero.
  const low = Math.min(0, ...data.map((d) => d.balance))
  const high = Math.max(60, ...data.map((d) => d.balance))
  const span = (high - low) / 60
  const stepHours = span > 40 ? 10 : span > 16 ? 5 : 2
  const from = Math.floor(low / 60 / stepHours) * stepHours
  const to = Math.ceil(high / 60 / stepHours) * stepHours
  const ticks: number[] = []
  for (let h = from; h <= to; h += stepHours) ticks.push(h * 60)

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          tickLine={false}
          axisLine={false}
          domain={[from * 60, to * 60]}
          ticks={ticks}
          tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${Math.round(v / 60)}h`}
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as BalancePoint | undefined
            if (!active || !point) return null
            return (
              <div className="grid min-w-44 gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                <div className="font-medium">
                  {point.title}
                  {point.partial && <span className="font-normal text-muted-foreground"> · até ontem</span>}
                </div>
                <Row label="Saldo" value={signed(point.balance)} />
                <Row label="Horas" value={minutesToDuration(point.worked)} />
                <Row label="Meta" value={minutesToDuration(point.target)} />
              </div>
            )
          }}
        />
        <Bar dataKey="balance" maxBarSize={24} radius={[4, 4, 0, 0]}>
          {data.map((point) => (
            <Cell
              key={point.label}
              fill={point.balance >= 0 ? "var(--working)" : "var(--pending)"}
              fillOpacity={point.partial ? 0.5 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular">{value}</span>
    </div>
  )
}
