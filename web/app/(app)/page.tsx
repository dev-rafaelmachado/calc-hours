import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { loadWorkspace } from "@/lib/data/repository"

import { TodayDashboard } from "./today-dashboard"

export const metadata: Metadata = { title: "Hoje" }

export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <TodayContent />
    </Suspense>
  )
}

async function TodayContent() {
  const ws = await loadWorkspace()
  return (
    <TodayDashboard
      today={ws.today}
      serverNow={ws.now.toISOString()}
      timeZone={ws.settings.timezone}
      dayTargetMinutes={ws.settings.dayTargetMinutes}
      todayPunches={ws.punches.filter((p) => p.workDate === ws.today)}
      todayMeta={ws.meta.find((m) => m.workDate === ws.today) ?? null}
      history={ws.days.filter((d) => d.date !== ws.today)}
    />
  )
}

function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
