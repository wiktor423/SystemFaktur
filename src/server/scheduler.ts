/**
 * Logika pojedynczego przebiegu harmonogramu.
 *
 * Sam wyzwalacz czasowy mieszka w `server/cron.ts` i tylko woła endpoint
 * `/api/ksef/scheduled-run`. Rozdział jest celowy z dwóch powodów. Po pierwsze,
 * przebieg z harmonogramu przechodzi dokładnie tą samą ścieżką co pobranie
 * ręczne — jedna implementacja, nie dwie. Po drugie, wyzwalacz da się wymienić
 * na cron platformy wdrożeniowej bez ruszania logiki.
 *
 * Idempotencja nie opiera się na tym, że proces jest jeden. Każdy przebieg
 * zapisuje `(jobName, scheduledFor)` w tabeli `ksef_runs`, gdzie para jest
 * unikalna — jeśli aplikacja działa na kilku replikach, wszystkie odpalą tik
 * o tej samej minucie, ale tylko jedna założy wpis. Reszta dostanie P2002
 * i cicho odpuści. Bez tego trzy repliki pobrałyby faktury trzy razy.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { importFromKsef } from "@/server/ksef-import";
import { fromDb } from "@/server/enums";

const JOB_NAME = "ksef-auto-fetch";
export const TIMEZONE = process.env.SCHEDULER_TIMEZONE ?? "Europe/Warsaw";

/** Bieżąca godzina "HH:mm" w strefie harmonogramu. */
function currentTime(now: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

/**
 * Moment przebiegu obcięty do pełnej minuty. To jest klucz idempotencji, więc
 * musi być identyczny dla wszystkich replik budzących się w tej samej minucie.
 */
function slotFor(now: Date): Date {
  const slot = new Date(now);
  slot.setSeconds(0, 0);
  return slot;
}

export async function runScheduledFetch(now = new Date()): Promise<"skipped" | "done" | "taken"> {
  const schedule = await prisma.ksefSchedule.findUnique({ where: { id: 1 } });
  if (!schedule?.enabled || schedule.times.length === 0) return "skipped";
  if (!schedule.times.includes(currentTime(now))) return "skipped";

  // Zakres liczony wstecz od dziś. `lookbackDays` z zapasem, bo faktura trafia
  // do KSeF z opóźnieniem względem daty wystawienia.
  const dateTo = new Date(now);
  const dateFrom = new Date(now);
  dateFrom.setDate(dateFrom.getDate() - schedule.lookbackDays);
  const iso = (date: Date) => date.toISOString().slice(0, 10);

  try {
    const summary = await importFromKsef({
      dateFrom: iso(dateFrom),
      dateTo: iso(dateTo),
      scope: fromDb(schedule.scope),
      trigger: "schedule",
      jobName: JOB_NAME,
      scheduledFor: slotFor(now),
    });
    console.log(
      `[scheduler] pobrano ${summary.fetched}, do bufora ${summary.imported}, duplikaty ${summary.duplicates}`,
    );
    return "done";
  } catch (error) {
    // Kolizja na (jobName, scheduledFor) znaczy, że inna replika już wzięła
    // ten przebieg. To nie jest błąd — to działający mechanizm.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return "taken";
    }
    // Błąd integracji jest już odnotowany w historii przez `importFromKsef`;
    // tutaj tylko pilnujemy, żeby nie wywrócił procesu aplikacji.
    console.error("[scheduler] pobranie nieudane:", error instanceof Error ? error.message : error);
    return "done";
  }
}
