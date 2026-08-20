/** Formatowanie wartości do prezentacji — jedno miejsce, spójne w całej aplikacji. */

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string): Intl.NumberFormat {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(currency, formatter);
  }
  return formatter;
}

export function formatAmount(value: number, currency = "PLN"): string {
  return currencyFormatter(currency).format(value);
}

const numberFormatter = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

const quantityFormatter = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

/** Ilość na pozycji faktury — bez sztucznych końcówek „,00”. */
export function formatQuantity(value: number): string {
  return quantityFormatter.format(value);
}

const dateFormatter = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

const dateTimeFormatter = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

/** Grupuje NRB w bloki „PL00 0000 …” typowe dla polskich rachunków. */
export function formatBankAccount(value: string | null): string {
  if (!value) return "—";
  const raw = value.replace(/\s/g, "");
  return raw.replace(/(.{4})/g, "$1 ").trim();
}

export function formatNip(value: string): string {
  const raw = value.replace(/\D/g, "");
  if (raw.length !== 10) return value;
  return `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6, 8)}-${raw.slice(8)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Liczba dni od dziś do podanej daty (ujemna = termin minął). */
export function daysUntil(iso: string, today = new Date()): number {
  const target = new Date(`${iso}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

/** Opis terminu płatności w języku naturalnym: „za 3 dni”, „5 dni po terminie”. */
export function describeDueDate(iso: string, today = new Date()): string {
  const days = daysUntil(iso, today);
  if (days === 0) return "dziś";
  if (days === 1) return "jutro";
  if (days === -1) return "1 dzień po terminie";
  if (days > 0) return `za ${days} ${pluralDays(days)}`;
  return `${Math.abs(days)} ${pluralDays(Math.abs(days))} po terminie`;
}

function pluralDays(count: number): string {
  return count === 1 ? "dzień" : "dni";
}
