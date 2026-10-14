import { CalendarDays, CalendarRange, Clock, ListChecks, Settings } from "lucide-react"

export const NAV_ITEMS = [
  { href: "/", label: "Hoje", icon: Clock },
  { href: "/semana", label: "Semana", icon: CalendarRange },
  { href: "/mes", label: "Mês", icon: CalendarDays },
  { href: "/registros", label: "Registros", icon: ListChecks },
  { href: "/config", label: "Ajustes", icon: Settings },
] as const

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}
