import { Timer } from "lucide-react"
import Link from "next/link"
import { Suspense, type ReactNode } from "react"

import { BottomNav, SidebarNav } from "@/components/app-shell/nav"
import { ThemeToggle } from "@/components/app-shell/theme-toggle"
import { UserMenu } from "@/components/app-shell/user-menu"
import { Skeleton } from "@/components/ui/skeleton"

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Timer className="size-4" />
      </span>
      Hours Commander
    </Link>
  )
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-6 border-r bg-sidebar px-3 py-4 md:flex">
        <div className="px-2">
          <Brand />
        </div>
        <SidebarNav />
        <div className="mt-auto flex items-center gap-1">
          <Suspense fallback={<Skeleton className="h-9 flex-1" />}>
            <UserMenu />
          </Suspense>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
          <Brand />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
              <UserMenu compact />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pb-10">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  )
}
