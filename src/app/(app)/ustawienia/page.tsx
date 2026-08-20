"use client";

import { useMemo, useState } from "react";
import { Clock, KeyRound, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { Panel, PanelHeader, SegmentedControl } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/layout/theme";
import { KsefRunsList, nextScheduledRun } from "@/components/documents/ksef-runs";
import { useToast } from "@/components/ui/toast";
import { useAppData } from "@/lib/data/store";
import { formatDateTime } from "@/lib/format";
import type { DocumentDirection, KsefFetchScope } from "@/lib/domain/types";

/**
 * Ustawienia modułu: typy dokumentów, harmonogram pobierania z KSeF,
 * parametry integracji i dane demonstracyjne.
 */
export default function SettingsPage() {
  const {
    state,
    addDocumentType,
    deleteDocumentType,
    updateSchedule,
    setSimulateKsefFailure,
    resetDemoData,
  } = useAppData();
  const toast = useToast();

  const [typeName, setTypeName] = useState("");
  const [typeShort, setTypeShort] = useState("");
  const [typeDirection, setTypeDirection] = useState<DocumentDirection>("payable");
  const [newTime, setNewTime] = useState("03:00");
  const [resetOpen, setResetOpen] = useState(false);

  const usageByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const document of state.documents) {
      counts.set(document.typeId, (counts.get(document.typeId) ?? 0) + 1);
    }
    return counts;
  }, [state.documents]);

  const nextRun = useMemo(() => nextScheduledRun(state.schedule), [state.schedule]);
  const sortedTimes = useMemo(() => [...state.schedule.times].sort(), [state.schedule.times]);

  const submitType = () => {
    const result = addDocumentType({ name: typeName, shortName: typeShort, direction: typeDirection });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setTypeName("");
    setTypeShort("");
    toast.success(result.message);
  };

  const addTime = () => {
    if (!/^\d{2}:\d{2}$/.test(newTime)) {
      toast.error("Nieprawidłowa godzina", "Oczekiwany format HH:MM.");
      return;
    }
    if (state.schedule.times.includes(newTime)) {
      toast.error("Ta godzina jest już na liście.");
      return;
    }
    updateSchedule({ times: [...state.schedule.times, newTime].sort() });
    toast.success(`Dodano uruchomienie o ${newTime}.`);
  };

  return (
    <>
      <PageHeader title="Ustawienia" description="Typy dokumentów, harmonogram pobierania i parametry integracji." />

      <div className="scroll-slim flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          {/* ------------------------------ Typy dokumentów ---------------------- */}
          <Panel padded={false}>
            <PanelHeader
              title="Typy dokumentów"
              description="Każdy typ ma kierunek: należność (do otrzymania) albo zobowiązanie (do zapłaty)."
            />

            <ul className="divide-y divide-border">
              {state.documentTypes.map((type) => {
                const usage = usageByType.get(type.id) ?? 0;
                return (
                  <li key={type.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-12 shrink-0 rounded-md bg-surface-2 py-1 text-center text-[12px] font-semibold text-fg-muted">
                      {type.shortName}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{type.name}</span>
                    <Badge tone={type.direction === "receivable" ? "success" : "warning"}>
                      {type.direction === "receivable" ? "należność" : "zobowiązanie"}
                    </Badge>
                    {type.isSystem ? <Badge tone="neutral">systemowy</Badge> : null}
                    <span className="tnum w-24 shrink-0 text-right text-[12.5px] text-fg-subtle">
                      {usage} {usage === 1 ? "dokument" : "dok."}
                    </span>
                    <button
                      type="button"
                      disabled={type.isSystem || usage > 0}
                      title={
                        type.isSystem
                          ? "Typ systemowy — nie można usunąć"
                          : usage > 0
                            ? "Typ jest używany przez dokumenty"
                            : "Usuń typ"
                      }
                      onClick={() => {
                        const result = deleteDocumentType(type.id);
                        if (result.ok) toast.success(result.message);
                        else toast.error(result.message);
                      }}
                      className="rounded-md p-1.5 text-fg-subtle transition-colors enabled:hover:bg-danger-soft enabled:hover:text-danger disabled:opacity-30"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap items-end gap-3 border-t border-border bg-surface-2/50 px-4 py-3">
              <Field label="Nazwa nowego typu" className="min-w-52 flex-1">
                <Input
                  value={typeName}
                  onChange={(event) => setTypeName(event.target.value)}
                  placeholder="np. Nota karna"
                  className="h-9"
                />
              </Field>
              <Field label="Skrót" className="w-24">
                <Input
                  value={typeShort}
                  onChange={(event) => setTypeShort(event.target.value.toUpperCase().slice(0, 4))}
                  placeholder="NK"
                  className="h-9 text-center"
                />
              </Field>
              <Field label="Kierunek" className="w-52">
                <Select
                  value={typeDirection}
                  onChange={(event) => setTypeDirection(event.target.value as DocumentDirection)}
                >
                  <option value="payable">Zobowiązanie (do zapłaty)</option>
                  <option value="receivable">Należność (do otrzymania)</option>
                </Select>
              </Field>
              <Button variant="primary" onClick={submitType} disabled={!typeName.trim()}>
                <Plus className="size-4" aria-hidden />
                Dodaj typ
              </Button>
            </div>
          </Panel>

          {/* --------------------------- Harmonogram KSeF ------------------------ */}
          <Panel padded={false}>
            <PanelHeader
              title="Harmonogram pobierania z KSeF"
              description="Dowolna liczba uruchomień w ciągu doby. Wyniki trafiają do bufora."
              actions={
                <Switch
                  checked={state.schedule.enabled}
                  onChange={(enabled) => updateSchedule({ enabled })}
                  label={state.schedule.enabled ? "Włączony" : "Wyłączony"}
                />
              }
            />

            <div className="flex flex-col gap-4 px-4 py-4">
              <div>
                <span className="text-[13px] font-medium text-fg-muted">Godziny uruchomień</span>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {sortedTimes.length === 0 ? (
                    <span className="text-[13px] text-fg-subtle">Brak zaplanowanych uruchomień.</span>
                  ) : (
                    sortedTimes.map((time) => (
                      <span
                        key={time}
                        className="tnum inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 py-1 pr-1 pl-2.5 text-[13px] text-fg"
                      >
                        <Clock className="size-3.5 text-fg-subtle" aria-hidden />
                        {time}
                        <button
                          type="button"
                          aria-label={`Usuń uruchomienie o ${time}`}
                          onClick={() =>
                            updateSchedule({ times: state.schedule.times.filter((item) => item !== time) })
                          }
                          className="rounded p-0.5 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      </span>
                    ))
                  )}

                  <span className="inline-flex items-center gap-1.5">
                    <Input
                      type="time"
                      value={newTime}
                      onChange={(event) => setNewTime(event.target.value)}
                      className="tnum h-8 w-28 text-[13px]"
                      aria-label="Nowa godzina uruchomienia"
                    />
                    <Button size="sm" variant="secondary" onClick={addTime}>
                      <Plus className="size-3.5" aria-hidden />
                      Dodaj godzinę
                    </Button>
                  </span>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-fg-muted">Rodzaj pobieranych faktur</span>
                  <SegmentedControl
                    value={state.schedule.scope}
                    onChange={(scope: KsefFetchScope) => updateSchedule({ scope })}
                    options={[
                      { value: "both", label: "Wszystkie" },
                      { value: "purchase", label: "Kosztowe" },
                      { value: "sale", label: "Sprzedażowe" },
                    ]}
                  />
                </div>

                <Field
                  label="Zakres wstecz (dni)"
                  hint="Każde uruchomienie pobiera dokumenty z ostatnich N dni — zapas na faktury wystawione z opóźnieniem."
                >
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={state.schedule.lookbackDays}
                    onChange={(event) => updateSchedule({ lookbackDays: Number(event.target.value) || 1 })}
                    className="tnum w-28"
                  />
                </Field>
              </div>

              <p className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-fg-muted">
                {state.schedule.enabled && nextRun ? (
                  <>
                    Najbliższe uruchomienie: <span className="font-medium text-fg">{formatDateTime(nextRun.toISOString())}</span>.
                  </>
                ) : (
                  "Harmonogram jest wyłączony — dokumenty pobierzesz wyłącznie ręcznie z widoku bufora."
                )}{" "}
                W wersji frontendowej harmonogram jest konfiguracją; wykonanie zadań przejmie cykliczny scheduler po
                stronie serwera.
              </p>
            </div>
          </Panel>

          {/* ---------------------------- Integracja KSeF ------------------------ */}
          <Panel padded={false}>
            <PanelHeader title="Integracja z KSeF" description="Środowisko testowe Ministerstwa Finansów." />

            <div className="flex flex-col gap-3 px-4 py-4">
              <div className="flex items-start gap-2.5 rounded-lg border border-warning-border bg-warning-soft px-3.5 py-3 text-[12.5px] leading-relaxed text-warning">
                <KeyRound className="mt-px size-4 shrink-0" aria-hidden />
                <p>
                  Token i certyfikat KSeF nigdy nie trafiają do przeglądarki ani do repozytorium — pozostają w
                  zmiennych środowiskowych po stronie serwera. Ten ekran pokazuje wyłącznie stan połączenia.
                </p>
              </div>

              <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 border-b border-border py-1.5">
                  <dt className="text-fg-muted">Adres API</dt>
                  <dd className="font-mono text-[12px] text-fg">api-test.ksef.mf.gov.pl</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-border py-1.5">
                  <dt className="text-fg-muted">Warstwa integracji</dt>
                  <dd>
                    <Badge tone="accent">adapter mock</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-border py-1.5">
                  <dt className="text-fg-muted">Uwierzytelnienie</dt>
                  <dd className="text-fg">token KSeF (zmienna środowiskowa)</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-border py-1.5">
                  <dt className="text-fg-muted">Kierunek integracji</dt>
                  <dd className="text-fg">wyłącznie pobieranie</dd>
                </div>
              </dl>

              <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-2 px-3.5 py-3">
                <div>
                  <p className="text-[13px] font-medium text-fg">Symuluj niedostępność KSeF</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">
                    Wymusza błąd przy następnym pobraniu — pozwala sprawdzić komunikaty i to, że żaden dokument nie
                    ginie po nieudanej próbie.
                  </p>
                </div>
                <Switch checked={state.simulateKsefFailure} onChange={setSimulateKsefFailure} />
              </div>
            </div>
          </Panel>

          {/* ------------------------------- Historia ---------------------------- */}
          <Panel padded={false}>
            <PanelHeader title="Historia pobrań" description="Ostatnie uruchomienia ręczne i automatyczne." />
            <div className="max-h-80 overflow-y-auto">
              <KsefRunsList runs={state.ksefRuns} />
            </div>
          </Panel>

          {/* -------------------------------- Wygląd ----------------------------- */}
          <Panel padded={false}>
            <PanelHeader title="Wygląd i dane" description="Motyw interfejsu oraz dane demonstracyjne." />
            <div className="flex flex-col gap-3 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[13px] font-medium text-fg">Motyw interfejsu</p>
                  <p className="mt-0.5 text-[12.5px] text-fg-muted">Jasny, ciemny albo zgodny z ustawieniem systemu.</p>
                </div>
                <ThemeToggle />
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
                <div>
                  <p className="text-[13px] font-medium text-fg">Dane demonstracyjne</p>
                  <p className="mt-0.5 text-[12.5px] text-fg-muted">
                    Przywraca stan początkowy: dokumenty, kategorie, kontrahentów i ustawienia.
                  </p>
                </div>
                <Button variant="secondary" onClick={() => setResetOpen(true)}>
                  <RotateCcw className="size-4" aria-hidden />
                  Przywróć dane demo
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        size="sm"
        title="Przywrócić dane demonstracyjne?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Anuluj
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                resetDemoData();
                setResetOpen(false);
                toast.success("Przywrócono dane demonstracyjne.");
              }}
            >
              Przywróć
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-fg-muted">
          Wszystkie zmiany wprowadzone w tej przeglądarce — dodane dokumenty, kategorie, kontrahenci i ustawienia —
          zostaną utracone.
        </p>
      </Modal>
    </>
  );
}
