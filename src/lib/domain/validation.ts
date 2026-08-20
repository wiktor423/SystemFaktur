/**
 * Reguły walidacji domenowej — czyste funkcje, bez zależności od UI.
 *
 * Ta sama logika zostanie użyta po stronie serwera (opakowana w schematy Zod),
 * dlatego nie ma tu nic reactowego ani żadnych komunikatów specyficznych dla
 * konkretnego formularza poza tekstem błędu.
 */

export interface ValidationResult {
  valid: boolean;
  message: string | null;
}

const ok: ValidationResult = { valid: true, message: null };

function fail(message: string): ValidationResult {
  return { valid: false, message };
}

/** Usuwa spacje, myślniki i inne separatory. */
export function stripSeparators(value: string): string {
  return value.replace(/[\s-]/g, "");
}

/**
 * NIP — 10 cyfr z sumą kontrolną (wagi 6,5,7,2,3,4,5,6,7; modulo 11).
 * Reszta równa 10 oznacza numer nieprawidłowy.
 */
export function validateNip(input: string): ValidationResult {
  const nip = stripSeparators(input);
  if (nip.length === 0) return fail("NIP jest wymagany.");
  if (!/^\d{10}$/.test(nip)) return fail("NIP musi składać się z 10 cyfr.");

  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = weights.reduce((acc, weight, index) => acc + weight * Number(nip[index]), 0);
  const checksum = sum % 11;

  if (checksum === 10 || checksum !== Number(nip[9])) {
    return fail("Nieprawidłowa suma kontrolna NIP.");
  }
  return ok;
}

/**
 * Rachunek bankowy w formacie NRB (26 cyfr) lub IBAN (kod kraju + cyfry
 * kontrolne + BBAN). Weryfikujemy sumę kontrolną mod 97 zgodnie z ISO 13616:
 * NRB traktujemy jako IBAN z prefiksem „PL”.
 */
export function validateBankAccount(input: string, options?: { required?: boolean }): ValidationResult {
  const raw = stripSeparators(input).toUpperCase();
  if (raw.length === 0) {
    return options?.required ? fail("Numer rachunku jest wymagany.") : ok;
  }

  const iban = /^\d+$/.test(raw) ? `PL${raw}` : raw;

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) {
    return fail("Nieprawidłowy format rachunku (oczekiwany NRB lub IBAN).");
  }
  if (iban.startsWith("PL") && iban.length !== 28) {
    return fail("Polski rachunek (NRB) musi mieć 26 cyfr.");
  }
  if (mod97(iban) !== 1) {
    return fail("Nieprawidłowa suma kontrolna numeru rachunku.");
  }
  return ok;
}

/** Suma kontrolna IBAN mod 97 liczona na przesuniętym i rozwiniętym ciągu. */
function mod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged
    .split("")
    .map((char) => (/[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char))
    .join("");

  // Liczby są dłuższe niż Number.MAX_SAFE_INTEGER — dzielimy porcjami.
  let remainder = 0;
  for (const digit of digits) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}

/** Kwota: nieujemna, maksymalnie dwa miejsca po przecinku. */
export function validateAmount(value: number | string, label = "Kwota"): ValidationResult {
  const amount = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  if (Number.isNaN(amount)) return fail(`${label} musi być liczbą.`);
  if (amount < 0) return fail(`${label} nie może być ujemna.`);
  if (Math.round(amount * 100) !== Number((amount * 100).toFixed(4))) {
    return fail(`${label} może mieć maksymalnie dwa miejsca po przecinku.`);
  }
  return ok;
}

/** Spójność kwot: netto + VAT = brutto (tolerancja groszowa). */
export function validateAmountConsistency(net: number, vat: number, gross: number): ValidationResult {
  if (Math.abs(net + vat - gross) > 0.011) {
    return fail("Suma netto i VAT musi być równa kwocie brutto.");
  }
  return ok;
}

/** Data w formacie ISO yyyy-mm-dd. */
export function validateDate(value: string, label = "Data"): ValidationResult {
  if (!value) return fail(`${label} jest wymagana.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail(`${label} ma nieprawidłowy format.`);
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return fail(`${label} nie istnieje w kalendarzu.`);
  return ok;
}

/** Termin płatności nie może wypadać przed datą wystawienia. */
export function validateDueDate(issueDate: string, dueDate: string): ValidationResult {
  const base = validateDate(dueDate, "Termin płatności");
  if (!base.valid) return base;
  if (issueDate && dueDate < issueDate) {
    return fail("Termin płatności nie może być wcześniejszy niż data wystawienia.");
  }
  return ok;
}

/** Numer dokumentu — niepusty, bez skrajnych spacji. */
export function validateDocumentNumber(value: string): ValidationResult {
  const trimmed = value.trim();
  if (trimmed.length === 0) return fail("Numer dokumentu jest wymagany.");
  if (trimmed.length > 64) return fail("Numer dokumentu jest zbyt długi (max 64 znaki).");
  return ok;
}

/**
 * Klucz deduplikacji dokumentu: numer faktury + NIP kontrahenta.
 * Ten sam klucz obowiązuje dla importu z KSeF, uploadu i dodania ręcznego.
 */
export function documentDedupKey(documentNumber: string, counterpartyNip: string): string {
  return `${documentNumber.trim().toUpperCase()}::${stripSeparators(counterpartyNip)}`;
}
