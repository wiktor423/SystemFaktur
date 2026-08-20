"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Category,
  ColumnConfig,
  Counterparty,
  DocumentType,
  InvoiceDocument,
  KsefFetchScope,
  KsefRun,
  KsefSchedule,
} from "@/lib/domain/types";
import {
  seedCategories,
  seedCounterparties,
  seedDocumentTypes,
  seedDocuments,
  seedKsefRuns,
  seedSchedule,
} from "@/lib/data/seed";
import { findDuplicate } from "@/lib/data/queries";
import { getKsefClient } from "@/lib/ksef/mock-client";
import { KsefError, type KsefInvoice } from "@/lib/ksef/client";
import { parseFa2, Fa2ParseError } from "@/lib/ksef/fa2";
import { DEFAULT_COLUMNS } from "@/lib/data/columns";

/**
 * Warstwa danych aplikacji.
 *
 * TYMCZASOWA IMPLEMENTACJA: stan trzymany w pamięci przeglądarki (+ localStorage),
 * zasilany danymi demonstracyjnymi. Interfejs `useAppData()` jest jednak celowo
 * asynchroniczny i „transakcyjny” (operacje zwracają wynik z informacją o
 * duplikatach i błędach), żeby podmiana na wywołania API / server actions nie
 * wymagała zmian w komponentach.
 *
 * Zasada: żaden komponent nie modyfikuje danych bezpośrednio — wyłącznie przez
 * akcje udostępnione tutaj.
 */

const STORAGE_KEY = "gumijagoda.faktury.v1";

export interface AppState {
  documents: InvoiceDocument[];
  counterparties: Counterparty[];
  categories: Category[];
  documentTypes: DocumentType[];
  schedule: KsefSchedule;
  ksefRuns: KsefRun[];
  columns: ColumnConfig[];
  /** Przełącznik demonstracyjny: wymusza błąd integracji z KSeF. */
  simulateKsefFailure: boolean;
}

function initialState(): AppState {
  return {
    documents: seedDocuments,
    counterparties: seedCounterparties,
    categories: seedCategories,
    documentTypes: seedDocumentTypes,
    schedule: seedSchedule,
    ksefRuns: seedKsefRuns,
    columns: DEFAULT_COLUMNS,
    simulateKsefFailure: false,
  };
}

