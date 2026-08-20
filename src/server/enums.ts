/**
 * Tłumaczenie enumów między domeną a bazą.
 *
 * Domena używa wartości pisanych małymi literami ("ksef", "buffer"), bo tak
 * wyglądają w API i w kodzie frontendu. PostgreSQL przez Prismę oczekuje
 * wariantów wielkimi literami. Konwersja jest mechaniczna, ale musi zachować
 * typy — inaczej literówka w mapowaniu wychodzi dopiero w runtime.
 */
import type {
  BufferDecision,
  DocumentDirection,
  DocumentSource,
  DocumentStage,
  KsefFetchScope,
  KsefRunStatus,
  KsefRunTrigger,
  PaymentStatus,
} from "@/lib/domain/types";

export const toDb = <T extends string>(value: T): Uppercase<T> => value.toUpperCase() as Uppercase<T>;

export const fromDb = <T extends string>(value: T): Lowercase<T> => value.toLowerCase() as Lowercase<T>;

/** Etap obiegu nie jest zwykłym `toLowerCase` — w domenie brzmi „registered". */
export const stageToDb = (stage: DocumentStage): "BUFFER" | "REGISTERED" =>
  stage === "buffer" ? "BUFFER" : "REGISTERED";

export const stageFromDb = (stage: "BUFFER" | "REGISTERED"): DocumentStage =>
  stage === "BUFFER" ? "buffer" : "registered";

export type DomainEnums = {
  direction: DocumentDirection;
  source: DocumentSource;
  bufferDecision: BufferDecision;
  paymentStatus: PaymentStatus;
  scope: KsefFetchScope;
  trigger: KsefRunTrigger;
  runStatus: KsefRunStatus;
};
