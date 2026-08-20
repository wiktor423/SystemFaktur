"use client";

/**
 * Warstwa danych aplikacji po stronie przeglądarki.
 *
 * Trzyma wyłącznie dane słownikowe (kategorie, typy, kontrahenci, ustawienia)
 * oraz agregaty potrzebne widokom zbiorczym. Lista dokumentów **nie** jest tu
 * przechowywana — pobiera ją `useDocumentQuery` prosto z API, z filtrami
 * i stronicowaniem wykonywanymi przez bazę. To celowa zmiana względem wersji
 * na mockach: rejestr ma rosnąć, a trzymanie całej ewidencji w pamięci
 * przeglądarki przestaje działać przy pierwszym większym kliencie.
 *
 * Każda mutacja jest asynchroniczna i po powodzeniu odświeża dane słownikowe
 * oraz podbija `documentsVersion`, na który reagują aktywne listy.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_COLUMNS } from "@/lib/data/columns";
import { api, ApiError, toQuery } from "@/lib/data/api";
import type { UsageMap } from "@/lib/data/queries";
import type {
  Category,
  ColumnConfig,
  Counterparty,
  DocumentFilters,
  DocumentType,
  InvoiceDocument,
  KsefFetchScope,
  KsefRun,
  KsefSchedule,
  SortState,
} from "@/lib/domain/types";
import type { RegisterStats } from "@/lib/data/queries";

/* ---------------------------------- Stan ---------------------------------- */

export interface AppUsage {
  /** Pozycje oczekujące w buforze — liczba na plakietce w nawigacji. */
  bufferCount: number;
  uncategorized: number;
  byCategory: UsageMap;
  byCounterparty: UsageMap;
  byType: UsageMap;
}

export interface AppState {
  categories: Category[];
  counterparties: Counterparty[];
  documentTypes: DocumentType[];
  schedule: KsefSchedule;
  ksefRuns: KsefRun[];
  columns: ColumnConfig[];
  usage: AppUsage;
}

const EMPTY_SCHEDULE: KsefSchedule = { enabled: false, times: [], scope: "both", lookbackDays: 7, simulateFailure: false };

const EMPTY_STATE: AppState = {
  categories: [],
  counterparties: [],
  documentTypes: [],
  schedule: EMPTY_SCHEDULE,
  ksefRuns: [],
  columns: DEFAULT_COLUMNS,
  usage: { bufferCount: 0, uncategorized: 0, byCategory: new Map(), byCounterparty: new Map(), byType: new Map() },
};

/* ------------------------------- Kontrakt API ------------------------------ */

interface UsageEntry {
  id: string;
  count: number;
  amount: number;
}

interface BootstrapResponse {
  categories: Category[];
  documentTypes: DocumentType[];
  counterparties: Counterparty[];
  schedule: KsefSchedule | null;
  ksefRuns: KsefRun[];
  columns: ColumnConfig[];
  usage: {
    bufferCount: number;
    uncategorized: number;
    byCategory: UsageEntry[];
    byCounterparty: UsageEntry[];
    byType: UsageEntry[];
  };
}

const toUsageMap = (entries: UsageEntry[]): UsageMap =>
  new Map(entries.map((entry) => [entry.id, { count: entry.count, amount: entry.amount }]));

/* ------------------------------- Wyniki operacji --------------------------- */

export interface ImportSummary {
  fetched: number;
  imported: number;
  duplicates: number;
  createdCounterparties: number;
}

export interface OperationResult<T = void> {
  ok: boolean;
  message: string;
  /** Błędy przypisane do pól — formularz podświetla właściwe wejście. */
  fields?: Record<string, string>;
  data?: T;
}

export interface UploadResult {
  filename: string;
  ok: boolean;
  message: string;
  documentId: string | null;
}

export type DocumentDraft = Omit<
  InvoiceDocument,
  "id" | "receivedAt" | "registeredAt" | "bufferDecision" | "categoryAutoAssigned"
> & { id?: string };

/** Zamienia wyjątek z API na wynik operacji, który UI potrafi pokazać. */
async function attempt<T>(action: () => Promise<T>, successMessage: string): Promise<OperationResult<T>> {
  try {
    const data = await action();
    return { ok: true, message: successMessage, data };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, message: error.message, fields: error.fields };
    }
    console.error(error);
    return { ok: false, message: "Operacja nie powiodła się." };
  }
}

/* -------------------------------- Kontekst -------------------------------- */

