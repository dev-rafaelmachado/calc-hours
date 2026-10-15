import { describe, expect, it } from "vitest"

import { buildBackup } from "./backup"

describe("buildBackup", () => {
  it("keeps every column except the owner and tags the format", () => {
    const owner = "00000000-0000-0000-0000-000000000001"
    const backup = buildBackup(
      {
        settings: { user_id: owner, day_target_minutes: 480, pix_key: null },
        workDays: [{ user_id: owner, work_date: "2026-10-12", is_holiday: true, work_mode: null }],
        punches: [
          { id: 1, user_id: owner, punched_at: "2026-10-13T12:00:00+00:00", source: "solides", external_id: "9:start" },
        ],
      },
      new Date("2026-10-15T18:00:00Z"),
    )
    expect(backup).toEqual({
      format: "hours-commander-backup",
      version: 1,
      exportedAt: "2026-10-15T18:00:00.000Z",
      settings: { day_target_minutes: 480, pix_key: null },
      workDays: [{ work_date: "2026-10-12", is_holiday: true, work_mode: null }],
      punches: [{ id: 1, punched_at: "2026-10-13T12:00:00+00:00", source: "solides", external_id: "9:start" }],
    })
  })

  it("exports an account without settings", () => {
    expect(buildBackup({ settings: null, workDays: [], punches: [] }, new Date(0)).settings).toBeNull()
  })
})
