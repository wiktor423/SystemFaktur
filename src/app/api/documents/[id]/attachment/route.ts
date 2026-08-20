import { prisma } from "@/lib/db";
import { fail, handle } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Strumień pliku zrodlowego dokumentu. Treść załącznika celowo nie wchodzi do
 * odpowiedzi JSON listy - lista rejestru ciągnęłaby wtedy megabajty base64
 * przy każdym odświeżeniu. `inline` pozwala podejrzeć PDF bez pobierania na
 * dysk, czego wprost wymaga zadanie.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const attachment = await prisma.attachment.findUnique({ where: { documentId: id } });
    if (!attachment?.content) return fail("Dokument nie ma pliku źródłowego.", 404);

    return new Response(new Uint8Array(attachment.content), {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Length": String(attachment.content.byteLength),
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.filename)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  });
}