type Action =
  | { type: "hydrate"; state: AppState }
  | { type: "reset" }
  | { type: "documents/add"; document: InvoiceDocument }
  | { type: "documents/addMany"; documents: InvoiceDocument[] }
  | { type: "documents/update"; id: string; patch: Partial<InvoiceDocument> }
  | { type: "documents/delete"; ids: string[] }
  | { type: "documents/accept"; ids: string[]; timestamp: string }
  | { type: "documents/reject"; ids: string[] }
  | { type: "counterparties/upsert"; counterparty: Counterparty }
  | { type: "categories/add"; category: Category }
  | { type: "categories/update"; id: string; patch: Partial<Category> }
  | { type: "categories/delete"; id: string }
  | { type: "types/add"; documentType: DocumentType }
  | { type: "types/update"; id: string; patch: Partial<DocumentType> }
  | { type: "types/delete"; id: string }
  | { type: "schedule/update"; patch: Partial<KsefSchedule> }
  | { type: "ksef/addRun"; run: KsefRun }
  | { type: "columns/set"; columns: ColumnConfig[] }
  | { type: "settings/simulateFailure"; value: boolean };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return action.state;

    case "reset":
      return initialState();

    case "documents/add":
      return { ...state, documents: [action.document, ...state.documents] };

    case "documents/addMany":
      return { ...state, documents: [...action.documents, ...state.documents] };

    case "documents/update":
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === action.id ? { ...document, ...action.patch } : document,
        ),
      };

    case "documents/delete": {
      const ids = new Set(action.ids);
      return { ...state, documents: state.documents.filter((document) => !ids.has(document.id)) };
    }

    case "documents/accept": {
      const ids = new Set(action.ids);
      return {
        ...state,
        documents: state.documents.map((document) =>
          ids.has(document.id)
            ? {
                ...document,
                stage: "registered",
                bufferDecision: "accepted",
                registeredAt: action.timestamp,
              }
            : document,
        ),
      };
    }

    case "documents/reject": {
      const ids = new Set(action.ids);
      return { ...state, documents: state.documents.filter((document) => !ids.has(document.id)) };
    }

    case "counterparties/upsert": {
      const exists = state.counterparties.some((item) => item.id === action.counterparty.id);
      return {
        ...state,
        counterparties: exists
          ? state.counterparties.map((item) => (item.id === action.counterparty.id ? action.counterparty : item))
          : [...state.counterparties, action.counterparty],
      };
    }

    case "categories/add":
      return { ...state, categories: [...state.categories, action.category] };

    case "categories/update":
      return {
        ...state,
        categories: state.categories.map((category) =>
          category.id === action.id ? { ...category, ...action.patch } : category,
        ),
      };

    case "categories/delete": {
      // Usunięcie gałęzi podnosi podkategorie o poziom wyżej i odpina dokumenty.
      const removed = state.categories.find((category) => category.id === action.id);
      if (!removed) return state;
      return {
        ...state,
        categories: state.categories
          .filter((category) => category.id !== action.id)
          .map((category) =>
            category.parentId === action.id ? { ...category, parentId: removed.parentId } : category,
          ),
        documents: state.documents.map((document) =>
          document.categoryId === action.id
            ? { ...document, categoryId: null, categoryAutoAssigned: false }
            : document,
        ),
        counterparties: state.counterparties.map((counterparty) =>
          counterparty.defaultCategoryId === action.id
            ? { ...counterparty, defaultCategoryId: null }
            : counterparty,
        ),
      };
    }

    case "types/add":
      return { ...state, documentTypes: [...state.documentTypes, action.documentType] };

    case "types/update":
      return {
        ...state,
        documentTypes: state.documentTypes.map((type) =>
          type.id === action.id ? { ...type, ...action.patch } : type,
        ),
      };

    case "types/delete":
      return { ...state, documentTypes: state.documentTypes.filter((type) => type.id !== action.id) };

    case "schedule/update":
      return { ...state, schedule: { ...state.schedule, ...action.patch } };

    case "ksef/addRun":
      return { ...state, ksefRuns: [action.run, ...state.ksefRuns].slice(0, 40) };

    case "columns/set":
      return { ...state, columns: action.columns };

    case "settings/simulateFailure":
      return { ...state, simulateKsefFailure: action.value };

    default:
      return state;
  }
}

/* ------------------------------- Identyfikatory ---------------------------- */

let idCounter = 0;

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/* ------------------------------ Typy wyników ------------------------------- */

export interface ImportSummary {
  fetched: number;
  imported: number;
  duplicates: number;
  createdCounterparties: number;
}

