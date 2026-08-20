-- Klucz harmonogramu z Boolean na Int.
--
-- Prisma scala rownolegle wywolania `findUnique` w jedno zapytanie
-- z warunkiem `IN (...)`. Dla klucza typu Boolean taki warunek nie istnieje
-- w wygenerowanym API, wiec dwa jednoczesne odczyty harmonogramu konczyly sie
-- bledem walidacji zapytania. Pod obciazeniem oznaczaloby to losowe awarie
-- endpointow czytajacych ustawienia.
--
-- Jedyny wiersz gwarantuje teraz ograniczenie CHECK, a nie typ kolumny.
ALTER TABLE "ksef_schedule" DROP CONSTRAINT "ksef_schedule_pkey";
ALTER TABLE "ksef_schedule" DROP COLUMN "singleton";
ALTER TABLE "ksef_schedule" ADD COLUMN "id" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ksef_schedule" ADD CONSTRAINT "ksef_schedule_pkey" PRIMARY KEY ("id");
ALTER TABLE "ksef_schedule" ADD CONSTRAINT "ksef_schedule_singleton" CHECK ("id" = 1);
