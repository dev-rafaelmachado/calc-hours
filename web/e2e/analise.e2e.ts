import { expect, pastWeekdays, test } from "./fixtures"

test.beforeEach(async ({ db }) => {
  // Ten closed weekdays: five presencial 9h days, then five home office 7h days.
  const days = pastWeekdays(10)
  for (const [i, date] of days.entries()) {
    const presencial = i < 5
    await db.seedDay(
      date,
      presencial ? ["08:00", "12:00", "13:00", "18:00"] : ["09:30", "12:30", "13:30", "17:30"],
      { mode: presencial ? "presencial" : "home_office" },
    )
  }
})

test("the analysis shows totals, insights and charts for the period", async ({ page }) => {
  await page.goto("/analise?p=tudo")
  await expect(page.getByRole("heading", { name: "Análise" })).toBeVisible()
  await expect(page.getByText("80:00", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("5 presenciais · 5 home office")).toBeVisible()

  const insights = page.locator("li", { hasText: "Nos dias presenciais você começa 1h 30m mais cedo" })
  await expect(insights).toBeVisible()
  await expect(page.locator("[data-slot=chart] svg").first()).toBeVisible()
  await expect(page.getByRole("link", { name: /· 9h 00m$/ }).first()).toBeVisible()

  await page.getByRole("link", { name: "3 meses" }).click()
  await expect(page).toHaveURL(/\/analise\?p=3m$/)
  await expect(page.getByRole("link", { name: "3 meses" })).toHaveAttribute("aria-current", "page")
})

test("the analysis fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/analise")
  await expect(page.getByText("O que os dados dizem")).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
})
