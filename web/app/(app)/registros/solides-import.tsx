"use client"

import { ClipboardPaste, TriangleAlert } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  applySolidesImport,
  previewSolidesImport,
  type SolidesPreviewDay,
} from "@/app/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { WORK_MODE_LABELS } from "@/lib/domain/days"
import type { DayAction } from "@/lib/import/solides"
import { minutesToHuman } from "@/lib/domain/time"
import { formatWeekdayShort } from "@/lib/format"
import { cn } from "@/lib/utils"

const ACTION_LABELS: Record<DayAction, { label: string; className: string }> = {
  new: { label: "Novo", className: "bg-working/15 text-working" },
  replace: { label: "Substitui", className: "bg-break/20 text-foreground" },
  merge: { label: "Mescla (hoje)", className: "bg-primary/15 text-primary" },
  same: { label: "Igual", className: "bg-muted text-muted-foreground" },
  skip: { label: "Sem batidas", className: "bg-muted text-muted-foreground" },
}

/** Paste of "Apropriação de horas" → preview → import. */
export function SolidesImport({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("")
  const [days, setDays] = useState<SolidesPreviewDay[] | null>(null)
  const [pending, startTransition] = useTransition()

  const preview = () =>
    startTransition(async () => {
      const result = await previewSolidesImport(text)
      if (result.ok) setDays(result.days)
      else toast.error(result.error)
    })

  const apply = () =>
    startTransition(async () => {
      const result = await applySolidesImport(text)
      if (result.ok) {
        toast.success(result.message)
        onDone()
      } else toast.error(result.error)
    })

  if (days) {
    const relevant = days.filter((d) => d.action !== "skip" || d.isHoliday || d.current)
    const changes = days.filter((d) => ["new", "replace", "merge"].includes(d.action)).length
    const holidays = days.filter((d) => d.isHoliday).length
    const warnings = days.flatMap((d) => d.warnings)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {days.length} dia(s) lidos · <strong className="text-foreground">{changes}</strong> com mudança
          {holidays > 0 && ` · ${holidays} feriado(s)`}
        </p>
        {warnings.length > 0 && (
          <div className="flex gap-2 rounded-lg bg-pending/10 p-3 text-xs text-pending">
            <TriangleAlert className="size-4 shrink-0" />
            <ul className="flex flex-col gap-1">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
          {relevant.map((d) => (
            <li key={d.date} className="flex items-start gap-3 px-3 py-2 text-sm">
              <span className="w-20 shrink-0 font-medium">{formatWeekdayShort(d.date)}</span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs tabular">
                  {d.isHoliday && !d.imported ? "Feriado" : d.imported || "—"}
                </div>
                {d.current && d.action !== "same" && d.action !== "new" && (
                  <div className="font-mono text-xs text-muted-foreground line-through tabular">
                    {d.current}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {d.isHoliday && <Badge className="bg-holiday/15 text-holiday">Feriado</Badge>}
                  {d.workMode && <Badge variant="outline">{WORK_MODE_LABELS[d.workMode]}</Badge>}
                  {d.editedCount > 0 && <Badge variant="outline">editado na Sólides</Badge>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge className={cn(ACTION_LABELS[d.action].className)}>{ACTION_LABELS[d.action].label}</Badge>
                {d.importedMinutes > 0 && (
                  <span className="font-mono text-xs tabular">{minutesToHuman(d.importedMinutes)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Dias fechados ficam iguais à Sólides; o modo do dia só é preenchido quando estava vazio.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDays(null)} disabled={pending}>
            Voltar
          </Button>
          <Button onClick={apply} disabled={pending || changes + holidays === 0}>
            {pending ? "Importando…" : changes > 0 ? `Importar ${changes} dia(s)` : "Nada para importar"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="list-decimal space-y-1 rounded-lg bg-muted/60 p-3 pl-7 text-xs leading-relaxed text-muted-foreground">
        <li>Na Sólides, abra <strong>Apropriação de horas</strong>, escolha o período e clique em Consultar.</li>
        <li>Selecione a tabela de resultados (ou Ctrl+A na página) e copie com Ctrl+C.</li>
        <li>Cole aqui. Nada é gravado antes de você confirmar a prévia.</li>
      </ol>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="01/09/2026 - Terça&#10;TRABALHANDO&#10;09:01&#10;13:13&#10;…"
        className="h-40 font-mono text-xs"
      />
      <Button onClick={preview} disabled={pending || !text.trim()} className="self-end">
        <ClipboardPaste />
        {pending ? "Lendo…" : "Pré-visualizar"}
      </Button>
    </div>
  )
}
