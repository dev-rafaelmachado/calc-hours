// End-to-end tests against `next dev` wired to the local Supabase
// (`pnpm e2e:db` once, then `pnpm e2e`). Never against production: see e2e/env.ts.

import { defineConfig, devices } from "@playwright/test"

import { E2E_PORT, localSupabase } from "./e2e/env"

const supabase = localSupabase()
// localhost, not 127.0.0.1: next dev blocks its dev assets for other origins.
const baseURL = `http://localhost:${E2E_PORT}`

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.(e2e|setup)\.ts/,
  // One test user shared by every test, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${E2E_PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    // Process env wins over .env.local, so the app talks to the local Supabase.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: supabase.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
    },
  },
})
