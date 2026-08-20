import { deleteDocuments, getDocument, updateDocument } from "@/server/documents";
import { updateDocumentSchema } from "@/lib/validation/schemas";
import { fail, handle, ok, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const document = await getDocument(id);
    return document ? ok(document) : fail("Nie znaleziono dokumentu.", 404);
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const parsed = await parseBody(request, updateDocumentSchema);
    if (parsed.error) return parsed.error;
    return ok(await updateDocument(id, parsed.data));
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const deleted = await deleteDocuments([id]);
    return deleted ? ok({ deleted }) : fail("Nie znaleziono dokumentu.", 404);
  });
}
