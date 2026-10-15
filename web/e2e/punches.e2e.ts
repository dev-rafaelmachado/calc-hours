import { weekStart } from "../lib/domain/dates"

import { expect, pastWeekdays, test, today } from "./fixtures"

test("punching in and out from Hoje", async ({ page, db }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Registrar entrada" }).click()
  await expect(page.getByText(/^Trabalhando desde \d{2}:\d{2}$/)).toBeVisible()

  await page.getByRole("button", { name: "Registrar saída" }).click()
  await expect(page.getByText(/^Fora desde \d{2}:\d{2}$/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Registrar entrada" })).toBeVisible()
  expect(await db.countPunches()).toBe(2)
})

test("adding, editing and removing punches of a past day", async ({ page }) => {
  const [date] = pastWeekdays(1)
  await page.goto(`/registros?m=${date.slice(0, 7)}&d=${date}`)
  const sheet = page.getByRole("dialog")
  await expect(sheet.getByText("Sem batidas")).toBeVisible()

  for (const time of ["08:00", "12:00", "13:00", "17:30"]) {
    await sheet.getByRole("button", { name: "Adicionar batida" }).click()
    await page.getByLabel("Horário").fill(time)
    await page.getByRole("button", { name: "Adicionar", exact: true }).click()
    await expect(page.getByText(`Batida das ${time} adicionada`)).toBeVisible()
  }
  await expect(sheet.getByText("8h 30m trabalhadas · 1h 00m de pausa")).toBeVisible()

  await sheet.getByRole("button", { name: "Editar batida" }).last().click()
  await page.getByLabel("Horário").fill("18:00")
  await page.getByRole("button", { name: "Salvar" }).click()
  await expect(sheet.getByText("9h 00m trabalhadas · 1h 00m de pausa")).toBeVisible()

  await sheet.getByRole("button", { name: "Remover batida" }).last().click()
  await page.getByRole("button", { name: "Remover", exact: true }).click()
  await expect(sheet.getByText("4h 00m trabalhadas · 1h 00m de pausa · falta uma batida")).toBeVisible()
})

test("a holiday takes 8h off the week target", async ({ page }) => {
  // Any weekday of the current week works; Monday is always inside it.
  const monday = weekStart(today())
  await page.goto("/semana")
  await expect(page.getByText("de 40h 00m na semana")).toBeVisible()

  await page.goto(`/registros?m=${monday.slice(0, 7)}&d=${monday}`)
  const holiday = page.getByRole("dialog").getByRole("button", { name: "Feriado" })
  await holiday.click()
  await expect(holiday).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("Dia atualizado")).toBeVisible()

  await page.goto("/semana")
  await expect(page.getByText("de 32h 00m na semana")).toBeVisible()
})
