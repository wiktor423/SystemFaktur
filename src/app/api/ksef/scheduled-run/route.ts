import { runScheduledFetch } from "@/server/scheduler";
import { fail, handle, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Wyzwolenie przebiegu harmonogramu.
 *
 * Endpoint woła wewnętrzny cron aplikacji, ale nadaje się też do podpięcia
 * pod cron platformy wdrożeniowej — wtedy wystarczy wyłączyć wbudowany
 * wyzwalacz przez `KSEF_SCHEDULER=off`.
 *
 * Chroni go sekret z `SCHEDULER_TOKEN`. Brak sekretu blokuje endpoint zamiast
 * go otwierać: publiczne wejście uruchamiające pobieranie z KSeF to nie jest
 * coś, co powinno działać przez przeoczenie w konfiguracji.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const expected = process.env.SCHEDULER_TOKEN;
    if (!expected) {
      return fail("Harmonogram nie jest skonfigurowany (brak SCHEDULER_TOKEN).", 503);
    }
    if (request.headers.get("x-scheduler-token") !== expected) {
      return fail("Brak uprawnień do uruchomienia przebiegu.", 401);
    }

    const outcome = await runScheduledFetch();
    const message = {
      skipped: "Bieżąca minuta nie jest w harmonogramie.",
      taken: "Przebieg tej minuty obsłużyła inna instancja.",
      done: "Przebieg zakończony.",
    }[outcome];

    return ok({ outcome, message });
  });
}
