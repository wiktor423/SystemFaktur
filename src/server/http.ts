/**
 * Wspólna warstwa HTTP dla route handlerów.
 *
 * Handlery mają być cienkie: sparsuj wejście, zawołaj serwis, zwróć wynik.
 * Tłumaczenie błędów na kody odpowiedzi jest tutaj, żeby każdy endpoint
 * raportował je tak samo i żeby nie powielać try/catch w kilkunastu plikach.
 */
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { DuplicateDocumentError } from "@/server/documents";
import { KsefError } from "@/lib/ksef/client";

export interface ApiError {
  message: string;
  /** Błędy przypisane do pól formularza, w formacie zrozumiałym dla UI. */
  fields?: Record<string, string>;
}

export const ok = <T>(data: T, status = 200) => NextResponse.json(data, { status });

export const fail = (message: string, status: number, fields?: Record<string, string>) =>
  NextResponse.json({ message, ...(fields ? { fields } : {}) } satisfies ApiError, { status });

/** Spłaszcza błąd Zoda do mapy "ścieżka pola" -> komunikat. */
function fieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Parsuje ciało żądania. Zwraca dane albo gotową odpowiedź 400. */
export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ data: T; error?: never } | { data?: never; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { error: fail("Treść żądania nie jest poprawnym JSON-em.", 400) };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return { error: fail("Dane nie przeszły walidacji.", 422, fieldErrors(result.error)) };
  }
  return { data: result.data };
}

/** Parsuje parametry zapytania (obsługuje powtórzone klucze jako tablice). */
export function parseQuery<T>(
  url: string,
  schema: ZodType<T>,
): { data: T; error?: never } | { data?: never; error: NextResponse } {
  const params = new URL(url).searchParams;
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    raw[key] = values.length > 1 ? values : values[0];
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return { error: fail("Nieprawidłowe parametry zapytania.", 400, fieldErrors(result.error)) };
  }
  return { data: result.data };
}

/**
 * Opakowanie handlera. Błędy domenowe dostają właściwy kod, a wszystko inne
 * ląduje jako 500 z logiem po stronie serwera - klient nie widzi szczegółów
 * technicznych, ale one nie znikają.
 */
export async function handle(action: () => Promise<Response>): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof DuplicateDocumentError) {
      return fail(error.message, 409, { [error.field]: error.message });
    }
    if (error instanceof KsefError) {
      return fail(error.message, 502);
    }
    if (error instanceof ZodError) {
      return fail("Dane nie przeszły walidacji.", 422, fieldErrors(error));
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") return fail("Nie znaleziono rekordu.", 404);
      if (error.code === "P2002") return fail("Rekord o tych danych już istnieje.", 409);
      if (error.code === "P2003") return fail("Rekord jest powiązany z innymi danymi.", 409);
    }
    console.error("[api]", error);
    return fail("Wystąpił nieoczekiwany błąd serwera.", 500);
  }
}
