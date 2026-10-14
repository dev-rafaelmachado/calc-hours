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
              Sincronização das suas marcações direto do portal do colaborador, apenas leitura.
              Disponível depois do mapeamento da API do portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Ainda não conectado.</CardContent>
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
