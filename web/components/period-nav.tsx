import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"

/** Previous / current / next links for a week or month view. */
export function PeriodNav({
  label,
  prevHref,
  nextHref,
  currentHref,
  isCurrent,
}: {
  label: string
  prevHref: string
  nextHref: string
  currentHref: string
  isCurrent: boolean
}) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" nativeButton={false} render={<Link href={prevHref} aria-label="Anterior" />}>
        <ChevronLeft />
      </Button>
      <span className="min-w-36 text-center text-sm font-medium tabular">{label}</span>
      <Button variant="outline" size="icon" nativeButton={false} render={<Link href={nextHref} aria-label="Próximo" />}>
        <ChevronRight />
      </Button>
      {!isCurrent && (
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={currentHref} />}>
          Hoje
        </Button>
      )}
    </div>
  )
}
