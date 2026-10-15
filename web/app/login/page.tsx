import { Timer } from "lucide-react"
import type { Metadata } from "next"

import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Entrar" }

export default function LoginPage() {
  return (
    <div className="grid min-h-svh place-items-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Timer className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Hours Commander</h1>
            <p className="text-sm text-muted-foreground">Sua jornada, batida a batida.</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
