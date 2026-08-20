/**
 * Wyzwalacz czasowy harmonogramu.
 *
 * Ten moduł celowo nie zna bazy danych ani Prismy — woła wyłącznie endpoint
 * aplikacji. Powód jest dwojaki. Praktyczny: `instrumentation.ts` jest
 * kompilowane razem z aplikacją, a wciągnięcie tam sterownika `pg` wywraca
 * budowanie na modułach natywnych Node. Projektowy: przebieg automatyczny
 * przechodzi tą samą ścieżką HTTP co ręczny, więc nie ma dwóch implementacji
 * tego samego importu, które mogłyby się rozjechać.
 *
 * Tik chodzi co minutę i pyta serwer, czy ta minuta jest w harmonogramie.
 * Alternatywa — rejestrowanie zadania per godzina — wymagałaby przeładowywania
 * crona przy każdej zmianie ustawień, co jest źródłem wyścigów.
 */
import cron, { type ScheduledTask } from "node-cron";

const TIMEZONE = process.env.SCHEDULER_TIMEZONE ?? "Europe/Warsaw";

let task: ScheduledTask | null = null;

async function tick(): Promise<void> {
  const port = process.env.PORT ?? "3000";
  const baseUrl = process.env.SCHEDULER_BASE_URL ?? `http://127.0.0.1:${port}`;
  const token = process.env.SCHEDULER_TOKEN;

  try {
    const response = await fetch(`${baseUrl}/api/ksef/scheduled-run`, {
      method: "POST",
      headers: token ? { "x-scheduler-token": token } : {},
    });
    if (!response.ok) {
      console.error(`[cron] przebieg odrzucony: HTTP ${response.status}`);
      return;
    }
    const result = (await response.json()) as { outcome: string; message?: string };
    if (result.outcome !== "skipped") {
      console.log(`[cron] ${result.outcome}${result.message ? `: ${result.message}` : ""}`);
    }
  } catch (error) {
    // Niedostępność własnego serwera nie może wywrócić procesu — kolejny tik
    // spróbuje ponownie za minutę.
    console.error("[cron] nie udało się wywołać przebiegu:", error instanceof Error ? error.message : error);
  }
}

export function startCron(): void {
  if (task) return;
  if (process.env.KSEF_SCHEDULER === "off") {
    console.log("[cron] harmonogram wyłączony przez KSEF_SCHEDULER=off");
    return;
  }

  task = cron.schedule("* * * * *", () => void tick(), { timezone: TIMEZONE });
  console.log(`[cron] harmonogram uruchomiony, strefa ${TIMEZONE}`);
}
