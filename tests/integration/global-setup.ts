import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { TEST_DATABASE_URL } from "./database-url.mjs";

/**
 * Przygotowanie bazy testowej.
 *
 * Uruchamia się raz, przed całym przebiegiem. Zakłada bazę, jeśli jej nie ma,
 * i nakłada migracje przez `prisma migrate deploy` — czyli dokładnie tą samą
 * komendą, która idzie na produkcję. Gdyby testy budowały schemat inaczej
 * (np. przez `db push`), przestałyby wykrywać błędy w samych migracjach.
 */
export async function setup() {
  const url = TEST_DATABASE_URL;

  const parsed = new URL(url);
  const databaseName = parsed.pathname.replace(/^\//, "");

  // Do założenia bazy trzeba połączyć się z inną bazą na tym samym serwerze.
  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";

  const admin = new Client({ connectionString: maintenance.toString() });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      `Nie udało się połączyć z PostgreSQL pod ${maintenance.host}. ` +
        `Uruchom bazę komendą \`docker compose up -d db\`. Szczegóły: ${(error as Error).message}`,
    );
  }

  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (existing.rowCount === 0) {
    // Nazwa bazy nie może wejść jako parametr zapytania, więc cytujemy ją
    // identyfikatorem — pochodzi z konfiguracji, ale zasada zostaje zasadą.
    await admin.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
    console.log(`[testy] utworzono bazę ${databaseName}`);
  }
  await admin.end();

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  console.log(`[testy] schemat bazy ${databaseName} aktualny`);
}
