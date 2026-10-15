"use client"

import { Upload } from "lucide-react"
import { useState } from "react"

import { importCsv } from "@/app/actions"
import { useActionToast } from "@/components/punches/use-action-toast"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { IsoDate } from "@/lib/domain/dates"

import { SolidesImport } from "./solides-import"

export function ImportDialog({ referenceMonday }: { referenceMonday: IsoDate }) {
  const [open, setOpen] = useState(false)
  const { pending, run } = useActionToast()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Upload />
        Importar
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar batidas</DialogTitle>
          <DialogDescription>Traga batidas da Sólides (copiar e colar) ou de um arquivo CSV.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="solides">
          <TabsList>
            <TabsTrigger value="solides">Sólides</TabsTrigger>
            <TabsTrigger value="csv">CSV</TabsTrigger>
          </TabsList>
          <TabsContent value="csv" className="pt-3">
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                const formData = new FormData(event.currentTarget)
                run(() => importCsv(null, formData), () => setOpen(false))
              }}
            >
              <div className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
                Uma batida por linha: <code className="font-mono">date,time</code> (ex.{" "}
                <code className="font-mono">2026-10-14,08:02</code>).
                <br />
                Ou o formato antigo:{" "}
                <code className="font-mono">day|date,start,lunchStart,lunchEnd,end</code>.
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="csv-file">Arquivo</Label>
                <Input id="csv-file" name="file" type="file" accept=".csv,text/csv" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="csv-monday">Segunda de referência (só para CSV antigo sem data)</Label>
                <Input
                  id="csv-monday"
                  name="referenceMonday"
                  type="date"
                  defaultValue={referenceMonday}
                  className="w-44"
                />
              </div>
              <Button type="submit" disabled={pending} className="self-end">
                {pending ? "Importando…" : "Importar"}
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="solides" className="pt-3">
            <SolidesImport onDone={() => setOpen(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
