/**
 * Adres bazy testowej — jedno źródło dla konfiguracji Vitesta i dla
 * przygotowania bazy. `test.env` obowiązuje wyłącznie w procesach roboczych,
 * więc `globalSetup` musi wziąć adres stąd, a nie ze zmiennej środowiskowej.
 *
 * Osobna baza, a nie osobny schemat: testy czyszczą tabele, a pomyłka
 * w konfiguracji nie może skasować danych roboczych.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://lexalpha:lexalpha@localhost:5432/lexalpha_test?schema=public&connection_limit=5";
