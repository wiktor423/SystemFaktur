import { prisma } from "@/lib/db";
import { documentTypeSchema } from "@/lib/validation/schemas";
import { toDb } from "@/server/enums";
import { toDocumentType } from "@/server/mappers";
import { fail, handle, ok, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const parsed = await parseBody(request, documentTypeSchema);
    if (parsed.error) return parsed.error;

    const row = await prisma.documentType.update({
      where: { id },
      data: { ...parsed.data, direction: toDb(parsed.data.direction) },
    });
    return ok(toDocumentType(row));
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const type = await prisma.documentType.findUnique({
      where: { id },
      select: { isSystem: true, _count: { select: { documents: true } } },
    });

    if (!type) return fail("Nie znaleziono typu dokumentu.", 404);
    if (type.isSystem) return fail("Typ systemowy nie może zostać usunięty.", 409);
    if (type._count.documents > 0) {
      return fail(`Typ jest używany przez dokumenty (${type._count.documents}).`, 409);
    }

    await prisma.documentType.delete({ where: { id } });
    return ok({ deleted: 1 });
  });
}
