import { prisma } from "@/lib/db";
import { counterpartySchema } from "@/lib/validation/schemas";
import { toCounterparty } from "@/server/mappers";
import { handle, ok, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const rows = await prisma.counterparty.findMany({ orderBy: { name: "asc" } });
    return ok(rows.map(toCounterparty));
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const parsed = await parseBody(request, counterpartySchema);
    if (parsed.error) return parsed.error;
    return ok(toCounterparty(await prisma.counterparty.create({ data: parsed.data })), 201);
  });
}
