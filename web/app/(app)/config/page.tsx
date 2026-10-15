import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getSettings } from "@/lib/data/repository"

import { SettingsForm } from "./settings-form"

export const metadata: Metadata = { title: "Ajustes" }

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Ajustes" description="Meta diária, valores do mês e integrações." />
      <div className="flex max-w-3xl flex-col gap-6">
        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <SettingsContent />
        </Suspense>
        <Card>
          <CardHeader>
            <CardTitle>Sólides</CardTitle>
            <CardDescription>
              O login da Sólides exige reCAPTCHA, então a importação parte do seu navegador: copie a
              tabela da Apropriação de horas e cole em Registros → Importar → Sólides.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Dias já fechados ficam iguais à Sólides; feriados e o modo do dia (Sede ou Home Office)
            vêm junto.
          </CardContent>
        </Card>
      </div>
    </>
  )
}

async function SettingsContent() {
  const settings = await getSettings()
  return (
    <SettingsForm
      values={{
        dayTargetHours: settings.dayTargetMinutes / 60,
        valorBase: settings.valorBase,
        valorHora: settings.valorHora,
        valorBonus: settings.valorBonus,
        valorAuxTransporte: settings.valorAuxTransporte,
        pixKey: settings.pixKey,
      }}
    />
  )
}