interface AppDataValue {
  state: AppState;
  /** `false` dopóki trwa pierwsze pobranie danych słownikowych. */
  ready: boolean;
  /** Komunikat, gdy aplikacja nie zdołała wystartować (np. baza niedostępna). */
  error: string | null;
  /** Rośnie po każdej zmianie dokumentów — sygnał do odświeżenia list. */
  documentsVersion: number;
  refresh: () => Promise<void>;

  addDocument: (draft: DocumentDraft, stage?: "buffer" | "registered") => Promise<OperationResult<InvoiceDocument>>;
  updateDocument: (id: string, draft: DocumentDraft) => Promise<OperationResult<InvoiceDocument>>;
  deleteDocuments: (ids: string[]) => Promise<OperationResult>;
  acceptFromBuffer: (ids: string[]) => Promise<OperationResult>;
  rejectFromBuffer: (ids: string[]) => Promise<OperationResult>;

  importFromKsef: (params: {
    dateFrom: string;
    dateTo: string;
    scope: KsefFetchScope;
    trigger?: "manual" | "schedule";
  }) => Promise<OperationResult<ImportSummary>>;
  uploadFiles: (files: File[], target: "buffer" | "registered") => Promise<UploadResult[]>;

  upsertCounterparty: (counterparty: Counterparty) => Promise<OperationResult<Counterparty>>;
  addCategory: (name: string, parentId: string | null) => Promise<OperationResult<Category>>;
  updateCategory: (id: string, patch: Partial<Category>) => Promise<OperationResult<Category>>;
  deleteCategory: (id: string) => Promise<OperationResult>;
  addDocumentType: (input: Omit<DocumentType, "id" | "isSystem">) => Promise<OperationResult<DocumentType>>;
  updateDocumentType: (id: string, patch: Partial<DocumentType>) => Promise<OperationResult<DocumentType>>;
  deleteDocumentType: (id: string) => Promise<OperationResult>;
  updateSchedule: (patch: Partial<KsefSchedule>) => Promise<OperationResult>;
  setColumns: (columns: ColumnConfig[]) => Promise<OperationResult>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentsVersion, setDocumentsVersion] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<BootstrapResponse>("/api/bootstrap");
      setState({
        categories: data.categories,
        counterparties: data.counterparties,
        documentTypes: data.documentTypes,
        schedule: data.schedule ?? EMPTY_SCHEDULE,
        ksefRuns: data.ksefRuns,
        columns: data.columns.length ? data.columns : DEFAULT_COLUMNS,
        usage: {
          bufferCount: data.usage.bufferCount,
          uncategorized: data.usage.uncategorized,
          byCategory: toUsageMap(data.usage.byCategory),
          byCounterparty: toUsageMap(data.usage.byCounterparty),
          byType: toUsageMap(data.usage.byType),
        },
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Nie udało się wczytać danych aplikacji.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Po zmianie dokumentów odświeża słowniki (liczniki) i budzi listy. */
  const invalidate = useCallback(async () => {
    setDocumentsVersion((version) => version + 1);
    await refresh();
  }, [refresh]);

  const toPayload = (draft: DocumentDraft) => ({
    number: draft.number,
    typeId: draft.typeId,
    counterpartyId: draft.counterpartyId,
    issueDate: draft.issueDate,
    saleDate: draft.saleDate,
    dueDate: draft.dueDate,
    netAmount: draft.netAmount,
    vatAmount: draft.vatAmount,
    grossAmount: draft.grossAmount,
    currency: draft.currency,
    paymentAccount: draft.paymentAccount,
    categoryId: draft.categoryId,
    notes: draft.notes,
    // Identyfikatory pozycji nadaje baza przy zapisie.
    lines: draft.lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      unitNetPrice: line.unitNetPrice,
      vatRate: line.vatRate,
      netAmount: line.netAmount,
      vatAmount: line.vatAmount,
      grossAmount: line.grossAmount,
    })),
  });

  const value = useMemo<AppDataValue>(() => {
    const withInvalidate = async <T,>(result: OperationResult<T>): Promise<OperationResult<T>> => {
      if (result.ok) await invalidate();
      return result;
    };

    return {
      state,
      ready,
      error,
      documentsVersion,
      refresh,

      addDocument: async (draft, stage = "registered") =>
        withInvalidate(
          await attempt(
            () => api.post<InvoiceDocument>("/api/documents", { ...toPayload(draft), source: draft.source, stage }),
            stage === "buffer" ? "Dokument trafił do bufora." : "Dokument zapisany w rejestrze.",
          ),
        ),

      updateDocument: async (id, draft) =>
        withInvalidate(
          await attempt(
            () => api.patch<InvoiceDocument>(`/api/documents/${id}`, toPayload(draft)),
            "Zmiany zapisane.",
          ),
        ),

      deleteDocuments: async (ids) =>
        withInvalidate(
          await attempt(async () => {
            await Promise.all(ids.map((id) => api.delete(`/api/documents/${id}`)));
          }, `Usunięto dokumentów: ${ids.length}.`),
        ),

      acceptFromBuffer: async (ids) => {
        const result = await attempt(
          () => api.post<{ accepted: number; message: string }>("/api/buffer/accept", { ids }),
          "",
        );
        return withInvalidate({ ok: result.ok, message: result.data?.message ?? result.message, fields: result.fields });
      },

      rejectFromBuffer: async (ids) => {
        const result = await attempt(
          () => api.post<{ rejected: number; message: string }>("/api/buffer/reject", { ids }),
          "",
        );
        return withInvalidate({ ok: result.ok, message: result.data?.message ?? result.message, fields: result.fields });
      },

      importFromKsef: async ({ dateFrom, dateTo, scope, trigger = "manual" }) => {
        const result = await attempt(
          () =>
            api.post<{ summary: ImportSummary; message: string }>("/api/ksef/import", {
              dateFrom,
              dateTo,
              scope,
              trigger,
            }),
          "",
        );
        await invalidate();
        return {
          ok: result.ok,
          message: result.data?.message ?? result.message,
          data: result.data?.summary,
        };
      },

      uploadFiles: async (files, target) => {
        const form = new FormData();
        form.set("target", target);
        for (const file of files) form.append("files", file);

        try {
          const response = await api.post<{ results: UploadResult[] }>("/api/upload", form);
          await invalidate();
          return response.results;
        } catch (cause) {
          const message = cause instanceof ApiError ? cause.message : "Wgrywanie nie powiodło się.";
          return files.map((file) => ({ filename: file.name, ok: false, message, documentId: null }));
        }
      },

      upsertCounterparty: async (counterparty) => {
        const payload = {
          name: counterparty.name,
          nip: counterparty.nip,
          street: counterparty.address.street || null,
          postalCode: counterparty.address.postalCode || null,
          city: counterparty.address.city || null,
          country: counterparty.address.country || "PL",
          bankAccount: counterparty.bankAccount,
          defaultCategoryId: counterparty.defaultCategoryId,
        };
        return withInvalidate(
          await attempt(
            () =>
              counterparty.id
                ? api.patch<Counterparty>(`/api/counterparties/${counterparty.id}`, payload)
                : api.post<Counterparty>("/api/counterparties", payload),
            "Kartoteka kontrahenta zapisana.",
          ),
        );
      },

      addCategory: async (name, parentId) =>
        withInvalidate(
          await attempt(
            () => api.post<Category>("/api/categories", { name: name.trim(), parentId, color: null }),
            "Kategoria dodana.",
          ),
        ),

      updateCategory: async (id, patch) => {
        const current = state.categories.find((category) => category.id === id);
        return withInvalidate(
          await attempt(
            () =>
              api.patch<Category>(`/api/categories/${id}`, {
                name: patch.name ?? current?.name ?? "",
                parentId: patch.parentId !== undefined ? patch.parentId : (current?.parentId ?? null),
                color: patch.color !== undefined ? patch.color : (current?.color ?? null),
              }),
            "Kategoria zaktualizowana.",
          ),
        );
      },

      deleteCategory: async (id) => {
        const result = await attempt(
          () => api.delete<{ message: string }>(`/api/categories/${id}`),
          "Kategoria usunięta.",
        );
        return withInvalidate({ ok: result.ok, message: result.data?.message ?? result.message, fields: result.fields });
      },

      addDocumentType: async (input) =>
        withInvalidate(await attempt(() => api.post<DocumentType>("/api/document-types", input), "Typ dokumentu dodany.")),

      updateDocumentType: async (id, patch) => {
        const current = state.documentTypes.find((type) => type.id === id);
        return withInvalidate(
          await attempt(
            () =>
              api.patch<DocumentType>(`/api/document-types/${id}`, {
                name: patch.name ?? current?.name ?? "",
                shortName: patch.shortName ?? current?.shortName ?? "",
                direction: patch.direction ?? current?.direction ?? "payable",
              }),
            "Typ dokumentu zaktualizowany.",
          ),
        );
      },

      deleteDocumentType: async (id) =>
        withInvalidate(await attempt(() => api.delete(`/api/document-types/${id}`), "Typ dokumentu usunięty.")),

      updateSchedule: async (patch) => {
        const next = { ...state.schedule, ...patch };
        return withInvalidate(await attempt(() => api.put("/api/ksef/schedule", next), "Harmonogram zapisany."));
      },

      setColumns: async (columns) => {
        // Zmiana kolumn jest czysto prezentacyjna — pokazujemy ją natychmiast,
        // a zapis leci w tle. Czekanie na serwer przy każdym kliknięciu
        // w checkbox byłoby zauważalnie ospałe.
        setState((previous) => ({ ...previous, columns }));
        return attempt(() => api.put("/api/columns", { columns }), "Układ kolumn zapisany.");
      },
    };
  }, [state, ready, error, documentsVersion, refresh, invalidate]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const context = useContext(AppDataContext);
  if (!context) throw new Error("useAppData musi być użyty wewnątrz <AppDataProvider>.");
  return context;
}

