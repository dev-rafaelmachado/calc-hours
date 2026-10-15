import { expect, test } from "@playwright/test"

import { E2E_USER } from "./env"

test.use({ storageState: { cookies: [], origins: [] } })

test("pages and exports require a session", async ({ page, request }) => {
  for (const path of ["/", "/analise", "/registros"]) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login$/)
  }
  const response = await request.get("/api/export/backup", { maxRedirects: 0 })
  expect(response.status()).toBe(307)
  expect(response.headers().location).toMatch(/\/login$/)
})

test("a wrong password shows an error", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("E-mail").fill(E2E_USER.email)
  await page.getByLabel("Senha").fill("wrong-password")
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})
