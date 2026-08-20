import { prisma } from "@/lib/db";
import { categorySchema } from "@/lib/validation/schemas";
import { toCategory } from "@/server/mappers";
import { handle, ok, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const rows = await prisma.category.findMany({ orderBy: { name: "asc" } });
    return ok(rows.map(toCategory));
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const parsed = await parseBody(request, categorySchema);
    if (parsed.error) return parsed.error;
    return ok(toCategory(await prisma.category.create({ data: parsed.data })), 201);
  });
}
