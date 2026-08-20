import { prisma } from "@/lib/db";
import { documentTypeSchema } from "@/lib/validation/schemas";
import { toDb } from "@/server/enums";
import { toDocumentType } from "@/server/mappers";
import { handle, ok, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const rows = await prisma.documentType.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }] });
    return ok(rows.map(toDocumentType));
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const parsed = await parseBody(request, documentTypeSchema);
    if (parsed.error) return parsed.error;

    const row = await prisma.documentType.create({
      data: { ...parsed.data, direction: toDb(parsed.data.direction), isSystem: false },
    });
    return ok(toDocumentType(row), 201);
  });
}
