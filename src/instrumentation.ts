/**
 * Punkt startowy procesu serwera (Next.js `register`).
 *
 * Wyzwalacz harmonogramu musi ruszyć razem z aplikacją, a nie przy pierwszym
 * żądaniu HTTP — instancja bez ruchu nigdy nie pobrałaby faktur. Sprawdzenie
 * runtime'u jest konieczne, bo ten plik wykonuje się także dla środowiska
 * Edge, gdzie nie ma `node-cron`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startCron } = await import("@/server/cron");
  startCron();
}
