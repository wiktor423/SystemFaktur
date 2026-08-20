"use client";

import { useState } from "react";
import { CloudDownload, Info } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAppData, type ImportSummary } from "@/lib/data/store";
import type { KsefFetchScope } from "@/lib/domain/types";

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function isoToday(): string {
  return isoDaysAgo(0);
}

/** Ręczne pobranie faktur z KSeF: zakres dat + rodzaj faktur. */
export function KsefImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { importFromKsef } = useAppData();
  const toast = useToast();

  const [dateFrom, setDateFrom] = useState(isoDaysAgo(7));
  const [dateTo, setDateTo] = useState(isoToday());
  const [scope, setScope] = useState<KsefFetchScope>("both");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rangeInvalid = dateFrom > dateTo;

  const run = async () => {
    setLoading(true);
    setError(null);
    setSummary(null);

    const result = await importFromKsef({ dateFrom, dateTo, scope });
    setLoading(false);

    if (!result.ok) {
      setError(result.message);
      toast.error("Pobieranie z KSeF nie powiodło się", result.message);
      return;
    }

    setSummary(result.data ?? null);
    toast.success("Pobieranie zakończone", result.message);
  };

  const close = () => {
    setSummary(null);
    setError(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Pobierz faktury z KSeF"
      description="Środowisko testowe. Pobrane dokumenty trafiają do bufora — do rejestru przenosi je dopiero akceptacja."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {summary ? "Zamknij" : "Anuluj"}
          </Button>
          <Button variant="primary" onClick={run} loading={loading} disabled={rangeInvalid}>
            {!loading ? <CloudDownload className="size-4" aria-hidden /> : null}
            {summary ? "Pobierz ponownie" : "Pobierz"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Data od" required error={rangeInvalid ? "Zakres dat jest odwrócony." : null}>
            <Input type="date" value={dateFrom} max={dateTo} onChange={(event) => setDateFrom(event.target.value)} />
          </Field>
          <Field label="Data do" required>
            <Input type="date" value={dateTo} min={dateFrom} onChange={(event) => setDateTo(event.target.value)} />
          </Field>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg-muted">Rodzaj faktur</span>
          <SegmentedControl
            value={scope}
            onChange={setScope}
            options={[
              { value: "both", label: "Wszystkie" },
              { value: "purchase", label: "Kosztowe (zakup)" },
              { value: "sale", label: "Sprzedażowe" },
            ]}
          />
        </div>

        <div className="flex gap-2.5 rounded-xl border border-info-border bg-info-soft px-3.5 py-3 text-[12.5px] leading-relaxed text-info">
          <Info className="mt-px size-4 shrink-0" aria-hidden />
          <p>
            Faktury już obecne w systemie zostaną pominięte. Deduplikacja działa po numerze KSeF oraz po parze
            numer dokumentu + NIP kontrahenta, więc ponowne pobranie tego samego zakresu jest bezpieczne.
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-danger-border bg-danger-soft px-3.5 py-3 text-[12.5px] leading-relaxed text-danger">
            {error}
          </div>
        ) : null}

        {summary ? (
          <div className="grid grid-cols-3 gap-2">
            <SummaryTile label="Zwrócone przez KSeF" value={summary.fetched} />
            <SummaryTile label="Dodane do bufora" value={summary.imported} tone="success" />
            <SummaryTile label="Pominięte duplikaty" value={summary.duplicates} tone="muted" />
            {summary.createdCounterparties > 0 ? (
              <p className="col-span-3 text-[12.5px] text-fg-muted">
                Założono {summary.createdCounterparties}{" "}
                {summary.createdCounterparties === 1 ? "nową kartotekę kontrahenta" : "nowe kartoteki kontrahentów"}.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "muted";
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "muted" ? "text-fg-subtle" : "text-fg";
  return (
    <div className="rounded-xl border border-border bg-surface-2 px-3 py-2.5">
      <div className={`tnum text-[18px] font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-0.5 text-[11.5px] leading-tight text-fg-subtle">{label}</div>
    </div>
  );
}
