import { defineConfig } from "vitest/config";

import { TEST_DATABASE_URL } from "./tests/integration/database-url.mjs";

/**
 * Dwa rodzaje testów, celowo rozdzielone.
 *
 * `unit` to czyste funkcje domenowe — walidacja, parser FA. Chodzą
 * w milisekundach i nie potrzebują niczego poza kodem.
 *
 * `integration` dotyka prawdziwego PostgreSQL-a, bo sprawdza rzeczy, których
 * nie da się udowodnić bez bazy: deduplikację opartą na unikalnym indeksie
 * i idempotencję harmonogramu przy równoległych przebiegach. Mock bazy
 * udowodniłby tu wyłącznie to, że mock działa.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    env: {
      // Klient Prismy powstaje leniwie, więc podmiana adresu przed pierwszym
      // zapytaniem wystarczy, żeby testy trafiły do własnej bazy.
      DATABASE_URL: TEST_DATABASE_URL,
      KSEF_CLIENT: "mock",
      KSEF_SCHEDULER: "off",
    },
    // Testy integracyjne dzielą jedną bazę, więc pliki nie mogą iść równolegle.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: { tsconfigPaths: true },
});
