// Full export of the user's data as JSON. Rows keep the database column names
// (snake_case) so a restore can insert them back as they are; only user_id is
// dropped, since a restore belongs to whoever is signed in.

export const BACKUP_FORMAT = "hours-commander-backup"
export const BACKUP_VERSION = 1

type Row = Record<string, unknown>

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  settings: Row | null
  workDays: Row[]
  punches: Row[]
}

function withoutOwner(row: Row): Row {
  const copy = { ...row }
  delete copy.user_id
  return copy
}

export function buildBackup(
  { settings, workDays, punches }: { settings: Row | null; workDays: Row[]; punches: Row[] },
  exportedAt: Date,
): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    settings: settings && withoutOwner(settings),
    workDays: workDays.map(withoutOwner),
    punches: punches.map(withoutOwner),
  }
}
