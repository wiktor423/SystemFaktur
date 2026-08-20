import { CloudDownload, FileUp, PencilLine } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { DocumentSource, DocumentType, PaymentStatus } from "@/lib/domain/types";
import { daysUntil, describeDueDate, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

const sourceMeta: Record<DocumentSource, { label: string; icon: typeof CloudDownload; tone: BadgeTone }> = {
  ksef: { label: "KSeF", icon: CloudDownload, tone: "info" },
  upload: { label: "Upload", icon: FileUp, tone: "accent" },
  manual: { label: "Ręczny", icon: PencilLine, tone: "neutral" },
};

export function SourceBadge({ source }: { source: DocumentSource }) {
  const meta = sourceMeta[source];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone}>
      <Icon className="size-3" aria-hidden />
      {meta.label}
    </Badge>
  );
}

/** Typ dokumentu — kolor zależy od kierunku (należność / zobowiązanie). */
export function TypeBadge({ type }: { type: DocumentType | undefined }) {
  if (!type) return <span className="text-fg-subtle">—</span>;
  return (
    <Badge tone={type.direction === "receivable" ? "success" : "warning"} className="font-semibold">
      {type.shortName}
      <span className="font-normal opacity-70">{type.direction === "receivable" ? "należność" : "zobowiązanie"}</span>
    </Badge>
  );
}

const statusMeta: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
  paid: { label: "Zapłacona", tone: "success" },
  partial: { label: "Częściowo", tone: "warning" },
  unpaid: { label: "Nieopłacona", tone: "neutral" },
};

export function PaymentStatusBadge({ status, dueDate }: { status: PaymentStatus; dueDate: string }) {
  if (status !== "paid" && daysUntil(dueDate) < 0) {
    return <Badge tone="danger" dot>Po terminie</Badge>;
  }
  const meta = statusMeta[status];
  return <Badge tone={meta.tone} dot={status === "paid"}>{meta.label}</Badge>;
}

/** Termin płatności z czytelnym wyróżnieniem pilności. */
export function DueDateCell({ dueDate, paid }: { dueDate: string; paid: boolean }) {
  const days = daysUntil(dueDate);
  const overdue = !paid && days < 0;
  const urgent = !paid && days >= 0 && days <= 3;

  return (
    <div className="flex flex-col leading-tight">
      <span className={cn("tnum text-[13px]", overdue ? "font-medium text-danger" : "text-fg")}>
        {formatDate(dueDate)}
      </span>
      {paid ? null : (
        <span className={cn("text-[11.5px]", overdue ? "text-danger" : urgent ? "text-warning" : "text-fg-subtle")}>
          {describeDueDate(dueDate)}
        </span>
      )}
    </div>
  );
}

/** Znacznik kategorii; kropka dziedziczy kolor gałęzi nadrzędnej. */
export function CategoryTag({
  name,
  color,
  auto = false,
}: {
  name: string;
  color: string | null;
  auto?: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-fg">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color ?? "var(--color-border-strong)" }}
        aria-hidden
      />
      <span className="truncate">{name}</span>
      {auto ? (
        <span
          title="Kategoria przypisana automatycznie regułą kontrahent → kategoria"
          className="shrink-0 rounded bg-surface-3 px-1 text-[10.5px] font-medium tracking-wide text-fg-subtle uppercase"
        >
          auto
        </span>
      ) : null}
    </span>
  );
}
