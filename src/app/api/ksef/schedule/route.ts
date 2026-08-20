import { prisma } from "@/lib/db";
import { ksefScheduleSchema } from "@/lib/validation/schemas";
import { toDb } from "@/server/enums";
import { toSchedule } from "@/server/mappers";
import { handle, ok, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const row = await prisma.ksefSchedule.findUnique({ where: { id: 1 } });
    return ok(row ? toSchedule(row) : null);
  });
}

export async function PUT(request: Request) {
  return handle(async () => {
    const parsed = await parseBody(request, ksefScheduleSchema);
    if (parsed.error) return parsed.error;

    // Godziny zapisujemy posortowane i bez powtórzeń - dwa wpisy "07:30"
    // znaczyłyby to samo co jeden, a w interfejsie wygladalyby na blad.
    const times = [...new Set(parsed.data.times)].sort();

    const row = await prisma.ksefSchedule.upsert({
      where: { id: 1 },
      create: { id: 1, ...parsed.data, times, scope: toDb(parsed.data.scope) },
      update: { ...parsed.data, times, scope: toDb(parsed.data.scope) },
    });
    return ok(toSchedule(row));
  });
}
