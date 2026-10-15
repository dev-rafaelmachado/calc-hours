"use client"

import { Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { addPunch, deletePunch, updatePunch } from "@/app/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { IsoDate } from "@/lib/domain/dates"
import { localDate, localMinutes, type Punch, type PunchSource } from "@/lib/domain/punches"
import { minutesToClock, minutesToHuman } from "@/lib/domain/time"

import { useActionToast } from "./use-action-toast"

const SOURCE_LABELS: Partial<Record<PunchSource, string>> = {
  solides: "Sólides",
  legacy: "Importado",
  csv: "CSV",
  ocr: "Print",
}

function TimeForm({
  date,
  defaultTime,
  submitLabel,
  onSubmit,
  pending,
}: {
  date: IsoDate
  defaultTime: string
  submitLabel: string
  onSubmit: (formData: FormData) => void
  pending: boolean
}) {
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(new FormData(event.currentTarget))
      }}
    >
      <input type="hidden" name="date" value={date} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`time-${date}-${submitLabel}`}>Horário</Label>
        <Input
          id={`time-${date}-${submitLabel}`}
          name="time"
          type="time"
          step={60}
          defaultValue={defaultTime}
          required
          autoFocus
          className="w-32 tabular"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  )
}

export function AddPunchButton({
  date,
  defaultTime,
  label = "Adicionar batida",
  variant = "outline",
}: {
  date: IsoDate
  defaultTime: string
  label?: string
  variant?: "outline" | "ghost" | "secondary"
}) {
  const [open, setOpen] = useState(false)
  const { pending, run } = useActionToast()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant={variant} size="sm" />}>
        <Plus />
        {label}
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <TimeForm
          date={date}
          defaultTime={defaultTime}
          submitLabel="Adicionar"
          pending={pending}
          onSubmit={(fd) => run(() => addPunch(null, fd), () => setOpen(false))}
        />
      </PopoverContent>
    </Popover>
  )
}

function EditPunchButton({ punch, timeZone }: { punch: Punch; timeZone: string }) {
  const [open, setOpen] = useState(false)
  const { pending, run } = useActionToast()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Editar batida" />}>
        <Pencil />
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <TimeForm
          // The instant keeps its own calendar date, which differs from the
          // workday only for shifts past midnight.
          date={localDate(punch.punchedAt, timeZone)}
          defaultTime={minutesToClock(localMinutes(punch.punchedAt, timeZone))}
          submitLabel="Salvar"
          pending={pending}
          onSubmit={(fd) => {
            fd.set("id", String(punch.id))
            run(() => updatePunch(null, fd), () => setOpen(false))
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function DeletePunchButton({ punch, time }: { punch: Punch; time: string }) {
  const [open, setOpen] = useState(false)
  const { pending, run } = useActionToast()
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Remover batida"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover a batida das {time}?</DialogTitle>
            <DialogDescription>
              As batidas seguintes trocam de par (entrada vira saída e vice-versa).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => deletePunch(punch.id), () => setOpen(false))}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Ordered punches of one day with the worked and break durations between them. */
export function DayPunches({
  date,
  punches,
  timeZone,
  isToday,
  now,
}: {
  date: IsoDate
  punches: Punch[]
  timeZone: string
  isToday: boolean
  now: Date
}) {
  const sorted = [...punches].sort((a, b) => Date.parse(a.punchedAt) - Date.parse(b.punchedAt))

  if (sorted.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma batida neste dia.</p>
  }

  return (
    <ol className="flex flex-col">
      {sorted.map((punch, i) => {
        const minutes = localMinutes(punch.punchedAt, timeZone)
        const time = minutesToClock(minutes)
        const isIn = i % 2 === 0
        const next = sorted[i + 1]
        const gapMinutes = next
          ? Math.floor((Date.parse(next.punchedAt) - Date.parse(punch.punchedAt)) / 60_000)
          : isIn && isToday
            ? Math.floor((now.getTime() - Date.parse(punch.punchedAt)) / 60_000)
            : null
        const nextDay = localDate(punch.punchedAt, timeZone) !== date
        return (
          <li key={punch.id}>
            <div className="flex items-center gap-3 py-1.5">
              <span
                className={`size-2.5 shrink-0 rounded-full ${isIn ? "bg-working" : "bg-muted-foreground/40"}`}
              />
              <span className="w-14 font-mono text-base font-medium tabular">{time}</span>
              <span className="text-sm text-muted-foreground">{isIn ? "Entrada" : "Saída"}</span>
              {nextDay && <Badge variant="outline">+1 dia</Badge>}
              {SOURCE_LABELS[punch.source] && (
                <Badge variant="secondary">{SOURCE_LABELS[punch.source]}</Badge>
              )}
              <span className="ml-auto flex items-center">
                <EditPunchButton punch={punch} timeZone={timeZone} />
                <DeletePunchButton punch={punch} time={time} />
              </span>
            </div>
            {gapMinutes !== null && (
              <div className="ml-[4.5px] border-l border-dashed py-1 pl-6 text-xs text-muted-foreground">
                {isIn ? (
                  <span className="text-working">
                    {next ? "Trabalhou" : "Trabalhando há"} {minutesToHuman(gapMinutes)}
                  </span>
                ) : (
                  <span>Pausa de {minutesToHuman(gapMinutes)}</span>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