export interface OperationResult<T = void> {
  ok: boolean;
  message: string;
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

/* --------------------------------- Kontekst -------------------------------- */

interface AppDataValue {
  state: AppState;
  /** `false` dopóki trwa odczyt zapisanego stanu z localStorage. */
  ready: boolean;
  addDocument: (draft: DocumentDraft) => OperationResult<InvoiceDocument>;
  updateDocument: (id: string, patch: Partial<InvoiceDocument>) => OperationResult;
  deleteDocuments: (ids: string[]) => OperationResult;
  acceptFromBuffer: (ids: string[]) => OperationResult;
  rejectFromBuffer: (ids: string[]) => OperationResult;
  importFromKsef: (params: { dateFrom: string; dateTo: string; scope: KsefFetchScope; trigger?: "manual" | "schedule" }) => Promise<OperationResult<ImportSummary>>;
  uploadFiles: (files: File[], target: "buffer" | "registered") => Promise<UploadResult[]>;
  upsertCounterparty: (counterparty: Counterparty) => void;
  addCategory: (name: string, parentId: string | null) => OperationResult<Category>;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  addDocumentType: (input: Omit<DocumentType, "id" | "isSystem">) => OperationResult<DocumentType>;
  updateDocumentType: (id: string, patch: Partial<DocumentType>) => void;
  deleteDocumentType: (id: string) => OperationResult;
  updateSchedule: (patch: Partial<KsefSchedule>) => void;
  setColumns: (columns: ColumnConfig[]) => void;
  setSimulateKsefFailure: (value: boolean) => void;
  resetDemoData: () => void;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Odczyt zapisanego stanu następuje po zamontowaniu, żeby render serwerowy
  // i pierwszy render klienta były identyczne.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AppState;
        if (parsed.documents && parsed.categories && parsed.documentTypes) {
          dispatch({ type: "hydrate", state: { ...initialState(), ...parsed } });
        }
      }
    } catch {
      // Uszkodzony wpis w localStorage nie może zablokować aplikacji.
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Przekroczony limit magazynu — pomijamy zapis, dane zostają w pamięci.
    }
  }, [state, ready]);

  /** Reguła „kontrahent → kategoria”. */
  const resolveCategory = useCallback(
    (counterpartyId: string, explicitCategoryId: string | null): { categoryId: string | null; auto: boolean } => {
      if (explicitCategoryId) return { categoryId: explicitCategoryId, auto: false };
      const counterparty = stateRef.current.counterparties.find((item) => item.id === counterpartyId);
      if (counterparty?.defaultCategoryId) {
        return { categoryId: counterparty.defaultCategoryId, auto: true };
      }
      return { categoryId: null, auto: false };
    },
    [],
  );

  const addDocument = useCallback<AppDataValue["addDocument"]>(
    (draft) => {
      const current = stateRef.current;
      const counterparty = current.counterparties.find((item) => item.id === draft.counterpartyId);
      const duplicate = findDuplicate(
        current.documents,
        { number: draft.number, ksefNumber: draft.ksefNumber, counterpartyNip: counterparty?.nip ?? "" },
        current.counterparties,
        draft.id,
      );

      if (duplicate.isDuplicate) {
        return {
          ok: false,
          message:
            duplicate.reason === "ksef-number"
              ? `Dokument o numerze KSeF ${draft.ksefNumber} już istnieje w systemie.`
              : `Dokument ${draft.number} tego kontrahenta już istnieje w systemie.`,
        };
      }

      const category = resolveCategory(draft.counterpartyId, draft.categoryId);
      const now = new Date().toISOString();
      const document: InvoiceDocument = {
        ...draft,
        id: draft.id ?? nextId("doc"),
        categoryId: category.categoryId,
        categoryAutoAssigned: category.auto,
        bufferDecision: draft.stage === "buffer" ? "pending" : "accepted",
        receivedAt: now,
        registeredAt: draft.stage === "registered" ? now : null,
      };

      dispatch({ type: "documents/add", document });
      return { ok: true, message: `Dodano dokument ${document.number}.`, data: document };
    },
    [resolveCategory],
  );

  const updateDocument = useCallback<AppDataValue["updateDocument"]>((id, patch) => {
    const current = stateRef.current;
    const existing = current.documents.find((document) => document.id === id);
    if (!existing) return { ok: false, message: "Nie znaleziono dokumentu." };

    const number = patch.number ?? existing.number;
    const counterpartyId = patch.counterpartyId ?? existing.counterpartyId;
    const counterparty = current.counterparties.find((item) => item.id === counterpartyId);
    const duplicate = findDuplicate(
      current.documents,
      { number, ksefNumber: patch.ksefNumber ?? existing.ksefNumber, counterpartyNip: counterparty?.nip ?? "" },
      current.counterparties,
      id,
    );
    if (duplicate.isDuplicate) {
      return { ok: false, message: `Dokument ${number} tego kontrahenta już istnieje w systemie.` };
    }

    dispatch({ type: "documents/update", id, patch });
    return { ok: true, message: `Zapisano zmiany w dokumencie ${number}.` };
  }, []);

  const deleteDocuments = useCallback<AppDataValue["deleteDocuments"]>((ids) => {
    dispatch({ type: "documents/delete", ids });
    return { ok: true, message: ids.length === 1 ? "Usunięto dokument." : `Usunięto ${ids.length} dokumentów.` };
  }, []);

  const acceptFromBuffer = useCallback<AppDataValue["acceptFromBuffer"]>((ids) => {
    if (ids.length === 0) return { ok: false, message: "Nie zaznaczono żadnej pozycji." };
    dispatch({ type: "documents/accept", ids, timestamp: new Date().toISOString() });
    return {
      ok: true,
      message:
        ids.length === 1
          ? "Dokument przeniesiony do rejestru."
          : `${ids.length} dokumentów przeniesionych do rejestru.`,
    };
  }, []);

  const rejectFromBuffer = useCallback<AppDataValue["rejectFromBuffer"]>((ids) => {
    if (ids.length === 0) return { ok: false, message: "Nie zaznaczono żadnej pozycji." };
    dispatch({ type: "documents/reject", ids });
    return { ok: true, message: `Odrzucono ${ids.length} ${ids.length === 1 ? "pozycję" : "pozycji"} z bufora.` };
  }, []);

  /** Znajduje kontrahenta po NIP albo zakłada nową kartotekę. */
  const ensureCounterparty = useCallback(
    (party: KsefInvoice["seller"], created: Counterparty[]): Counterparty => {
      const pool = [...stateRef.current.counterparties, ...created];
      const existing = pool.find((item) => item.nip.replace(/\D/g, "") === party.nip.replace(/\D/g, ""));
      if (existing) return existing;

      const counterparty: Counterparty = {
        id: nextId("cp"),
        name: party.name,
        nip: party.nip,
        address: {
          street: party.street,
          postalCode: party.postalCode,
          city: party.city,
          country: party.country,
        },
        bankAccount: null,
        defaultCategoryId: null,
      };
      created.push(counterparty);
      return counterparty;
    },
    [],
  );

  const importFromKsef = useCallback<AppDataValue["importFromKsef"]>(
    async ({ dateFrom, dateTo, scope, trigger = "manual" }) => {
      const client = getKsefClient({ simulateFailure: stateRef.current.simulateKsefFailure });
      const startedAt = new Date().toISOString();

      let invoices: KsefInvoice[];
      try {
        invoices = await client.fetchInvoices({ dateFrom, dateTo, scope });
      } catch (error) {
        const message =
          error instanceof KsefError
            ? error.message
            : "Nieoczekiwany błąd połączenia z KSeF. Nie pobrano żadnych dokumentów.";
        dispatch({
          type: "ksef/addRun",
          run: {
            id: nextId("run"),
            startedAt,
            trigger,
            scope,
            dateFrom,
            dateTo,
            status: "error",
            fetched: 0,
            imported: 0,
            duplicates: 0,
            message,
          },
        });
        return { ok: false, message };
      }

      const createdCounterparties: Counterparty[] = [];
      const accepted: InvoiceDocument[] = [];
      let duplicates = 0;

      for (const invoice of invoices) {
        const party = invoice.direction === "purchase" ? invoice.seller : invoice.buyer;
        const counterparty = ensureCounterparty(party, createdCounterparties);

        const duplicate = findDuplicate(
          [...stateRef.current.documents, ...accepted],
          { number: invoice.invoiceNumber, ksefNumber: invoice.ksefNumber, counterpartyNip: counterparty.nip },
          [...stateRef.current.counterparties, ...createdCounterparties],
        );
        if (duplicate.isDuplicate) {
          duplicates += 1;
          continue;
        }

        const category = resolveCategory(counterparty.id, null);
        accepted.push({
          id: nextId("doc"),
          number: invoice.invoiceNumber,
          typeId: invoice.direction === "purchase" ? "type-cost" : "type-sale",
          counterpartyId: counterparty.id,
          issueDate: invoice.issueDate,
          saleDate: invoice.saleDate,
          dueDate: invoice.dueDate,
          netAmount: invoice.netAmount,
          vatAmount: invoice.vatAmount,
          grossAmount: invoice.grossAmount,
          currency: invoice.currency,
          paymentAccount: invoice.paymentAccount,
          categoryId: category.categoryId,
          categoryAutoAssigned: category.auto,
          source: "ksef",
          ksefNumber: invoice.ksefNumber,
          stage: "buffer",
          bufferDecision: "pending",
          paymentStatus: "unpaid",
          attachment: {
            kind: "xml",
            filename: `${invoice.invoiceNumber.replace(/\//g, "_")}.xml`,
            size: 6400,
            url: "/sample/faktura-ksef-fa2.xml",
          },
          lines: invoice.lines.map((line, index) => ({ id: `line-${index + 1}`, ...line })),
          notes: null,
          receivedAt: new Date().toISOString(),
          registeredAt: null,
        });
      }

      createdCounterparties.forEach((counterparty) => dispatch({ type: "counterparties/upsert", counterparty }));
      if (accepted.length > 0) dispatch({ type: "documents/addMany", documents: accepted });

      dispatch({
        type: "ksef/addRun",
        run: {
          id: nextId("run"),
          startedAt,
          trigger,
          scope,
          dateFrom,
          dateTo,
          status: duplicates > 0 && accepted.length === 0 ? "partial" : "success",
          fetched: invoices.length,
          imported: accepted.length,
          duplicates,
          message:
            duplicates > 0
              ? `${duplicates} ${duplicates === 1 ? "dokument pominięto" : "dokumentów pominięto"} — już istnieją w systemie.`
              : null,
        },
      });

      const summary: ImportSummary = {
        fetched: invoices.length,
        imported: accepted.length,
        duplicates,
        createdCounterparties: createdCounterparties.length,
      };

      return {
        ok: true,
        message:
          accepted.length === 0
            ? `KSeF zwrócił ${invoices.length} dokumentów — wszystkie były już w systemie.`
            : `Do bufora trafiło ${accepted.length} z ${invoices.length} pobranych dokumentów.`,
        data: summary,
      };
    },
    [ensureCounterparty, resolveCategory],
  );

  const uploadFiles = useCallback<AppDataValue["uploadFiles"]>(
    async (files, target) => {
      const results: UploadResult[] = [];

      for (const file of files) {
        const isXml = file.name.toLowerCase().endsWith(".xml") || file.type.includes("xml");
        const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";

        if (!isXml && !isPdf) {
          results.push({ filename: file.name, ok: false, message: "Obsługiwane są wyłącznie pliki PDF i XML.", documentId: null });
          continue;
        }

        if (isPdf) {
          // PDF nie niesie danych ustrukturyzowanych — tworzymy szkic dokumentu
          // z załącznikiem, a pola uzupełnia użytkownik w formularzu.
          results.push({
            filename: file.name,
            ok: true,
            message: "Plik PDF gotowy — uzupełnij dane w formularzu.",
            documentId: null,
          });
          continue;
        }

        try {
          const xml = await file.text();
          const parsed = parseFa2(xml);
          const current = stateRef.current;

          // Kierunek ustalamy po tym, która strona faktury to nasza firma.
          const ourNip = "6751234560";
          const direction = parsed.seller.nip.replace(/\D/g, "") === ourNip ? "sale" : "purchase";
          const party = direction === "purchase" ? parsed.seller : parsed.buyer;

          const createdCounterparties: Counterparty[] = [];
          const counterparty = ensureCounterparty(
            {
              nip: party.nip,
              name: party.name,
              street: party.street,
              postalCode: party.postalCode,
              city: party.city,
              country: party.country,
            },
            createdCounterparties,
          );

          const duplicate = findDuplicate(
            current.documents,
            { number: parsed.invoiceNumber, ksefNumber: null, counterpartyNip: counterparty.nip },
            [...current.counterparties, ...createdCounterparties],
          );
          if (duplicate.isDuplicate) {
            results.push({
              filename: file.name,
              ok: false,
              message: `Dokument ${parsed.invoiceNumber} tego kontrahenta już istnieje w systemie.`,
              documentId: null,
            });
            continue;
          }

          createdCounterparties.forEach((item) => dispatch({ type: "counterparties/upsert", counterparty: item }));

          const category = resolveCategory(counterparty.id, null);
          const now = new Date().toISOString();
          const document: InvoiceDocument = {
            id: nextId("doc"),
            number: parsed.invoiceNumber,
            typeId: direction === "purchase" ? "type-cost" : "type-sale",
            counterpartyId: counterparty.id,
            issueDate: parsed.issueDate,
            saleDate: parsed.saleDate,
            dueDate: parsed.dueDate ?? parsed.issueDate,
            netAmount: parsed.netAmount,
            vatAmount: parsed.vatAmount,
            grossAmount: parsed.grossAmount,
            currency: parsed.currency,
            paymentAccount: parsed.paymentAccount,
            categoryId: category.categoryId,
            categoryAutoAssigned: category.auto,
            source: "upload",
            ksefNumber: null,
            stage: target,
            bufferDecision: target === "buffer" ? "pending" : "accepted",
            paymentStatus: "unpaid",
            attachment: {
              kind: "xml",
              filename: file.name,
              size: file.size,
              url: URL.createObjectURL(file),
            },
            lines: parsed.lines.map((line, index) => ({ id: `line-${index + 1}`, ...line })),
            notes: null,
            receivedAt: now,
            registeredAt: target === "registered" ? now : null,
          };

          dispatch({ type: "documents/add", document });
          results.push({
            filename: file.name,
            ok: true,
            message: `Wczytano fakturę ${parsed.invoiceNumber} — dane uzupełnione automatycznie.`,
            documentId: document.id,
          });
        } catch (error) {
          results.push({
            filename: file.name,
            ok: false,
            message: error instanceof Fa2ParseError ? error.message : "Nie udało się odczytać pliku XML.",
            documentId: null,
          });
        }
      }

      return results;
    },
    [ensureCounterparty, resolveCategory],
  );

  const upsertCounterparty = useCallback<AppDataValue["upsertCounterparty"]>((counterparty) => {
    dispatch({ type: "counterparties/upsert", counterparty });
  }, []);

  const addCategory = useCallback<AppDataValue["addCategory"]>((name, parentId) => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, message: "Nazwa kategorii nie może być pusta." };

    const siblings = stateRef.current.categories.filter((category) => category.parentId === parentId);
    if (siblings.some((category) => category.name.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, message: "Na tym poziomie istnieje już kategoria o tej nazwie." };
    }

    const category: Category = { id: nextId("cat"), name: trimmed, parentId, color: null };
    dispatch({ type: "categories/add", category });
    return { ok: true, message: `Dodano kategorię „${trimmed}”.`, data: category };
  }, []);

  const updateCategory = useCallback<AppDataValue["updateCategory"]>((id, patch) => {
    dispatch({ type: "categories/update", id, patch });
  }, []);

  const deleteCategory = useCallback<AppDataValue["deleteCategory"]>((id) => {
    dispatch({ type: "categories/delete", id });
  }, []);

  const addDocumentType = useCallback<AppDataValue["addDocumentType"]>((input) => {
    const name = input.name.trim();
    if (!name) return { ok: false, message: "Nazwa typu jest wymagana." };
    if (stateRef.current.documentTypes.some((type) => type.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, message: "Typ dokumentu o tej nazwie już istnieje." };
    }

    const documentType: DocumentType = {
      id: nextId("type"),
      name,
      shortName: input.shortName.trim().toUpperCase() || name.slice(0, 2).toUpperCase(),
      direction: input.direction,
      isSystem: false,
    };
    dispatch({ type: "types/add", documentType });
    return { ok: true, message: `Dodano typ „${name}”.`, data: documentType };
  }, []);

  const updateDocumentType = useCallback<AppDataValue["updateDocumentType"]>((id, patch) => {
    dispatch({ type: "types/update", id, patch });
  }, []);

  const deleteDocumentType = useCallback<AppDataValue["deleteDocumentType"]>((id) => {
    const current = stateRef.current;
    const type = current.documentTypes.find((item) => item.id === id);
    if (!type) return { ok: false, message: "Nie znaleziono typu dokumentu." };
    if (type.isSystem) return { ok: false, message: "Typu systemowego nie można usunąć." };

    const used = current.documents.filter((document) => document.typeId === id).length;
    if (used > 0) {
      return { ok: false, message: `Typ jest używany przez ${used} ${used === 1 ? "dokument" : "dokumentów"}.` };
    }

    dispatch({ type: "types/delete", id });
    return { ok: true, message: `Usunięto typ „${type.name}”.` };
  }, []);

  const updateSchedule = useCallback<AppDataValue["updateSchedule"]>((patch) => {
    dispatch({ type: "schedule/update", patch });
  }, []);

  const setColumns = useCallback<AppDataValue["setColumns"]>((columns) => {
    dispatch({ type: "columns/set", columns });
  }, []);

  const setSimulateKsefFailure = useCallback<AppDataValue["setSimulateKsefFailure"]>((value) => {
    dispatch({ type: "settings/simulateFailure", value });
  }, []);

  const resetDemoData = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    dispatch({ type: "reset" });
  }, []);

  const value = useMemo<AppDataValue>(
    () => ({
      state,
      ready,
      addDocument,
      updateDocument,
      deleteDocuments,
      acceptFromBuffer,
      rejectFromBuffer,
      importFromKsef,
      uploadFiles,
      upsertCounterparty,
      addCategory,
      updateCategory,
      deleteCategory,
      addDocumentType,
      updateDocumentType,
      deleteDocumentType,
      updateSchedule,
      setColumns,
      setSimulateKsefFailure,
      resetDemoData,
    }),
    [
      state,
      ready,
      addDocument,
      updateDocument,
      deleteDocuments,
      acceptFromBuffer,
      rejectFromBuffer,
      importFromKsef,
      uploadFiles,
      upsertCounterparty,
      addCategory,
      updateCategory,
      deleteCategory,
      addDocumentType,
      updateDocumentType,
      deleteDocumentType,
      updateSchedule,
      setColumns,
      setSimulateKsefFailure,
      resetDemoData,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("useAppData musi być użyty wewnątrz <AppDataProvider>.");
  }
  return context;
}
