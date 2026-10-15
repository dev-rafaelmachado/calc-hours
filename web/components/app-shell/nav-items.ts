import {
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  Clock,
  ListChecks,
  Settings,
} from "lucide-react"

/** `mobile: false` items stay out of the bottom bar; the user menu links them instead. */
export const NAV_ITEMS = [
  { href: "/", label: "Hoje", icon: Clock, mobile: true },
  { href: "/semana", label: "Semana", icon: CalendarRange, mobile: true },
  { href: "/mes", label: "Mês", icon: CalendarDays, mobile: true },
  { href: "/analise", label: "Análise", icon: ChartNoAxesCombined, mobile: true },
  { href: "/registros", label: "Registros", icon: ListChecks, mobile: true },
  { href: "/config", label: "Ajustes", icon: Settings, mobile: false },
] as const

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}
