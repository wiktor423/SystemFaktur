import { execFileSync } from "node:child_process";
import { Client } from "pg";

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://lexalpha:lexalpha@localhost:5432/lexalpha_e2e?schema=public&connection_limit=5";

/**
 * Baza dla testów e2e: zakładana, migrowana i zasilana danymi demonstracyjnymi
 * przed każdym przebiegiem. Seed jest ten sam, którego używa `docker compose`,
 * więc test startuje z dokładnie takiego stanu, jaki zobaczy recenzent.
 *
 * Uruchamiane jako część komendy startowej serwera, a nie jako `globalSetup`
 * Playwrighta — ten drugi odpala się dopiero PO wstaniu serwera, który bez
 * gotowej bazy nie przechodzi własnej sondy zdrowia.
 */
async function prepare() {
  const maintenance = new URL(DATABASE_URL);
  const databaseName = maintenance.pathname.replace(/^\//, "");
  maintenance.pathname = "/postgres";

  const admin = new Client({ connectionString: maintenance.toString() });
  await admin.connect();
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (existing.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
  }
  await admin.end();

  const env = { ...process.env, DATABASE_URL };
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "pipe" });
  execFileSync("npx", ["prisma", "db", "seed"], { env, stdio: "pipe" });
  console.log(`[e2e] baza ${databaseName} gotowa`);
}

await prepare();
