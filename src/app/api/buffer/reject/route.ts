import { rejectFromBuffer } from "@/server/documents";
import { bufferDecisionSchema } from "@/lib/validation/schemas";
import { handle, ok, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const parsed = await parseBody(request, bufferDecisionSchema);
    if (parsed.error) return parsed.error;

    const rejected = await rejectFromBuffer(parsed.data.ids);
    return ok({ rejected, message: `Odrzucono pozycji: ${rejected}.` });
  });
}
