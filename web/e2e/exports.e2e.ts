import { readFile } from "node:fs/promises"

import ExcelJS from "exceljs"

import { expect, test } from "./fixtures"

test.beforeEach(async ({ db }) => {
  await db.seedDay("2026-09-01", ["08:00", "12:00", "13:00", "17:00"], { mode: "presencial" })
  await db.seedDay("2026-09-02", ["09:00", "12:30", "13:30", "18:00"], { mode: "home_office" })
  await db.seedDay("2026-09-07", [], { holiday: true })
})

test("the Excel report lists the punches of the month", async ({ page }) => {
  await page.goto("/mes?m=2026-09")
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByText("Relatório Excel").click(),
  ])
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile((await download.path())!)
  const sheet = workbook.getWorksheet("Horas")!
  const cells = sheet.getSheetValues().flat().map(String)
  expect(cells).toContain("Marcações")
  expect(cells).toContain("08:00–12:00 · 13:00–17:00")
})

test("the JSON backup holds every punch and day", async ({ page }) => {
  await page.goto("/config")
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByText("Baixar backup").click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^hours_backup_\d{4}_\d{2}_\d{2}\.json$/)
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"))
  expect(backup).toMatchObject({ format: "hours-commander-backup", version: 1 })
  expect(backup.punches).toHaveLength(8)
  expect(backup.workDays).toHaveLength(3)
  expect(backup.punches[0]).not.toHaveProperty("user_id")
})
