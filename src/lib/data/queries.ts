import type {
  Category,
  Counterparty,
  DocumentColumnKey,
  DocumentFilters,
  DocumentType,
  InvoiceDocument,
  SortState,
} from "@/lib/domain/types";
import { daysUntil, formatDate } from "@/lib/format";
import { documentDedupKey } from "@/lib/domain/validation";

/**
 * Czyste funkcje odczytu: filtrowanie, sortowanie, agregacje i budowa drzewa
 * kategorii. Komponenty React tylko je wywołują — nie zawierają własnej logiki
 * biznesowej. Dzięki temu ten sam kod pokryjemy testami jednostkowymi i
 * przeniesiemy na serwer (SQL / Prisma) bez zmiany semantyki.
 */

export const emptyFilters: DocumentFilters = {
  search: "",
  typeIds: [],
  counterpartyIds: [],
  categoryIds: [],
  sources: [],
  paymentStatuses: [],
  issueDateFrom: null,
  issueDateTo: null,
  dueDateFrom: null,
  dueDateTo: null,
};

export function countActiveFilters(filters: DocumentFilters): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  count += filters.typeIds.length ? 1 : 0;
  count += filters.counterpartyIds.length ? 1 : 0;
  count += filters.categoryIds.length ? 1 : 0;
  count += filters.sources.length ? 1 : 0;
  count += filters.paymentStatuses.length ? 1 : 0;
  if (filters.issueDateFrom || filters.issueDateTo) count += 1;
  if (filters.dueDateFrom || filters.dueDateTo) count += 1;
  return count;
}

export interface LookupTables {
  counterpartiesById: Map<string, Counterparty>;
  categoriesById: Map<string, Category>;
  typesById: Map<string, DocumentType>;
}

export function buildLookups(
  counterparties: Counterparty[],
  categories: Category[],
  types: DocumentType[],
): LookupTables {
  return {
    counterpartiesById: new Map(counterparties.map((item) => [item.id, item])),
    categoriesById: new Map(categories.map((item) => [item.id, item])),
    typesById: new Map(types.map((item) => [item.id, item])),
  };
}

/** Zbiera identyfikatory kategorii wraz z całym poddrzewem. */
export function categoryWithDescendants(categories: Category[], rootId: string): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const siblings = childrenByParent.get(category.parentId) ?? [];
    siblings.push(category.id);
    childrenByParent.set(category.parentId, siblings);
  }

  const result: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    queue.push(...(childrenByParent.get(current) ?? []));
  }
  return result;
}

