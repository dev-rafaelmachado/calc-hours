import { expect, test as setup } from "@playwright/test"

import { E2E_USER } from "./env"

export const STORAGE_STATE = "e2e/.auth/user.json"

setup("sign in through the login form", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("E-mail").fill(E2E_USER.email)
  await page.getByLabel("Senha").fill(E2E_USER.password)
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page).toHaveURL("/")
  await page.context().storageState({ path: STORAGE_STATE })
})
