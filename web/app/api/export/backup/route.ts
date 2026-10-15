import { getAllData } from "@/lib/data/repository"
import { buildBackup } from "@/lib/report/backup"

export async function GET() {
  const now = new Date()
  const backup = buildBackup(await getAllData(), now)
  const stamp = now.toISOString().slice(0, 10).replaceAll("-", "_")
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="hours_backup_${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  })
}
