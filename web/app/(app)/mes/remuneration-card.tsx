"use client"

import { Download, FileSpreadsheet } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { RemunerationBreakdown } from "@/lib/domain/remuneration"
import { formatCurrency, formatHours } from "@/lib/format"

/** Monthly pay preview; the bonus switch also drives the Excel report. */
export function RemunerationCard({
  month,
  withoutBonus,
  withBonus,
  configured,
}: {
  month: string
  withoutBonus: RemunerationBreakdown
  withBonus: RemunerationBreakdown
  configured: boolean
}) {
  const [bonus, setBonus] = useState(false)
  const b = bonus ? withBonus : withoutBonus
  const hoursDetail =
    b.horasExcedentes > 0
      ? `${formatHours(b.horasExcedentes)}h extras × ${formatCurrency(b.valorHora)}`
      : b.horasFaltantes > 0
        ? `${formatHours(b.horasFaltantes)}h faltantes × ${formatCurrency(b.valorHora)}`
        : "meta exata"

  const lines = [
    ["Remuneração base", "valor fixo", b.valorBase],
    ["Ajuste de horas", hoursDetail, b.ajusteHoras],
    ["Bonificação", bonus ? "meta batida" : "não aplicada", b.bonusTotal],
    [
      "Auxílio-transporte",
      `${b.presencialDays} dia(s) presencial × ${formatCurrency(b.valorAuxTransporte)}`,
      b.auxTransporteTotal,
    ],
  ] as const

  return (
    <Card>
      <CardHeader>
        <CardTitle>Remuneração estimada</CardTitle>
        <CardDescription>
          {configured ? (
            "Prévia do valor da nota fiscal do mês."
          ) : (
            <>
              Configure os valores em{" "}
              <Link href="/config" className="underline">
                Ajustes
              </Link>{" "}
              para ver a prévia.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="text-3xl font-semibold tracking-tight tabular">{formatCurrency(b.totalRemuneracao)}</div>
        <div className="flex items-center gap-2">
          <Switch id="bonus" checked={bonus} onCheckedChange={setBonus} />
          <Label htmlFor="bonus">Bateu a meta (aplica bônus)</Label>
        </div>
        <dl className="flex flex-col divide-y text-sm">
          {lines.map(([label, detail, value]) => (
            <div key={label} className="flex items-start justify-between gap-3 py-2">
              <div>
                <dt>{label}</dt>
                <dd className="text-xs text-muted-foreground">{detail}</dd>
              </div>
              <span className={`font-mono tabular ${value < 0 ? "text-destructive" : ""}`}>
                {formatCurrency(value)}
              </span>
            </div>
          ))}
        </dl>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          nativeButton={false}
          render={<a href={`/api/export/report?m=${month}&bonus=${bonus ? 1 : 0}`} />}
        >
          <FileSpreadsheet />
          Relatório Excel
        </Button>
        <Button variant="outline" nativeButton={false} render={<a href={`/api/export/month-csv?m=${month}`} />}>
          <Download />
          CSV do mês
        </Button>
        <Button variant="outline" nativeButton={false} render={<a href={`/api/export/metrics-csv?m=${month}`} />}>
          <Download />
          CSV de métricas
        </Button>
      </CardFooter>
    </Card>
  )
}
