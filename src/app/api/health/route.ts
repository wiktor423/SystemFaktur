import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Sonda dla platformy wdrożeniowej. Sprawdza realne połączenie z bazą, a nie
 * samo to, że proces odpowiada - proces bez bazy jest bezużyteczny i powinien
 * zostać wymieniony, a nie przyjmować ruch.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "up", latencyMs: Date.now() - startedAt });
  } catch (error) {
    console.error("[health] baza niedostępna", error);
    return NextResponse.json({ status: "degraded", database: "down" }, { status: 503 });
  }
}
