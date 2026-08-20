import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Klient Prismy tworzony leniwie, przy pierwszym użyciu.
 *
 * Dwa powody, dla których nie powstaje na poziomie modułu. Po pierwsze,
 * budowanie aplikacji importuje route handlery, żeby przeanalizować trasy —
 * gdyby import wymagał `DATABASE_URL`, obraz produkcyjny nie dałby się zbudować
 * bez podania sekretu na etapie budowania, a to jest dokładnie ten sekret,
 * którego nie chcemy w warstwie obrazu.
 *
 * Po drugie, w trybie deweloperskim Next przeładowuje moduły przy każdej
 * zmianie. Bez trzymania instancji na `globalThis` każde przeładowanie
 * otwierałoby nową pulę połączeń i baza szybko wyczerpałaby limit.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Brak zmiennej DATABASE_URL — skonfiguruj połączenie z bazą.");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Proxy odsuwa utworzenie klienta do pierwszego odwołania do pola. Reszta
 * aplikacji korzysta z niego jak ze zwykłej instancji — `prisma.document...`
 * działa bez zmian, ale nic się nie łączy, dopóki nikt nie zapyta.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getClient();
    const value = Reflect.get(client, property, receiver);
    // Metody trzeba dowiązać do prawdziwej instancji — wywołane na proxy
    // straciłyby `this`.
    return typeof value === "function" ? value.bind(client) : value;
  },
});
