import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Pojedyncza instancja klienta Prismy.
 *
 * W trybie deweloperskim Next.js przeładowuje moduły przy każdej zmianie —
 * bez trzymania klienta na `globalThis` każde przeładowanie otwierałoby nową
 * pulę połączeń i baza szybko wyczerpałaby limit.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Brak zmiennej DATABASE_URL.");

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
