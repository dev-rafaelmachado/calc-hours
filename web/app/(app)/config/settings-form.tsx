"use client"

import { useActionState, useEffect } from "react"
import { toast } from "sonner"

import { saveSettings } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface SettingsFormValues {
  dayTargetHours: number
  valorBase: number
  valorHora: number
  valorBonus: number
  valorAuxTransporte: number
  pixKey: string
}

function Field({
  id,
  label,
  hint,
  ...input
}: { id: string; label: string; hint?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} {...input} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function SettingsForm({ values }: { values: SettingsFormValues }) {
  const [state, action, pending] = useActionState(saveSettings, null)

  useEffect(() => {
    if (!state) return
    if (state.ok) toast.success(state.message)
    else toast.error(state.error)
  }, [state])

  return (
    <form action={action} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Jornada</CardTitle>
          <CardDescription>A meta da semana e do mês é esta meta vezes os dias úteis sem feriado.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            id="dayTargetHours"
            label="Horas por dia útil"
            type="number"
            step="0.25"
            min="0"
            max="24"
            defaultValue={values.dayTargetHours}
            required
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Remuneração</CardTitle>
          <CardDescription>Usada na prévia do mês e no relatório Excel da nota fiscal.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="valorBase" label="Valor base mensal (R$)" type="number" step="0.01" min="0" defaultValue={values.valorBase} />
          <Field
            id="valorHora"
            label="Valor por hora (R$)"
            hint="Soma por hora extra e desconta por hora faltante no mês."
            type="number"
            step="0.01"
            min="0"
            defaultValue={values.valorHora}
          />
          <Field id="valorBonus" label="Bônus por meta (R$)" type="number" step="0.01" min="0" defaultValue={values.valorBonus} />
          <Field
            id="valorAuxTransporte"
            label="Auxílio-transporte por dia presencial (R$)"
            type="number"
            step="0.01"
            min="0"
            defaultValue={values.valorAuxTransporte}
          />
          <div className="sm:col-span-2">
            <Field
              id="pixKey"
              label="Chave PIX"
              hint="Vai no relatório mensal, junto do valor da nota."
              defaultValue={values.pixKey}
              autoComplete="off"
            />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : "Salvar ajustes"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
