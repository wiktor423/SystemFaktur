/**
 * Schematy Zod dla granicy HTTP.
 *
 * Reguły domenowe (suma kontrolna NIP, mod 97 rachunku, spójność kwot) nie są
 * tu powtarzane — schematy wołają te same czyste funkcje z `domain/validation`,
 * których używa formularz w przeglądarce. Dzięki temu walidacja po stronie
 * klienta i serwera nie może się rozjechać: jest jedna implementacja reguły,
 * a nie dwie kopie do utrzymania.
 */
import { z } from "zod";
import {
  stripSeparators,
  validateAmountConsistency,
  validateBankAccount,
  validateDocumentNumber,
  validateNip,
} from "@/lib/domain/validation";

/** Podpina czystą regułę domenową jako `superRefine` Zoda. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Oczekiwano daty w formacie RRRR-MM-DD.");

export const nipSchema = z
  .string()
  .transform(stripSeparators)
  .superRefine((value, ctx) => {
    const result = validateNip(value);
    if (!result.valid) ctx.addIssue({ code: "custom", message: result.message ?? undefined });
  });

export const bankAccountSchema = z
  .string()
  .transform(stripSeparators)
  .superRefine((value, ctx) => {
    const result = validateBankAccount(value);
    if (!result.valid) ctx.addIssue({ code: "custom", message: result.message ?? undefined });
  });

export const documentNumberSchema = z.string().superRefine((value, ctx) => {
  const result = validateDocumentNumber(value);
  if (!result.valid) ctx.addIssue({ code: "custom", message: result.message ?? undefined });
});

const money = z.number().finite().min(0, "Kwota nie może być ujemna.").max(1e12, "Kwota poza dopuszczalnym zakresem.");

export const invoiceLineSchema = z.object({
  name: z.string().trim().min(1, "Nazwa pozycji jest wymagana.").max(512),
  quantity: z.number().finite().positive("Ilość musi być dodatnia."),
  unit: z.string().trim().min(1).max(16),
  unitNetPrice: money,
  vatRate: z.number().finite().min(0).max(100),
  netAmount: money,
  vatAmount: money,
  grossAmount: money,
});

const documentCore = z.object({
  number: documentNumberSchema,
  typeId: z.string().min(1, "Typ dokumentu jest wymagany."),
  counterpartyId: z.string().min(1, "Kontrahent jest wymagany."),
  issueDate: isoDate,
  saleDate: isoDate.nullable().default(null),
  dueDate: isoDate,
  netAmount: money,
  vatAmount: money,
  grossAmount: money,
  currency: z.string().length(3).default("PLN"),
  paymentAccount: bankAccountSchema.nullable().default(null),
  categoryId: z.string().nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
  lines: z.array(invoiceLineSchema).default([]),
});

/**
 * Reguły przekrojowe — sprawdzalne dopiero, gdy znamy komplet pól. Trzymane
 * jako zwykła funkcja, żeby ten sam zestaw obowiązywał przy tworzeniu i przy
 * edycji dokumentu bez duplikowania kodu.
 */
function checkCrossFieldRules(value: z.infer<typeof documentCore>, ctx: z.RefinementCtx): void {
  if (value.dueDate < value.issueDate) {
    ctx.addIssue({
      code: "custom",
      path: ["dueDate"],
      message: "Termin płatności nie może być wcześniejszy niż data wystawienia.",
    });
  }

  const amounts = validateAmountConsistency(value.netAmount, value.vatAmount, value.grossAmount);
  if (!amounts.valid) {
    ctx.addIssue({ code: "custom", path: ["grossAmount"], message: amounts.message ?? undefined });
  }
}

export const createDocumentSchema = documentCore
  .extend({
    source: z.enum(["ksef", "upload", "manual"]).default("manual"),
    /** Dokument dodany ręcznie trafia domyślnie do rejestru, wgrany — do bufora. */
    stage: z.enum(["buffer", "registered"]).default("registered"),
  })
  .superRefine(checkCrossFieldRules);

export const updateDocumentSchema = documentCore.superRefine(checkCrossFieldRules);

/**
 * Parametr powtarzalny w URL-u. Przegladarka wysyla `?ids=a&ids=b`, ale przy
 * jednej wartosci przychodzi zwykly string - bez normalizacji filtr z jednym
 * zaznaczeniem konczylby sie bledem walidacji.
 */
const arrayParam = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess(
    (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]),
    z.array(item),
  );

export const documentFiltersSchema = z.object({
  search: z.string().default(""),
  typeIds: arrayParam(z.string()).default([]),
  counterpartyIds: arrayParam(z.string()).default([]),
  categoryIds: arrayParam(z.string()).default([]),
  sources: arrayParam(z.enum(["ksef", "upload", "manual"])).default([]),
  paymentStatuses: arrayParam(z.enum(["unpaid", "partial", "paid"])).default([]),
  issueDateFrom: isoDate.nullable().default(null),
  issueDateTo: isoDate.nullable().default(null),
  dueDateFrom: isoDate.nullable().default(null),
  dueDateTo: isoDate.nullable().default(null),
  stage: z.enum(["buffer", "registered"]).optional(),
  sortKey: z.string().default("issueDate"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const counterpartySchema = z.object({
  name: z.string().trim().min(1, "Nazwa jest wymagana.").max(255),
  nip: nipSchema,
  street: z.string().max(255).nullable().default(null),
  postalCode: z.string().max(12).nullable().default(null),
  city: z.string().max(128).nullable().default(null),
  country: z.string().length(2).default("PL"),
  bankAccount: bankAccountSchema.nullable().default(null),
  defaultCategoryId: z.string().nullable().default(null),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Nazwa kategorii jest wymagana.").max(128),
  parentId: z.string().nullable().default(null),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Kolor musi być zapisem szesnastkowym.").nullable().default(null),
});

export const documentTypeSchema = z.object({
  name: z.string().trim().min(1, "Nazwa typu jest wymagana.").max(128),
  shortName: z.string().trim().min(1).max(8),
  direction: z.enum(["receivable", "payable"]),
});

export const ksefImportSchema = z
  .object({
    dateFrom: isoDate,
    dateTo: isoDate,
    scope: z.enum(["purchase", "sale", "both"]),
  })
  .superRefine((value, ctx) => {
    if (value.dateTo < value.dateFrom) {
      ctx.addIssue({ code: "custom", path: ["dateTo"], message: "Zakres dat jest odwrócony." });
    }
  });

export const ksefScheduleSchema = z.object({
  enabled: z.boolean(),
  times: z
    .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Godzina musi mieć format HH:mm."))
    .max(24, "Najwyżej 24 uruchomienia na dobę."),
  scope: z.enum(["purchase", "sale", "both"]),
  lookbackDays: z.number().int().min(1).max(365),
  simulateFailure: z.boolean().default(false),
});

export const bufferDecisionSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Wskaż co najmniej jeden dokument."),
});

export const columnPreferencesSchema = z.object({
  columns: z.array(z.object({ key: z.string().max(32), visible: z.boolean() })).min(1),
});
