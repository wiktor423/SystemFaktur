import { acceptFromBuffer } from "@/server/documents";
import { bufferDecisionSchema } from "@/lib/validation/schemas";
import { handle, ok, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const parsed = await parseBody(request, bufferDecisionSchema);
    if (parsed.error) return parsed.error;

    const accepted = await acceptFromBuffer(parsed.data.ids);
    const skipped = parsed.data.ids.length - accepted;
    return ok({
      accepted,
      skipped,
      message:
        accepted === 0
          ? "Żadna z pozycji nie oczekiwała już w buforze."
          : `Przeniesiono do rejestru: ${accepted}.${skipped ? ` Pominięto ${skipped} (już przeniesione).` : ""}`,
    });
  });
}
