import { defineConfig, devices } from "@playwright/test";

/**
 * Testy e2e sprawdzają kryterium akceptacji z zadania w jego własnych słowach:
 * „pełną ścieżkę można wykonać — pobranie faktury, akceptacja, rejestr,
 * podgląd dokumentu".
 *
 * Chodzą na osobnej bazie `lexalpha_e2e`, żeby nie kolidować ani z danymi
 * roboczymi, ani z testami integracyjnymi. Integracja z KSeF pracuje na
 * adapterze mock — test ma sprawdzać naszą aplikację, a nie dostępność
 * środowiska Ministerstwa, które ma codzienne okno serwisowe.
 */
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://lexalpha:lexalpha@localhost:5432/lexalpha_e2e?schema=public&connection_limit=5";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // Przygotowanie bazy jest częścią komendy: serwer nie może wstać,
    // zanim schemat i dane będą gotowe.
    command: "npx tsx scripts/prepare-e2e-db.mts && npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL,
      KSEF_CLIENT: "mock",
      // Harmonogram wyłączony: przebieg budzący się w trakcie testu dorzuciłby
      // dokumenty do bufora i zepsuł asercje na liczbach.
      KSEF_SCHEDULER: "off",
      // Własny katalog budowania — patrz komentarz w `next.config.ts`.
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
