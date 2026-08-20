import { createDocument, listDocuments } from "@/server/documents";
import { createDocumentSchema, documentFiltersSchema } from "@/lib/validation/schemas";
import { handle, ok, parseBody, parseQuery } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    const parsed = parseQuery(request.url, documentFiltersSchema);
    if (parsed.error) return parsed.error;
    return ok(await listDocuments(parsed.data));
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const parsed = await parseBody(request, createDocumentSchema);
    if (parsed.error) return parsed.error;
    return ok(await createDocument(parsed.data), 201);
  });
}