export function filterDocuments(
  documents: InvoiceDocument[],
  filters: DocumentFilters,
  lookups: LookupTables,
  categories: Category[],
): InvoiceDocument[] {
  const search = filters.search.trim().toLowerCase();

  // Filtr po kategorii obejmuje podkategorie — inaczej filtrowanie po gałęzi
  // „Surowce” nie pokazywałoby faktur przypisanych do „Opakowania”.
  const categoryScope =
    filters.categoryIds.length > 0
      ? new Set(filters.categoryIds.flatMap((id) => categoryWithDescendants(categories, id)))
      : null;

  return documents.filter((document) => {
    if (filters.typeIds.length > 0 && !filters.typeIds.includes(document.typeId)) return false;
    if (filters.counterpartyIds.length > 0 && !filters.counterpartyIds.includes(document.counterpartyId)) return false;
    if (categoryScope && (!document.categoryId || !categoryScope.has(document.categoryId))) return false;
    if (filters.sources.length > 0 && !filters.sources.includes(document.source)) return false;
    if (filters.paymentStatuses.length > 0 && !filters.paymentStatuses.includes(document.paymentStatus)) return false;

    if (filters.issueDateFrom && document.issueDate < filters.issueDateFrom) return false;
    if (filters.issueDateTo && document.issueDate > filters.issueDateTo) return false;
    if (filters.dueDateFrom && document.dueDate < filters.dueDateFrom) return false;
    if (filters.dueDateTo && document.dueDate > filters.dueDateTo) return false;

    if (search) {
      const counterparty = lookups.counterpartiesById.get(document.counterpartyId);
      const haystack = [
        document.number,
        document.ksefNumber ?? "",
        counterparty?.name ?? "",
        counterparty?.nip ?? "",
        document.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

/** Wartość, po której sortujemy daną kolumnę. */
function sortValue(
  document: InvoiceDocument,
  key: DocumentColumnKey,
  lookups: LookupTables,
): string | number {
  switch (key) {
    case "number":
      return document.number.toLowerCase();
    case "type":
      return lookups.typesById.get(document.typeId)?.name.toLowerCase() ?? "";
    case "counterparty":
      return lookups.counterpartiesById.get(document.counterpartyId)?.name.toLowerCase() ?? "";
    case "nip":
      return lookups.counterpartiesById.get(document.counterpartyId)?.nip ?? "";
    case "issueDate":
      return document.issueDate;
    case "dueDate":
      return document.dueDate;
    case "netAmount":
      return document.netAmount;
    case "vatAmount":
      return document.vatAmount;
    case "grossAmount":
      return document.grossAmount;
    case "category":
      return document.categoryId ? (lookups.categoriesById.get(document.categoryId)?.name.toLowerCase() ?? "") : "";
    case "source":
      return document.source;
    case "paymentAccount":
      return document.paymentAccount ?? "";
    case "ksefNumber":
      return document.ksefNumber ?? "";
    case "paymentStatus":
      return document.paymentStatus;
    default:
      return "";
  }
}

export function sortDocuments(
  documents: InvoiceDocument[],
  sort: SortState,
  lookups: LookupTables,
): InvoiceDocument[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...documents].sort((left, right) => {
    const a = sortValue(left, sort.key, lookups);
    const b = sortValue(right, sort.key, lookups);
    if (a < b) return -1 * factor;
    if (a > b) return 1 * factor;
    // Stabilizacja: przy równych wartościach porządkuje numer dokumentu.
    return left.number.localeCompare(right.number, "pl");
  });
}

export interface RegisterStats {
  payableOpen: number;
  payableOverdue: number;
  receivableOpen: number;
  receivableOverdue: number;
  overdueCount: number;
  dueThisWeekCount: number;
  documentCount: number;
}

export function computeStats(
  documents: InvoiceDocument[],
  types: DocumentType[],
  today = new Date(),
): RegisterStats {
  const directionByType = new Map(types.map((type) => [type.id, type.direction]));
  const stats: RegisterStats = {
    payableOpen: 0,
    payableOverdue: 0,
    receivableOpen: 0,
    receivableOverdue: 0,
    overdueCount: 0,
    dueThisWeekCount: 0,
    documentCount: documents.length,
  };

  for (const document of documents) {
    if (document.paymentStatus === "paid") continue;
    const direction = directionByType.get(document.typeId) ?? "payable";
    const days = daysUntil(document.dueDate, today);
    const overdue = days < 0;

    if (direction === "payable") {
      stats.payableOpen += document.grossAmount;
      if (overdue) stats.payableOverdue += document.grossAmount;
    } else {
      stats.receivableOpen += document.grossAmount;
      if (overdue) stats.receivableOverdue += document.grossAmount;
    }

    if (overdue) stats.overdueCount += 1;
    else if (days <= 7) stats.dueThisWeekCount += 1;
  }

  return stats;
}

/* ------------------------------ Drzewo kategorii --------------------------- */

export interface CategoryNode extends Category {
  children: CategoryNode[];
  depth: number;
  /** Liczba dokumentów przypisanych bezpośrednio do tej kategorii. */
  directCount: number;
  /** Liczba dokumentów w kategorii i całym poddrzewie. */
  totalCount: number;
  /** Kwota brutto dokumentów w kategorii i poddrzewie (PLN). */
  totalAmount: number;
}

/** Ile dokumentow i na jaka kwote wisi bezposrednio pod danym identyfikatorem. */
export type UsageMap = Map<string, { count: number; amount: number }>;

/**
 * Zliczenie uzycia z listy dokumentow. Zostaje jako czysta funkcja, bo na niej
 * opieraja sie testy drzewa kategorii — na produkcji te same liczby przychodzą
 * gotowe z agregatu bazy, zeby nie sciagac calego rejestru do przegladarki.
 */
export function categoryUsageFromDocuments(documents: InvoiceDocument[]): UsageMap {
  const usage: UsageMap = new Map();
  for (const document of documents) {
    if (!document.categoryId) continue;
    const entry = usage.get(document.categoryId) ?? { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += document.currency === "PLN" ? document.grossAmount : 0;
    usage.set(document.categoryId, entry);
  }
  return usage;
}

export function buildCategoryTree(categories: Category[], usage: UsageMap): CategoryNode[] {
  const countByCategory = usage;

  const nodesById = new Map<string, CategoryNode>(
    categories.map((category) => {
      const entry = countByCategory.get(category.id);
      return [
        category.id,
        {
          ...category,
          children: [],
          depth: 0,
          directCount: entry?.count ?? 0,
          totalCount: entry?.count ?? 0,
          totalAmount: entry?.amount ?? 0,
        },
      ];
    }),
  );

  const roots: CategoryNode[] = [];
  for (const node of nodesById.values()) {
    if (node.parentId && nodesById.has(node.parentId)) {
      nodesById.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const assignDepthAndTotals = (node: CategoryNode, depth: number): { count: number; amount: number } => {
    node.depth = depth;
    let count = node.directCount;
    let amount = node.totalAmount;
    for (const child of node.children) {
      const childTotals = assignDepthAndTotals(child, depth + 1);
      count += childTotals.count;
      amount += childTotals.amount;
    }
    node.totalCount = count;
    node.totalAmount = amount;
    return { count, amount };
  };

  roots.forEach((root) => assignDepthAndTotals(root, 0));
  const byName = (a: CategoryNode, b: CategoryNode) => a.name.localeCompare(b.name, "pl");
  const sortRecursively = (nodes: CategoryNode[]) => {
    nodes.sort(byName);
    nodes.forEach((node) => sortRecursively(node.children));
  };
  sortRecursively(roots);

  return roots;
}

/** Spłaszcza drzewo do listy z zachowaniem kolejności i wcięć. */
export function flattenCategoryTree(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenCategoryTree(node.children)]);
}

/** Ścieżka kategorii, np. „Surowce i produkcja / Opakowania”. */
export function categoryPath(categories: Category[], categoryId: string | null): string {
  if (!categoryId) return "—";
  const byId = new Map(categories.map((category) => [category.id, category]));
  const segments: string[] = [];
  let current = byId.get(categoryId);
  let guard = 0;
  while (current && guard < 16) {
    segments.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
    guard += 1;
  }
  return segments.join(" / ");
}

/* ------------------------------- Duplikaty --------------------------------- */

export interface DuplicateCheck {
  isDuplicate: boolean;
  /** Dokument, z którym wykryto kolizję (jeśli jest). */
  existing: InvoiceDocument | null;
  reason: "ksef-number" | "number-and-nip" | null;
}

/**
 * Deduplikacja obowiązuje wspólnie dla rejestru i bufora: dokument nie może
 * powstać dwukrotnie ani przez import z KSeF, ani przez upload, ani ręcznie.
 * Numer KSeF jest kluczem mocniejszym; dla pozostałych źródeł działa para
 * numer faktury + NIP kontrahenta.
 */
export function findDuplicate(
  documents: InvoiceDocument[],
  candidate: { number: string; ksefNumber: string | null; counterpartyNip: string },
  counterparties: Counterparty[],
  ignoreDocumentId?: string,
): DuplicateCheck {
  const nipById = new Map(counterparties.map((item) => [item.id, item.nip]));

  if (candidate.ksefNumber) {
    const existing = documents.find(
      (document) => document.id !== ignoreDocumentId && document.ksefNumber === candidate.ksefNumber,
    );
    if (existing) return { isDuplicate: true, existing, reason: "ksef-number" };
  }

  const key = documentDedupKey(candidate.number, candidate.counterpartyNip);
  const existing = documents.find((document) => {
    if (document.id === ignoreDocumentId) return false;
    const nip = nipById.get(document.counterpartyId) ?? "";
    return documentDedupKey(document.number, nip) === key;
  });

  if (existing) return { isDuplicate: true, existing, reason: "number-and-nip" };
  return { isDuplicate: false, existing: null, reason: null };
}

/** Krótki opis zakresu dat do nagłówków i historii pobrań. */
export function describeDateRange(from: string, to: string): string {
  return `${formatDate(from)} – ${formatDate(to)}`;
}
