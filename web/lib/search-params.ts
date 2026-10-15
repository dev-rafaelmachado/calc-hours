import type { IsoDate } from "@/lib/domain/dates"

type Param = string | string[] | undefined

/** A valid "YYYY-MM-DD" from the query string, or the fallback. */
export function dateParam(value: Param, fallback: IsoDate): IsoDate {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback
}

/** "YYYY-MM" from the query string as the first day of that month, or the fallback. */
export function monthParam(value: Param, fallback: IsoDate): IsoDate {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : fallback
}
