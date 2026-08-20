"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Pencil, Plus, TriangleAlert, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAppData } from "@/lib/data/store";
import { buildCategoryTree, categoryPath, flattenCategoryTree } from "@/lib/data/queries";
import { validateBankAccount, validateNip } from "@/lib/domain/validation";
import { formatAmount, formatBankAccount, formatNip } from "@/lib/format";
import type { Counterparty } from "@/lib/domain/types";
import { cn } from "@/lib/cn";

const emptyForm: Counterparty = {
  id: "",
  name: "",
  nip: "",
  address: { street: "", postalCode: "", city: "", country: "PL" },
  bankAccount: null,
  defaultCategoryId: null,
};

/**
 * Kartoteka kontrahentów. Poprawność NIP i rachunku bankowego sprawdzamy sumą
 * kontrolną — dane z KSeF bywają kompletne, dane wpisywane ręcznie zwykle nie.
 */
export default function CounterpartiesPage() {
  const { state, upsertCounterparty } = useAppData();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Counterparty | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const categoryOptions = useMemo(
    () => flattenCategoryTree(buildCategoryTree(state.categories, state.documents)),
    [state.categories, state.documents],
  );

  const rows = useMemo(() => {
    const stats = new Map<string, { count: number; amount: number }>();
    for (const document of state.documents) {
      const entry = stats.get(document.counterpartyId) ?? { count: 0, amount: 0 };
      entry.count += 1;
      if (document.currency === "PLN") entry.amount += document.grossAmount;
      stats.set(document.counterpartyId, entry);
    }

    const needle = query.trim().toLowerCase();
    return [...state.counterparties]
      .filter(
        (counterparty) =>
          !needle ||
          counterparty.name.toLowerCase().includes(needle) ||
          counterparty.nip.includes(needle.replace(/\D/g, "")),
      )
      .sort((left, right) => left.name.localeCompare(right.name, "pl"))
      .map((counterparty) => ({
        counterparty,
        stats: stats.get(counterparty.id) ?? { count: 0, amount: 0 },
        nipValid: validateNip(counterparty.nip).valid,
        accountValid: counterparty.bankAccount ? validateBankAccount(counterparty.bankAccount).valid : null,
      }));
  }, [state.counterparties, state.documents, query]);

  const save = () => {
    if (!editing) return;
    const nextErrors: Record<string, string> = {};

    if (!editing.name.trim()) nextErrors.name = "Nazwa jest wymagana.";
    const nipCheck = validateNip(editing.nip);
    if (!nipCheck.valid) nextErrors.nip = nipCheck.message!;
    if (editing.bankAccount) {
      const accountCheck = validateBankAccount(editing.bankAccount);
      if (!accountCheck.valid) nextErrors.bankAccount = accountCheck.message!;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    upsertCounterparty({
      ...editing,
      id: editing.id || `cp-${Date.now().toString(36)}`,
      name: editing.name.trim(),
      nip: editing.nip.replace(/[\s-]/g, ""),
      bankAccount: editing.bankAccount ? editing.bankAccount.replace(/\s/g, "") : null,
    });
    toast.success(editing.id ? "Zapisano zmiany w kartotece." : `Dodano kontrahenta „${editing.name.trim()}”.`);
    setEditing(null);
  };

  return (
    <>
      <PageHeader
        title="Kontrahenci"
        description="Dane stron transakcji, rachunki bankowe i domyślne kategorie."
        actions={
          <>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Szukaj po nazwie lub NIP…"
              className="h-9 w-60 text-[13px]"
            />
            <Button
              variant="primary"
              onClick={() => {
                setErrors({});
                setEditing({ ...emptyForm });
              }}
            >
              <Plus className="size-4" aria-hidden />
              Nowy kontrahent
            </Button>
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Brak kontrahentów"
          description="Kartoteki powstają automatycznie przy imporcie z KSeF — możesz też dodać kontrahenta ręcznie."
        />
      ) : (
        <div className="scroll-slim flex-1 overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-left">
            <thead className="sticky top-0 z-10">
              <tr className="text-[11.5px] font-semibold tracking-wide text-fg-muted uppercase">
                <th className="border-b border-border bg-surface-2 px-4 py-2">Kontrahent</th>
                <th className="border-b border-border bg-surface-2 px-3 py-2">NIP</th>
                <th className="border-b border-border bg-surface-2 px-3 py-2">Adres</th>
                <th className="border-b border-border bg-surface-2 px-3 py-2">Rachunek bankowy</th>
                <th className="border-b border-border bg-surface-2 px-3 py-2">Kategoria domyślna</th>
                <th className="border-b border-border bg-surface-2 px-3 py-2 text-right">Dokumenty</th>
                <th className="border-b border-border bg-surface-2 px-3 py-2 text-right">Obrót brutto</th>
                <th className="w-10 border-b border-border bg-surface-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ counterparty, stats, nipValid, accountValid }) => (
                <tr key={counterparty.id} className="group transition-colors hover:bg-surface-2/70">
                  <td className="border-b border-border px-4 py-2.5 text-[13px] font-medium text-fg">
                    {counterparty.name}
                  </td>
                  <td className="border-b border-border px-3 py-2.5">
                    <span className="tnum inline-flex items-center gap-1.5 text-[12.5px] text-fg">
                      {formatNip(counterparty.nip)}
                      {nipValid ? (
                        <BadgeCheck className="size-3.5 text-success" aria-label="NIP poprawny" />
                      ) : (
                        <TriangleAlert className="size-3.5 text-danger" aria-label="NIP niepoprawny" />
                      )}
                    </span>
                  </td>
                  <td className="border-b border-border px-3 py-2.5 text-[12.5px] text-fg-muted">
                    {counterparty.address.street}, {counterparty.address.postalCode} {counterparty.address.city}
                    {counterparty.address.country !== "PL" ? ` (${counterparty.address.country})` : ""}
                  </td>
                  <td className="border-b border-border px-3 py-2.5">
                    {counterparty.bankAccount ? (
                      <span
                        className={cn(
                          "tnum font-mono text-[11.5px]",
                          accountValid ? "text-fg-muted" : "text-danger",
                        )}
                        title={accountValid ? "Suma kontrolna poprawna" : "Błędna suma kontrolna rachunku"}
                      >
                        {formatBankAccount(counterparty.bankAccount)}
                      </span>
                    ) : (
                      <span className="text-[12.5px] text-fg-subtle">— brak —</span>
                    )}
                  </td>
                  <td className="border-b border-border px-3 py-2.5 text-[12.5px] text-fg-muted">
                    {categoryPath(state.categories, counterparty.defaultCategoryId)}
                  </td>
                  <td className="tnum border-b border-border px-3 py-2.5 text-right text-[12.5px] text-fg-muted">
                    {stats.count}
                  </td>
                  <td className="tnum border-b border-border px-3 py-2.5 text-right text-[12.5px] text-fg">
                    {stats.amount > 0 ? formatAmount(stats.amount) : "—"}
                  </td>
                  <td className="border-b border-border px-1 py-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setErrors({});
                        setEditing(counterparty);
                      }}
                      aria-label={`Edytuj ${counterparty.name}`}
                      className="rounded-md p-1.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-3 hover:text-fg focus-visible:opacity-100"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Kartoteka: ${editing.name}` : "Nowy kontrahent"}
        description="Reguła „kontrahent → kategoria” działa na podstawie kategorii domyślnej."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Anuluj
            </Button>
            <Button variant="primary" onClick={save}>
              Zapisz
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-6">
            <Field label="Nazwa" required error={errors.name} className="sm:col-span-4">
              <Input
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                invalid={Boolean(errors.name)}
              />
            </Field>
            <Field label="NIP" required error={errors.nip} className="sm:col-span-2">
              <Input
                value={editing.nip}
                onChange={(event) => setEditing({ ...editing, nip: event.target.value })}
                className="tnum"
                invalid={Boolean(errors.nip)}
              />
            </Field>

            <Field label="Ulica i numer" className="sm:col-span-4">
              <Input
                value={editing.address.street}
                onChange={(event) => setEditing({ ...editing, address: { ...editing.address, street: event.target.value } })}
              />
            </Field>
            <Field label="Kod pocztowy" className="sm:col-span-2">
              <Input
                value={editing.address.postalCode}
                onChange={(event) =>
                  setEditing({ ...editing, address: { ...editing.address, postalCode: event.target.value } })
                }
              />
            </Field>
            <Field label="Miejscowość" className="sm:col-span-4">
              <Input
                value={editing.address.city}
                onChange={(event) => setEditing({ ...editing, address: { ...editing.address, city: event.target.value } })}
              />
            </Field>
            <Field label="Kraj" className="sm:col-span-2">
              <Input
                value={editing.address.country}
                onChange={(event) =>
                  setEditing({ ...editing, address: { ...editing.address, country: event.target.value.toUpperCase() } })
                }
              />
            </Field>

            <Field
              label="Rachunek bankowy"
              hint="NRB lub IBAN — weryfikujemy sumę kontrolną mod 97."
              error={errors.bankAccount}
              className="sm:col-span-4"
            >
              <Input
                value={editing.bankAccount ?? ""}
                onChange={(event) => setEditing({ ...editing, bankAccount: event.target.value || null })}
                className="tnum font-mono text-[12.5px]"
                invalid={Boolean(errors.bankAccount)}
              />
            </Field>
            <Field label="Kategoria domyślna" className="sm:col-span-2">
              <Select
                value={editing.defaultCategoryId ?? ""}
                onChange={(event) => setEditing({ ...editing, defaultCategoryId: event.target.value || null })}
              >
                <option value="">— brak reguły —</option>
                {categoryOptions.map((node) => (
                  <option key={node.id} value={node.id}>
                    {`${"  ".repeat(node.depth)}${node.depth > 0 ? "└ " : ""}${node.name}`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
