import { authenticate, call } from "./ksef-lib.mjs";
import fs from "node:fs/promises";

const NIP = "6919478855";
const accessToken = await authenticate({ nip: NIP, token: process.env.KSEF_TOKEN });
const range = { dateType: "Issue", from: "2026-07-01T00:00:00Z", to: "2026-08-31T23:59:59Z" };

const query = (subjectType) =>
  call("POST", "/invoices/query/metadata?pageOffset=0&pageSize=50", {
    token: accessToken,
    body: { subjectType, dateRange: range },
  });

for (const [subjectType, label] of [["Subject2", "KOSZTOWE (jesteśmy nabywcą)"], ["Subject1", "SPRZEDAŻOWE (jesteśmy sprzedawcą)"]]) {
  const res = await query(subjectType);
  console.log(`\n=== ${label} — ${res.invoices.length} faktur ===`);
  for (const inv of res.invoices) {
    const other = subjectType === "Subject2" ? inv.seller : inv.buyer;
    console.log(
      `  ${inv.invoiceNumber.padEnd(18)} ${inv.invoicingDate?.slice(0, 10)}  ${String(inv.grossAmount).padStart(12)} ${inv.currency}  ${other?.name ?? other?.nip ?? ""}`,
    );
  }
  await fs.writeFile(`fixtures/invoices-query-${subjectType}.json`, JSON.stringify(res, null, 2));
  if (subjectType === "Subject2") console.log(`  hwm: ${res.permanentStorageHwmDate ?? "—"}`);
}

// prawdziwy XML FA(3) — podstawa testów parsera
const costs = await query("Subject2");
const sample = costs.invoices[0];
const xml = await call("GET", `/invoices/ksef/${sample.ksefNumber}`, { token: accessToken, raw: true });
await fs.writeFile("fixtures/invoice-fa3-real.xml", xml);
console.log(`\nZapisano prawdziwy XML: ${sample.ksefNumber} (${xml.length} B)`);