/* --------------------------- Zapytanie o dokumenty ------------------------- */

export interface DocumentQueryInput {
  filters: DocumentFilters;
  sort: SortState;
  page: number;
  pageSize: number;
  stage?: "buffer" | "registered";
}

export interface DocumentQueryResult {
  documents: InvoiceDocument[];
  total: number;
  stats: RegisterStats;
  loading: boolean;
  error: string | null;
}

const EMPTY_STATS: RegisterStats = {
  payableOpen: 0,
  payableOverdue: 0,
  receivableOpen: 0,
  receivableOverdue: 0,
  overdueCount: 0,
  dueThisWeekCount: 0,
  documentCount: 0,
};

/**
 * Pobiera stronę dokumentów spełniających filtry.
 *
 * Filtruje, sortuje i stronicuje baza — przeglądarka dostaje tylko to, co
 * faktycznie wyświetla. Podsumowanie w `stats` dotyczy natomiast całego
 * wyniku filtrowania, żeby kafelki nad tabelą nie zmieniały się przy
 * przechodzeniu między stronami.
 */
export function useDocumentQuery(input: DocumentQueryInput): DocumentQueryResult {
  const { documentsVersion } = useAppData();
  const [result, setResult] = useState<{ documents: InvoiceDocument[]; total: number; stats: RegisterStats }>({
    documents: [],
    total: 0,
    stats: EMPTY_STATS,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { filters, sort, page, pageSize, stage } = input;
  const query = useMemo(
    () =>
      toQuery({
        search: filters.search,
        typeIds: filters.typeIds,
        counterpartyIds: filters.counterpartyIds,
        categoryIds: filters.categoryIds,
        sources: filters.sources,
        paymentStatuses: filters.paymentStatuses,
        issueDateFrom: filters.issueDateFrom,
        issueDateTo: filters.issueDateTo,
        dueDateFrom: filters.dueDateFrom,
        dueDateTo: filters.dueDateTo,
        stage,
        sortKey: sort.key,
        sortDirection: sort.direction,
        page,
        pageSize,
      }),
    [filters, sort, page, pageSize, stage],
  );

  // Odpowiedź na nieaktualne zapytanie musi zostać odrzucona — przy szybkim
  // pisaniu w wyszukiwarce starsze żądanie potrafi wrócić po nowszym
  // i podmienić wynik na nieaktualny.
  const latestQuery = useRef(0);

  useEffect(() => {
    const token = ++latestQuery.current;
    let cancelled = false;
    setLoading(true);

    api
      .get<{ documents: InvoiceDocument[]; total: number; stats: RegisterStats }>(`/api/documents${query}`)
      .then((data) => {
        if (cancelled || token !== latestQuery.current) return;
        setResult({ documents: data.documents, total: data.total, stats: data.stats });
        setError(null);
      })
      .catch((cause) => {
        if (cancelled || token !== latestQuery.current) return;
        setError(cause instanceof ApiError ? cause.message : "Nie udało się pobrać dokumentów.");
      })
      .finally(() => {
        if (!cancelled && token === latestQuery.current) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, documentsVersion]);

  return { ...result, loading, error };
}
