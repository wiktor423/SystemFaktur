import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { runScheduledFetch } from "@/server/scheduler";
import { resetDatabase, seedMinimal } from "./fixtures";

/**
 * Idempotencja harmonogramu.
 *
 * Wymaganie z zadania mówi o konfigurowalnym harmonogramie z wieloma
 * uruchomieniami w ciągu doby. Milczy o tym, co się dzieje przy kilku
 * replikach aplikacji — a to jest właśnie moment, w którym naiwna
 * implementacja pobiera faktury tyle razy, ile procesów wstało.
 *
 * Zabezpieczeniem jest unikalna para `(jobName, scheduledFor)` w historii
 * przebiegów. Poniższe testy sprawdzają, że działa, a nie że istnieje.
 */

/** Bieżąca minuta w strefie harmonogramu, w formacie zapisywanym w ustawieniach. */
function currentSlot(now: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: process.env.SCHEDULER_TIMEZONE ?? "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

async function configureSchedule(times: string[], enabled = true) {
  await prisma.ksefSchedule.upsert({
    where: { id: 1 },
    create: { id: 1, enabled, times, scope: "BOTH", lookbackDays: 30 },
    update: { enabled, times, scope: "BOTH", lookbackDays: 30 },
  });
}

describe("harmonogram pobierania", () => {
  const now = new Date();

  beforeEach(async () => {
    await resetDatabase();
    await seedMinimal();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("nie robi nic, gdy harmonogram jest wyłączony", async () => {
    await configureSchedule([currentSlot(now)], false);
    expect(await runScheduledFetch(now)).toBe("skipped");
    expect(await prisma.ksefRun.count()).toBe(0);
  });

  it("nie robi nic poza wyznaczonymi godzinami", async () => {
    await configureSchedule([currentSlot(new Date(now.getTime() + 37 * 60_000))]);
    expect(await runScheduledFetch(now)).toBe("skipped");
    expect(await prisma.ksefRun.count()).toBe(0);
  });

  it("uruchamia pobranie w wyznaczonej minucie", async () => {
    await configureSchedule([currentSlot(now)]);
    expect(await runScheduledFetch(now)).toBe("done");

    const run = await prisma.ksefRun.findFirstOrThrow();
    expect(run.trigger).toBe("SCHEDULE");
    expect(run.jobName).toBe("ksef-auto-fetch");
    expect(run.fetched).toBeGreaterThan(0);
  });

  it("trzy repliki w tej samej minucie dają jeden przebieg", async () => {
    // Serce zabezpieczenia. Wszystkie trzy wywołania widzą tę samą
    // konfigurację i tę samą minutę; wygrywa to, które pierwsze założy wpis
    // w historii, reszta odbija się od unikalnego indeksu.
    await configureSchedule([currentSlot(now)]);

    const outcomes = await Promise.all([
      runScheduledFetch(now),
      runScheduledFetch(now),
      runScheduledFetch(now),
    ]);

    expect(outcomes.filter((outcome) => outcome === "done")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === "taken")).toHaveLength(2);
    expect(await prisma.ksefRun.count({ where: { jobName: "ksef-auto-fetch" } })).toBe(1);
  });

  it("nie pobiera faktur dwukrotnie przy równoległych replikach", async () => {
    // Konsekwencja praktyczna: liczy się nie tylko jeden wpis w historii,
    // ale też to, że w buforze nie ma podwójnych dokumentów.
    await configureSchedule([currentSlot(now)]);

    await Promise.all([runScheduledFetch(now), runScheduledFetch(now), runScheduledFetch(now)]);

    const run = await prisma.ksefRun.findFirstOrThrow({ where: { jobName: "ksef-auto-fetch" } });
    expect(await prisma.document.count()).toBe(run.imported);
  });

  it("kolejna minuta jest nowym przebiegiem", async () => {
    // Blokada dotyczy konkretnej minuty, a nie zadania w ogóle — inaczej
    // harmonogram odpaliłby się raz i zamilkł na zawsze.
    const later = new Date(now.getTime() + 60_000);
    await configureSchedule([currentSlot(now), currentSlot(later)]);

    expect(await runScheduledFetch(now)).toBe("done");
    expect(await runScheduledFetch(later)).toBe("done");
    expect(await prisma.ksefRun.count({ where: { jobName: "ksef-auto-fetch" } })).toBe(2);
  });

  it("przebiegi ręczne nie kolidują ze sobą", async () => {
    // Ręczne pobrania mają `jobName` puste, więc mogą się powtarzać dowolnie
    // często — użytkownik ma prawo kliknąć „Pobierz" dwa razy pod rząd.
    const { importFromKsef } = await import("@/server/ksef-import");
    const range = { dateFrom: "2026-07-01", dateTo: "2026-08-31", scope: "both" as const, trigger: "manual" as const };

    await importFromKsef(range);
    await importFromKsef(range);

    expect(await prisma.ksefRun.count({ where: { jobName: null } })).toBe(2);
  });
});
