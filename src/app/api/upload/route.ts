import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { stripSeparators } from "@/lib/domain/validation";
import { FaParseError, parseFaInvoice, type ParsedInvoice } from "@/server/fa-parser";
import { fail, handle, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** Rozsądny sufit na pojedynczy plik faktury — XML KSeF ma kilka–kilkanaście kB. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface UploadResult {
  filename: string;
  ok: boolean;
  message: string;
  documentId: string | null;
}

/**
 * Wgrywanie faktur spoza KSeF.
 *
 * Obsługuje pliki XML w schemacie FA(2)/FA(3) — dane wczytują się automatycznie
 * z treści dokumentu. PDF-y celowo tu nie trafiają: nie da się z nich odczytać
 * kwot ani terminów, więc interfejs kieruje je do formularza z załącznikiem,
 * gdzie użytkownik uzupełnia pola ręcznie.
 *
 * Każdy plik przetwarzany jest osobno. Błąd jednego nie przerywa pozostałych —
 * użytkownik dostaje raport plik po pliku zamiast jednego „coś poszło nie tak".
 */
export async function POST(request: Request) {
  return handle(async () => {
    const form = await request.formData().catch(() => null);
    if (!form) return fail("Oczekiwano formularza z plikami.", 400);

    const target = form.get("target") === "registered" ? "REGISTERED" : "BUFFER";
    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) return fail("Nie wskazano żadnego pliku.", 400);

    const [costType, saleType] = await Promise.all([
      prisma.documentType.findFirst({ where: { direction: "PAYABLE", isSystem: true } }),
      prisma.documentType.findFirst({ where: { direction: "RECEIVABLE", isSystem: true } }),
    ]);
    if (!costType || !saleType) {
      return fail("Brak systemowych typów dokumentów. Uruchom seed bazy.", 500);
    }

    const ownNip = stripSeparators(process.env.KSEF_NIP ?? "");
    const results: UploadResult[] = [];

    for (const file of files) {
      results.push(
        await processFile(file, {
          target,
          ownNip,
          costTypeId: costType.id,
          saleTypeId: saleType.id,
        }),
      );
    }

    return ok({ results });
  });
}

async function processFile(
  file: File,
  context: { target: "BUFFER" | "REGISTERED"; ownNip: string; costTypeId: string; saleTypeId: string },
): Promise<UploadResult> {
  const reject = (message: string): UploadResult => ({ filename: file.name, ok: false, message, documentId: null });

  if (file.size > MAX_FILE_BYTES) {
    return reject(`Plik jest za duży (limit ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB).`);
  }
  if (!/\.xml$/i.test(file.name) && file.type !== "text/xml" && file.type !== "application/xml") {
    return reject("Obsługiwane są wyłącznie pliki XML w schemacie FA(2)/FA(3).");
  }

  const raw = new Uint8Array(await file.arrayBuffer());

  let invoice: ParsedInvoice;
  try {
    invoice = parseFaInvoice(new TextDecoder().decode(raw));
  } catch (error) {
    return reject(error instanceof FaParseError ? error.message : "Nie udało się odczytać faktury.");
  }

  // Kierunek wynika z tego, po której stronie transakcji stoi nasza firma.
  // Faktura, na której nas nie ma (np. zagraniczna), trafia jako kosztowa.
  const weAreSeller = context.ownNip !== "" && stripSeparators(invoice.seller.nip) === context.ownNip;
  const party = weAreSeller ? invoice.buyer : invoice.seller;
  const typeId = weAreSeller ? context.saleTypeId : context.costTypeId;

  try {
    const document = await prisma.$transaction(async (tx) => {
      const nip = stripSeparators(party.nip);
      const counterparty =
        (await tx.counterparty.findUnique({ where: { nip }, select: { id: true, defaultCategoryId: true } })) ??
        (await tx.counterparty.create({
          data: {
            name: party.name,
            nip,
            street: party.street || null,
            postalCode: party.postalCode || null,
            city: party.city || null,
            country: party.country || "PL",
          },
          select: { id: true, defaultCategoryId: true },
        }));

      const registered = context.target === "REGISTERED";

      return tx.document.create({
        data: {
          number: invoice.invoiceNumber,
          typeId,
          counterpartyId: counterparty.id,
          issueDate: new Date(`${invoice.issueDate}T00:00:00Z`),
          saleDate: invoice.saleDate ? new Date(`${invoice.saleDate}T00:00:00Z`) : null,
          // Brak terminu płatności w pliku traktujemy jak płatność na datę
          // wystawienia — lepsze niż odrzucenie całego dokumentu.
          dueDate: new Date(`${invoice.dueDate ?? invoice.issueDate}T00:00:00Z`),
          netAmount: invoice.netAmount,
          vatAmount: invoice.vatAmount,
          grossAmount: invoice.grossAmount,
          currency: invoice.currency,
          paymentAccount: invoice.paymentAccount,
          categoryId: counterparty.defaultCategoryId,
          categoryAutoAssigned: counterparty.defaultCategoryId !== null,
          source: "UPLOAD",
          stage: context.target,
          bufferDecision: registered ? "ACCEPTED" : "PENDING",
          registeredAt: registered ? new Date() : null,
          lines: { create: invoice.lines.map((line, index) => ({ position: index + 1, ...line })) },
          attachment: {
            create: {
              kind: "XML",
              filename: file.name,
              contentType: "application/xml",
              size: raw.byteLength,
              content: raw.slice(),
            },
          },
        },
        select: { id: true },
      });
    });

    return {
      filename: file.name,
      ok: true,
      message: `${invoice.formCode}: ${invoice.invoiceNumber}, ${invoice.grossAmount.toFixed(2)} ${invoice.currency}.`,
      documentId: document.id,
    };
  } catch (error) {
    // Ta sama faktura wgrana drugi raz to nie awaria — informujemy i idziemy dalej.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return reject(`Faktura ${invoice.invoiceNumber} już istnieje w systemie.`);
    }
    console.error("[upload]", error);
    return reject("Zapis dokumentu nie powiódł się.");
  }
}
