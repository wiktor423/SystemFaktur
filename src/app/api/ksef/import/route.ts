import { z } from "zod";
import { importFromKsef } from "@/server/ksef-import";
import { ksefImportSchema } from "@/lib/validation/schemas";
import { handle, ok, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

const schema = ksefImportSchema.and(z.object({ trigger: z.enum(["manual", "schedule"]).default("manual") }));

export async function POST(request: Request) {
  return handle(async () => {
    const parsed = await parseBody(request, schema);
    if (parsed.error) return parsed.error;

    const summary = await importFromKsef({ ...parsed.data, trigger: parsed.data.trigger });

    const parts = [`Pobrano z KSeF: ${summary.fetched}.`];
    if (summary.imported) parts.push(`Do bufora trafiło: ${summary.imported}.`);
    if (summary.duplicates) parts.push(`Duplikaty pominięte: ${summary.duplicates}.`);
    if (summary.createdCounterparties) parts.push(`Nowi kontrahenci: ${summary.createdCounterparties}.`);
    if (!summary.fetched) parts.push("W tym zakresie nie ma faktur.");

    return ok({ summary, message: parts.join(" ") });
  });
}
