import { expect, test } from "./fixtures"

// Synthetic "Apropriação de horas" text in the layout Chrome copies.
const SOLIDES_PASTE = `
01/09/2026 - Terça
TRABALHANDO

09:00

12:00
03:00

Escolha
 Sede Empresa     Sede Empresa
TRABALHANDO

13:00

18:00
05:00

Escolha
 Sede Empresa     Sede Empresa
Trabalhadas:
08:00    Total de Intervalos:
01:00

07/09/2026 - Segunda (FERIADO)
Trabalhadas:
00:00
`

test("importing a CSV of punches", async ({ page, db }) => {
  await page.goto("/registros")
  await page.getByRole("button", { name: "Importar" }).click()
  await page.getByRole("tab", { name: "CSV" }).click()
  await page.getByLabel("Arquivo").setInputFiles({
    name: "batidas.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("date,time\n2026-09-02,08:00\n2026-09-02,12:00\n2026-09-02,13:00\n2026-09-02,17:00\n"),
  })
  await page.getByRole("dialog").getByRole("button", { name: "Importar", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  expect(await db.countPunches()).toBe(4)

  await page.goto("/registros?m=2026-09&d=2026-09-02")
  await expect(page.getByRole("dialog").getByText("8h 00m trabalhadas · 1h 00m de pausa")).toBeVisible()
})

test("importing a Sólides paste after the preview", async ({ page, db }) => {
  await page.goto("/registros")
  await page.getByRole("button", { name: "Importar" }).click()
  await page.getByRole("dialog").getByRole("textbox").fill(SOLIDES_PASTE)
  await page.getByRole("button", { name: "Pré-visualizar" }).click()

  await page.getByRole("button", { name: "Importar 1 dia(s)" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  expect(await db.countPunches()).toBe(4)

  const { data } = await db.client
    .from("work_days")
    .select("work_date, is_holiday, work_mode")
    .eq("user_id", db.userId)
    .order("work_date")
  expect(data).toEqual([
    { work_date: "2026-09-01", is_holiday: false, work_mode: "presencial" },
    { work_date: "2026-09-07", is_holiday: true, work_mode: null },
  ])
})
