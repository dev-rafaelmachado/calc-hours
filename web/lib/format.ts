import { weekdayIndex, WEEKDAY_LABELS, WEEKDAY_SHORT, type IsoDate } from "@/lib/domain/dates"

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
]

const parts = (date: IsoDate) => date.split("-").map(Number) as [number, number, number]

/** "Quarta, 14 de outubro" */
export function formatDayLong(date: IsoDate): string {
  const [, m, d] = parts(date)
  return `${WEEKDAY_LABELS[weekdayIndex(date)]}, ${d} de ${MONTHS[m - 1]}`
}

/** "14/10" */
export function formatDayShort(date: IsoDate): string {
  const [, m, d] = parts(date)
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`
}

/** "Qua 14/10" */
export function formatWeekdayShort(date: IsoDate): string {
  return `${WEEKDAY_SHORT[weekdayIndex(date)]} ${formatDayShort(date)}`
}

/** "14/10/2026" */
export function formatDateBr(date: IsoDate): string {
  const [y] = parts(date)
  return `${formatDayShort(date)}/${y}`
}

/** "outubro" */
export function formatMonthName(date: IsoDate): string {
  return MONTHS[parts(date)[1] - 1]
}

/** "Out", or "Out/26" when `withYear` */
export function formatMonthShort(date: IsoDate, withYear = false): string {
  const [y, m] = parts(date)
  const name = `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1, 3)}`
  return withYear ? `${name}/${String(y).slice(2)}` : name
}

/** "Outubro de 2026" */
export function formatMonth(date: IsoDate): string {
  const [y, m] = parts(date)
  const name = MONTHS[m - 1]
  return `${name[0].toUpperCase()}${name.slice(1)} de ${y}`
}

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

export function formatCurrency(value: number): string {
  return currency.format(value)
}

export function formatHours(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
