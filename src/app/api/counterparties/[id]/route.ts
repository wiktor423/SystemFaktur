import { prisma } from "@/lib/db";
import { counterpartySchema } from "@/lib/validation/schemas";
import { toCounterparty } from "@/server/mappers";
import { fail, handle, ok, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const parsed = await parseBody(request, counterpartySchema);
    if (parsed.error) return parsed.error;
    return ok(toCounterparty(await prisma.counterparty.update({ where: { id }, data: parsed.data })));
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const documents = await prisma.document.count({ where: { counterpartyId: id } });
    if (documents > 0) {
      return fail(`Kontrahent ma powiązane dokumenty (${documents}). Usuń je najpierw.`, 409);
    }
    await prisma.counterparty.delete({ where: { id } });
    return ok({ deleted: 1 });
  });
}
