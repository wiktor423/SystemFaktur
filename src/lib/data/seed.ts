import type {
  Category,
  Counterparty,
  DocumentType,
  InvoiceDocument,
  InvoiceLine,
  KsefRun,
  KsefSchedule,
} from "@/lib/domain/types";

/**
 * Dane demonstracyjne.
 *
 * Generator jest deterministyczny (własny PRNG z ustalonym ziarnem), dzięki
 * czemu render po stronie serwera i klienta daje identyczny wynik. Docelowo
 * ten plik zastąpi `prisma/seed.ts` — kształt danych pozostanie ten sam.
 */

/* --------------------------------- PRNG ---------------------------------- */

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

const random = createRandom(20260418);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

function between(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/* --------------------------------- Daty ---------------------------------- */

/**
 * Kotwica dat = dzisiejszy dzień (z dokładnością do doby, żeby SSR i klient
 * zgadzały się co do znaku). Dzięki temu demo zawsze wygląda „na dziś”.
 */
const ANCHOR = (() => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
})();

function isoDate(offsetDays: number): string {
  const date = new Date(ANCHOR);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function isoDateTime(offsetDays: number, hour: number, minute: number): string {
  const date = new Date(ANCHOR);
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

/* ------------------------------- Kategorie -------------------------------- */

export const seedCategories: Category[] = [
  { id: "cat-surowce", name: "Surowce i produkcja", parentId: null, color: "#8b5cf6" },
  { id: "cat-owoce", name: "Gumijagody i owoce", parentId: "cat-surowce", color: null },
  { id: "cat-cukier", name: "Cukier i dodatki", parentId: "cat-surowce", color: null },
  { id: "cat-opakowania", name: "Opakowania", parentId: "cat-surowce", color: null },

  { id: "cat-plantacja", name: "Plantacja", parentId: null, color: "#10b981" },
  { id: "cat-nawozy", name: "Nawozy i ochrona roślin", parentId: "cat-plantacja", color: null },
  { id: "cat-dzierzawa", name: "Dzierżawa gruntów", parentId: "cat-plantacja", color: null },

  { id: "cat-logistyka", name: "Logistyka", parentId: null, color: "#0ea5e9" },
  { id: "cat-chlodnia", name: "Transport chłodniczy", parentId: "cat-logistyka", color: null },
  { id: "cat-kurier", name: "Przesyłki kurierskie", parentId: "cat-logistyka", color: null },

  { id: "cat-admin", name: "Administracja", parentId: null, color: "#f59e0b" },
  { id: "cat-media", name: "Media i czynsz", parentId: "cat-admin", color: null },
  { id: "cat-uslugi", name: "Usługi księgowe i prawne", parentId: "cat-admin", color: null },
  { id: "cat-it", name: "IT i oprogramowanie", parentId: "cat-admin", color: null },

  { id: "cat-marketing", name: "Marketing", parentId: null, color: "#ec4899" },
  { id: "cat-reklama", name: "Reklama online", parentId: "cat-marketing", color: null },
  { id: "cat-targi", name: "Targi i degustacje", parentId: "cat-marketing", color: null },

  { id: "cat-sprzedaz", name: "Sprzedaż", parentId: null, color: "#6d3ee0" },
  { id: "cat-sieci", name: "Sieci handlowe", parentId: "cat-sprzedaz", color: null },
  { id: "cat-horeca", name: "Cukiernie i HoReCa", parentId: "cat-sprzedaz", color: null },
  { id: "cat-eshop", name: "Sklep internetowy", parentId: "cat-sprzedaz", color: null },
];

/* ------------------------------ Typy dokumentów --------------------------- */

export const seedDocumentTypes: DocumentType[] = [
  { id: "type-cost", name: "Faktura kosztowa", shortName: "FK", direction: "payable", isSystem: true },
  { id: "type-sale", name: "Faktura sprzedażowa", shortName: "FS", direction: "receivable", isSystem: true },
  { id: "type-correction-cost", name: "Faktura korygująca (koszt)", shortName: "KK", direction: "payable", isSystem: false },
  { id: "type-debit-note", name: "Nota obciążeniowa", shortName: "NO", direction: "payable", isSystem: false },
  { id: "type-interest-note", name: "Nota odsetkowa", shortName: "NOD", direction: "receivable", isSystem: false },
];

/* -------------------------------- Kontrahenci ------------------------------ */

/**
 * Kartoteka kontrahentow. NIP-y szesciu podmiotow odpowiadaja firmom realnie
 * zarejestrowanym w naszej piaskownicy KSeF (patrz
 * `src/lib/ksef/__fixtures__/sandbox-parties.json`) - dzieki temu import
 * z KSeF trafia na istniejaca kartoteke zamiast zakladac druga dla tej
 * samej firmy.
 */
export const seedCounterparties: Counterparty[] = [
  {
    id: "cp-owoce-beskid",
    name: "Skup Runa Leśnego „Beskid Gumijski” sp. z o.o.",
    nip: "8740204235",
    address: { street: "Zbójnicka 14", postalCode: "34-500", city: "Zakopane", country: "PL" },
    bankAccount: "PL79995938448459912309418476",
    defaultCategoryId: "cat-owoce",
  },
  {
    id: "cp-cukrownia",
    name: "Cukrownia Nadwiślańska S.A.",
    nip: "9430928608",
    address: { street: "Fabryczna 3", postalCode: "87-100", city: "Toruń", country: "PL" },
    bankAccount: "PL09896468506185741940188577",
    defaultCategoryId: "cat-cukier",
  },
  {
    id: "cp-pakpol",
    name: "PakPol Opakowania sp. z o.o.",
    nip: "2650866478",
    address: { street: "Przemysłowa 22", postalCode: "05-800", city: "Pruszków", country: "PL" },
    bankAccount: "PL72065624890916508908017151",
    defaultCategoryId: "cat-opakowania",
  },
  {
    id: "cp-chlodtrans",
    name: "ChłodTrans Logistyka sp.j.",
    nip: "4291146318",
    address: { street: "Spedycyjna 8", postalCode: "43-300", city: "Bielsko-Biała", country: "PL" },
    bankAccount: "PL58722042510956488754006162",
    defaultCategoryId: "cat-chlodnia",
  },
  {
    id: "cp-agrochem",
    name: "AgroChem Karpaty sp. z o.o.",
    nip: "8657439794",
    address: { street: "Rolnicza 41", postalCode: "33-300", city: "Nowy Sącz", country: "PL" },
    bankAccount: "PL68473388221505264582553100",
    defaultCategoryId: "cat-nawozy",
  },
  {
    id: "cp-energia",
    name: "Tauron Sprzedaż sp. z o.o.",
    nip: "2266500977",
    address: { street: "Łagiewnicka 60", postalCode: "30-417", city: "Kraków", country: "PL" },
    bankAccount: "PL98113112953770365433281484",
    defaultCategoryId: "cat-media",
  },
  {
    id: "cp-kancelaria",
    name: "Kancelaria Podatkowa Malina i Wspólnicy",
    nip: "9265930544",
    address: { street: "Rynek 7", postalCode: "31-042", city: "Kraków", country: "PL" },
    bankAccount: "PL68113592671220291912187597",
    defaultCategoryId: "cat-uslugi",
  },
  {
    id: "cp-softhouse",
    name: "Vertex Software sp. z o.o.",
    nip: "9467107575",
    address: { street: "Chmielna 73", postalCode: "00-801", city: "Warszawa", country: "PL" },
    bankAccount: "PL65126209088158362833685174",
    defaultCategoryId: "cat-it",
  },
  {
    id: "cp-adhouse",
    name: "AdHouse Performance sp. z o.o.",
    nip: "3356743833",
    address: { street: "Wołoska 12", postalCode: "02-675", city: "Warszawa", country: "PL" },
    bankAccount: "PL49562171354521591220375302",
    defaultCategoryId: "cat-reklama",
  },
  {
    id: "cp-kurier",
    name: "SzybkaPaczka Kurier sp. z o.o.",
    nip: "2424240855",
    address: { street: "Logistyczna 5", postalCode: "62-021", city: "Poznań", country: "PL" },
    bankAccount: "PL69398248084137330485354814",
    defaultCategoryId: "cat-kurier",
  },
  {
    id: "cp-siecdelikatesy",
    name: "Delikatesy Południe S.A.",
    nip: "5455943157",
    address: { street: "Handlowa 100", postalCode: "40-100", city: "Katowice", country: "PL" },
    bankAccount: "PL24897717449617116850122240",
    defaultCategoryId: "cat-sieci",
  },
  {
    id: "cp-cukiernia",
    name: "Cukiernia Pod Jagodą Anna Malinowska",
    nip: "3232624106",
    address: { street: "Floriańska 18", postalCode: "31-019", city: "Kraków", country: "PL" },
    bankAccount: "PL90379221021732876919374525",
    defaultCategoryId: "cat-horeca",
  },
  {
    id: "cp-marketwit",
    name: "MarketWit Sieci Handlowe sp. z o.o.",
    nip: "7850931102",
    address: { street: "Aleja Zwycięstwa 210", postalCode: "81-521", city: "Gdynia", country: "PL" },
    bankAccount: "PL16929254723062683557214900",
    defaultCategoryId: "cat-sieci",
  },
  {
    id: "cp-berrytech",
    name: "BerryTech Machinery GmbH",
    nip: "6984068649",
    address: { street: "Industriestraße 44", postalCode: "80339", city: "München", country: "DE" },
    bankAccount: null,
    defaultCategoryId: null,
  },
];

/* --------------------------- Generowanie dokumentów ------------------------ */

interface LineTemplate {
  name: string;
  unit: string;
  unitNetPrice: number;
  vatRate: number;
  quantityRange: [number, number];
}

const costLines: Record<string, LineTemplate[]> = {
  "cp-owoce-beskid": [
    { name: "Gumijagody klasa I — zbiór ręczny", unit: "kg", unitNetPrice: 18.4, vatRate: 5, quantityRange: [80, 400] },
    { name: "Gumijagody klasa II — na syrop", unit: "kg", unitNetPrice: 11.9, vatRate: 5, quantityRange: [100, 600] },
  ],
  "cp-cukrownia": [
    { name: "Cukier biały kryształ, worek 25 kg", unit: "szt.", unitNetPrice: 96.5, vatRate: 8, quantityRange: [20, 120] },
    { name: "Syrop glukozowo-fruktozowy", unit: "kg", unitNetPrice: 4.35, vatRate: 8, quantityRange: [200, 900] },
  ],
  "cp-pakpol": [
    { name: "Słoik 320 ml z zakrętką twist-off", unit: "szt.", unitNetPrice: 1.28, vatRate: 23, quantityRange: [2000, 9000] },
    { name: "Karton zbiorczy 6-pack, nadruk pełnokolorowy", unit: "szt.", unitNetPrice: 2.15, vatRate: 23, quantityRange: [500, 2500] },
    { name: "Etykieta samoprzylepna „Konfitura Gumijagodowa”", unit: "szt.", unitNetPrice: 0.19, vatRate: 23, quantityRange: [5000, 20000] },
  ],
  "cp-chlodtrans": [
    { name: "Transport chłodniczy Beskid → Kraków (2–4 °C)", unit: "kurs", unitNetPrice: 1240, vatRate: 23, quantityRange: [1, 6] },
    { name: "Dopłata paliwowa", unit: "usł.", unitNetPrice: 180, vatRate: 23, quantityRange: [1, 3] },
  ],
  "cp-agrochem": [
    { name: "Nawóz potasowy do krzewów jagodowych", unit: "kg", unitNetPrice: 6.7, vatRate: 8, quantityRange: [150, 800] },
    { name: "Biopreparat ochronny GumiGuard", unit: "l", unitNetPrice: 89, vatRate: 8, quantityRange: [10, 60] },
  ],
  "cp-energia": [
    { name: "Energia elektryczna — hala produkcyjna", unit: "kWh", unitNetPrice: 0.72, vatRate: 23, quantityRange: [4000, 18000] },
    { name: "Opłata dystrybucyjna stała", unit: "mies.", unitNetPrice: 640, vatRate: 23, quantityRange: [1, 1] },
  ],
  "cp-kancelaria": [
    { name: "Obsługa księgowa — abonament miesięczny", unit: "mies.", unitNetPrice: 3200, vatRate: 23, quantityRange: [1, 1] },
    { name: "Doradztwo podatkowe — rozliczenie KSeF", unit: "godz.", unitNetPrice: 380, vatRate: 23, quantityRange: [2, 12] },
  ],
  "cp-softhouse": [
    { name: "Licencja systemu magazynowego (stanowisko)", unit: "szt.", unitNetPrice: 149, vatRate: 23, quantityRange: [5, 25] },
    { name: "Wdrożenie i szkolenie", unit: "godz.", unitNetPrice: 290, vatRate: 23, quantityRange: [4, 30] },
  ],
  "cp-adhouse": [
    { name: "Kampania Google Ads — obsługa", unit: "mies.", unitNetPrice: 4500, vatRate: 23, quantityRange: [1, 1] },
    { name: "Produkcja kreacji wideo 15 s", unit: "szt.", unitNetPrice: 1800, vatRate: 23, quantityRange: [1, 4] },
  ],
  "cp-kurier": [
    { name: "Przesyłka paletowa krajowa", unit: "szt.", unitNetPrice: 138, vatRate: 23, quantityRange: [4, 40] },
    { name: "Przesyłka paczkowa e-commerce", unit: "szt.", unitNetPrice: 13.9, vatRate: 23, quantityRange: [50, 400] },
  ],
  "cp-berrytech": [
    { name: "Serwis linii pakującej BT-900", unit: "usł.", unitNetPrice: 5400, vatRate: 0, quantityRange: [1, 2] },
    { name: "Części zamienne — zestaw uszczelek", unit: "kpl.", unitNetPrice: 890, vatRate: 0, quantityRange: [1, 5] },
  ],
};

const saleLines: LineTemplate[] = [
  { name: "Konfitura gumijagodowa 320 ml", unit: "szt.", unitNetPrice: 14.9, vatRate: 5, quantityRange: [200, 2400] },
  { name: "Żelki gumijagodowe 150 g", unit: "szt.", unitNetPrice: 7.4, vatRate: 5, quantityRange: [300, 3000] },
  { name: "Syrop gumijagodowy 500 ml", unit: "szt.", unitNetPrice: 21.5, vatRate: 5, quantityRange: [100, 1200] },
  { name: "Zestaw prezentowy „Skarby Beskidu”", unit: "kpl.", unitNetPrice: 68, vatRate: 5, quantityRange: [20, 200] },
];

const costCounterparties = [
  "cp-owoce-beskid",
  "cp-cukrownia",
  "cp-pakpol",
  "cp-chlodtrans",
  "cp-agrochem",
  "cp-energia",
  "cp-kancelaria",
  "cp-softhouse",
  "cp-adhouse",
  "cp-kurier",
  "cp-berrytech",
];

const saleCounterparties = ["cp-siecdelikatesy", "cp-cukiernia", "cp-marketwit"];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildLines(templates: LineTemplate[], count: number, idPrefix: string): InvoiceLine[] {
  // Pozycje na jednej fakturze nie powtarzają się — inaczej podgląd wygląda
  // na wygenerowany, a nie na prawdziwy dokument.
  const pool = [...templates];
  const chosen: LineTemplate[] = [];
  for (let index = 0; index < count && pool.length > 0; index += 1) {
    chosen.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }

  return chosen.map((template, index) => {
    const quantity = between(template.quantityRange[0], template.quantityRange[1]);
    const netAmount = round2(quantity * template.unitNetPrice);
    const vatAmount = round2((netAmount * template.vatRate) / 100);
    return {
      id: `${idPrefix}-l${index + 1}`,
      name: template.name,
      quantity,
      unit: template.unit,
      unitNetPrice: template.unitNetPrice,
      vatRate: template.vatRate,
      netAmount,
      vatAmount,
      grossAmount: round2(netAmount + vatAmount),
    };
  });
}

interface DocumentBlueprint {
  index: number;
  direction: "cost" | "sale";
  stage: "buffer" | "registered";
  source: InvoiceDocument["source"];
}

function buildDocument(blueprint: DocumentBlueprint): InvoiceDocument {
  const { index, direction, stage, source } = blueprint;
  const isCost = direction === "cost";
  const counterpartyId = isCost ? pick(costCounterparties) : pick(saleCounterparties);
  const counterparty = seedCounterparties.find((item) => item.id === counterpartyId)!;

  const id = `doc-${String(index).padStart(3, "0")}`;
  const lines = buildLines(isCost ? costLines[counterpartyId] : saleLines, between(1, 3), id);

  const netAmount = round2(lines.reduce((sum, line) => sum + line.netAmount, 0));
  const vatAmount = round2(lines.reduce((sum, line) => sum + line.vatAmount, 0));
  const grossAmount = round2(netAmount + vatAmount);

  const issueOffset = stage === "buffer" ? -between(0, 6) : -between(3, 150);
  const paymentTerm = pick([7, 14, 14, 21, 30, 30, 45, 60]);
  const issueDate = isoDate(issueOffset);
  const dueDate = isoDate(issueOffset + paymentTerm);

  const typeId = isCost ? "type-cost" : "type-sale";
  const numberPrefix = isCost
    ? counterpartyId.replace("cp-", "").slice(0, 3).toUpperCase()
    : "GJ";
  const number = isCost
    ? `${numberPrefix}/${String(between(1, 999)).padStart(4, "0")}/${issueDate.slice(0, 4)}`
    : `GJ/${issueDate.slice(0, 7).replace("-", "/")}/${String(index).padStart(3, "0")}`;

  const daysToDue = Math.round(
    (new Date(`${dueDate}T00:00:00`).getTime() - ANCHOR.getTime()) / 86_400_000,
  );

  let paymentStatus: InvoiceDocument["paymentStatus"] = "unpaid";
  if (stage === "registered") {
    if (daysToDue < -10) paymentStatus = random() > 0.25 ? "paid" : "unpaid";
    else if (daysToDue < 0) paymentStatus = random() > 0.55 ? "paid" : "unpaid";
    else paymentStatus = random() > 0.75 ? "paid" : "unpaid";
  }

  const attachment: InvoiceDocument["attachment"] =
    source === "ksef"
      ? { kind: "xml", filename: `${number.replace(/\//g, "_")}.xml`, size: between(4200, 11800), url: "/sample/faktura-ksef-fa2.xml" }
      : source === "upload"
        ? { kind: "pdf", filename: `${number.replace(/\//g, "_")}.pdf`, size: between(48_000, 320_000), url: "/sample/faktura-przyklad.pdf" }
        : null;

  const categoryId = counterparty.defaultCategoryId;

  return {
    id,
    number,
    typeId,
    counterpartyId,
    issueDate,
    saleDate: issueDate,
    dueDate,
    netAmount,
    vatAmount,
    grossAmount,
    currency: counterpartyId === "cp-berrytech" ? "EUR" : "PLN",
    paymentAccount: counterparty.bankAccount,
    categoryId,
    categoryAutoAssigned: categoryId !== null,
    source,
    ksefNumber:
      source === "ksef"
        ? `${counterparty.nip}-${issueDate.replace(/-/g, "")}-${String(between(100000, 999999))}${String(between(10, 99))}-${between(10, 99)}`
        : null,
    stage,
    bufferDecision: stage === "buffer" ? "pending" : "accepted",
    paymentStatus,
    attachment,
    lines,
    notes: null,
    receivedAt: isoDateTime(issueOffset, between(1, 21), between(0, 59)),
    registeredAt: stage === "registered" ? isoDateTime(issueOffset + 1, between(8, 17), between(0, 59)) : null,
  };
}

function buildDocuments(): InvoiceDocument[] {
  const blueprints: DocumentBlueprint[] = [];
  let index = 1;

  // Rejestr: mieszanka źródeł, przewaga kosztowych (tak wygląda realny obieg).
  for (let i = 0; i < 34; i += 1) {
    blueprints.push({
      index: index++,
      direction: random() > 0.34 ? "cost" : "sale",
      stage: "registered",
      source: random() > 0.35 ? "ksef" : random() > 0.4 ? "upload" : "manual",
    });
  }

  // Bufor: świeże pobrania z KSeF i kilka wgranych plików czekających na akceptację.
  for (let i = 0; i < 9; i += 1) {
    blueprints.push({
      index: index++,
      direction: random() > 0.3 ? "cost" : "sale",
      stage: "buffer",
      source: random() > 0.28 ? "ksef" : "upload",
    });
  }

  const documents = blueprints.map(buildDocument);

  // Jeden dokument ręczny bez pliku — pokazuje spójny podgląd „bez źródła”.
  documents.push({
    ...buildDocument({ index: index++, direction: "cost", stage: "registered", source: "manual" }),
    id: "doc-manual-demo",
    number: "PAR/2026/0142",
    typeId: "type-debit-note",
    counterpartyId: "cp-berrytech",
    notes: "Dokument papierowy z serwisu zagranicznego, wprowadzony ręcznie. Oryginał w segregatorze A-12.",
    attachment: null,
    source: "manual",
    ksefNumber: null,
    categoryId: null,
    categoryAutoAssigned: false,
    currency: "EUR",
  });

  return documents;
}

export const seedDocuments: InvoiceDocument[] = buildDocuments();

/* -------------------------------- KSeF ------------------------------------ */

export const seedSchedule: KsefSchedule = {
  enabled: true,
  times: ["01:00", "07:30", "13:00", "19:30"],
  scope: "both",
  lookbackDays: 3,
  simulateFailure: false,
};

export const seedKsefRuns: KsefRun[] = [
  {
    id: "run-1",
    startedAt: isoDateTime(0, 7, 30),
    trigger: "schedule",
    scope: "both",
    dateFrom: isoDate(-3),
    dateTo: isoDate(0),
    status: "success",
    fetched: 6,
    imported: 4,
    duplicates: 2,
    message: null,
  },
  {
    id: "run-2",
    startedAt: isoDateTime(0, 1, 0),
    trigger: "schedule",
    scope: "both",
    dateFrom: isoDate(-3),
    dateTo: isoDate(0),
    status: "success",
    fetched: 3,
    imported: 3,
    duplicates: 0,
    message: null,
  },
  {
    id: "run-3",
    startedAt: isoDateTime(-1, 19, 30),
    trigger: "schedule",
    scope: "purchase",
    dateFrom: isoDate(-4),
    dateTo: isoDate(-1),
    status: "error",
    fetched: 0,
    imported: 0,
    duplicates: 0,
    message: "KSeF: przekroczono czas oczekiwania na sesję (HTTP 504). Ponowiono o 20:00 — bez utraty danych.",
  },
  {
    id: "run-4",
    startedAt: isoDateTime(-1, 13, 0),
    trigger: "manual",
    scope: "sale",
    dateFrom: isoDate(-30),
    dateTo: isoDate(-1),
    status: "partial",
    fetched: 12,
    imported: 2,
    duplicates: 10,
    message: "10 faktur pominięto — już istnieją w rejestrze (numer + NIP).",
  },
];
