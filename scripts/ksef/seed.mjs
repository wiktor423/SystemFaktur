import { openSession, call } from "./ksef-lib.mjs";
import { buildFa3 } from "./fa3.mjs";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const parties = JSON.parse(await fs.readFile("parties.json", "utf8"));
const us = parties.self;
const [pakpol, cukrownia, chlodtrans] = parties.suppliers;
const [delikatesy, marketwit, cukiernia] = parties.customers;

/** Kto wystawia → jakie faktury. Faktury kosztowe Gumijagody muszą wyjść
 *  z kontekstu dostawcy, bo w KSeF wystawcą jest zawsze Podmiot1. */
const plan = [
  { issuer: pakpol, invoices: [
    { buyer: us, number: "PAK/0181/2026", issueDate: "2026-07-31", dueDate: "2026-08-07",
      lines: [{ name: "Karton zbiorczy 400x300x200 mm", unit: "szt", quantity: 4000, unitPrice: 2.85, vatRate: 23 },
              { name: "Folia stretch 23 mikrony", unit: "rol", quantity: 60, unitPrice: 48.0, vatRate: 23 }] },
    { buyer: us, number: "PAK/0207/2026", issueDate: "2026-08-11", dueDate: "2026-08-25",
      lines: [{ name: "Etykieta samoprzylepna 60x40 mm", unit: "tys", quantity: 85, unitPrice: 62.5, vatRate: 23 }] },
  ]},
  { issuer: cukrownia, invoices: [
    { buyer: us, number: "CN/2026/07/318", issueDate: "2026-07-24", dueDate: "2026-08-23",
      lines: [{ name: "Cukier biały kryształ, worek 25 kg", unit: "t", quantity: 12, unitPrice: 3150.0, vatRate: 8 }] },
    { buyer: us, number: "CN/2026/08/402", issueDate: "2026-08-14", dueDate: "2026-09-13",
      lines: [{ name: "Cukier biały kryształ, worek 25 kg", unit: "t", quantity: 8, unitPrice: 3180.0, vatRate: 8 },
              { name: "Pektyna jabłkowa E440", unit: "kg", quantity: 150, unitPrice: 84.0, vatRate: 23 }] },
  ]},
  { issuer: chlodtrans, invoices: [
    { buyer: us, number: "CHT/1142/08/2026", issueDate: "2026-08-05", dueDate: "2026-08-19",
      lines: [{ name: "Transport chłodniczy Zakopane–Katowice", unit: "kurs", quantity: 6, unitPrice: 1450.0, vatRate: 23 },
              { name: "Transport chłodniczy Zakopane–Gdynia", unit: "kurs", quantity: 3, unitPrice: 2780.0, vatRate: 23 }] },
  ]},
  { issuer: us, invoices: [
    { buyer: marketwit, number: "GJ/2026/07/118", issueDate: "2026-07-28", dueDate: "2026-08-27",
      lines: [{ name: "Żelki gumijagodowe 200 g — karton 24 szt.", unit: "kart", quantity: 340, unitPrice: 86.5, vatRate: 23 }] },
    { buyer: delikatesy, number: "GJ/2026/08/014", issueDate: "2026-08-03", dueDate: "2026-08-17",
      lines: [{ name: "Konfitura gumijagodowa 320 g", unit: "szt", quantity: 900, unitPrice: 14.2, vatRate: 8 },
              { name: "Syrop gumijagodowy 500 ml", unit: "szt", quantity: 240, unitPrice: 19.9, vatRate: 23 }] },
    { buyer: cukiernia, number: "GJ/2026/08/026", issueDate: "2026-08-12", dueDate: "2026-09-11",
      lines: [{ name: "Gumijagody mrożone, klasa I", unit: "kg", quantity: 220, unitPrice: 38.0, vatRate: 8 }] },
  ]},
];

const results = [];

for (const { issuer, invoices } of plan) {
  const label = `${issuer.name} (${issuer.nip})`;
  console.log(`\n=== ${label} — ${invoices.length} faktur(y) ===`);

  let accessToken;
  if (issuer.nip === us.nip && process.env.KSEF_ACCESS_SELF) {
    accessToken = process.env.KSEF_ACCESS_SELF;
  } else {
    process.stdout.write("    uwierzytelnianie XAdES… ");
    const { stdout } = await run("./bootstrap-nip.sh", [issuer.nip], { maxBuffer: 10e6 });
    accessToken = stdout.trim();
    if (!accessToken) throw new Error(`brak accessTokenu dla ${issuer.nip}`);
    console.log("ok");
  }

  const session = await openSession(accessToken);
  console.log(`    sesja ${session.referenceNumber}`);

  for (const invoice of invoices) {
    const xml = buildFa3({ seller: issuer, bankAccount: issuer.bankAccount, ...invoice });
    await session.send(xml);
    console.log(`    → wysłano ${invoice.number}`);
  }
  await session.close();

  let status;
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    status = await call("GET", `/sessions/${session.referenceNumber}`, { token: accessToken });
    if (status.status.code !== 150 && status.status.code !== 100) break;
  }
  console.log(`    status sesji ${status.status.code}: ${status.status.description}`);

  const listed = await call("GET", `/sessions/${session.referenceNumber}/invoices`, { token: accessToken });
  for (const inv of listed.invoices) {
    console.log(`      ${inv.status.code === 200 ? "✓" : "✗"} ${inv.invoiceNumber ?? "?"} → ${inv.ksefNumber ?? inv.status.description}`);
    if (inv.status.details) console.log(`        ${inv.status.details.join(" | ")}`);
    results.push({ issuer: issuer.nip, issuerName: issuer.name, ...inv });
  }
}

await fs.writeFile("seed-results.json", JSON.stringify(results, null, 2));
const ok = results.filter((r) => r.status.code === 200).length;
console.log(`\n=== Zarejestrowano ${ok} z ${results.length} faktur ===`);
