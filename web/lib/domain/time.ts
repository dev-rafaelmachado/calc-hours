// Duration and clock formatting, ported from hours_app/time_utils.py.

const pad = (value: number) => String(value).padStart(2, "0")

/** "8:05" or "08:05" -> minutes since midnight. Throws on anything else. */
export function parseHHMM(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) throw new Error(`Invalid time: "${value}"`)
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) throw new Error(`Invalid time: "${value}"`)
  return hours * 60 + minutes
}

/** 485 -> "8h 05m" */
export function minutesToHuman(value: number): string {
  const sign = value < 0 ? "-" : ""
  const abs = Math.abs(value)
  return `${sign}${Math.floor(abs / 60)}h ${pad(abs % 60)}m`
}

/** Clock time: 1505 -> "01:05" (wraps at 24h). */
export function minutesToClock(value: number): string {
  const wrapped = ((value % 1440) + 1440) % 1440
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`
}

/** Duration: 2525 -> "42:05", -30 -> "-00:30". */
export function minutesToDuration(value: number): string {
  const sign = value < 0 ? "-" : ""
  const abs = Math.abs(value)
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** Python's round(): half to even. Kept so ported averages match exactly. */
export function roundHalfEven(value: number): number {
  const floor = Math.floor(value)
  const diff = value - floor
  if (Math.abs(diff - 0.5) > 1e-9) return Math.round(value)
  return floor % 2 === 0 ? floor : floor + 1
}
