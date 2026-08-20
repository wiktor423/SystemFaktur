import { prisma } from "@/lib/db";
import { columnPreferencesSchema } from "@/lib/validation/schemas";
import { handle, ok, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Widoczność i kolejność kolumn rejestru. Kolejność jest zapisywana jako
 * pozycja w tablicy, więc przeciągnięcie kolumny w interfejsie przekłada się
 * wprost na kolejność wierszy w tabeli konfiguracji.
 */
export async function PUT(request: Request) {
  return handle(async () => {
    const parsed = await parseBody(request, columnPreferencesSchema);
    if (parsed.error) return parsed.error;

    await prisma.$transaction([
      prisma.columnPreference.deleteMany(),
      prisma.columnPreference.createMany({
        data: parsed.data.columns.map((column, index) => ({
          key: column.key,
          visible: column.visible,
          position: index,
        })),
      }),
    ]);

    return ok({ columns: parsed.data.columns });
  });
}
