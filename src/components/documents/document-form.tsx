"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useAppData, type DocumentDraft } from "@/lib/data/store";
import { useToast } from "@/components/ui/toast";
import type { Attachment, Counterparty, InvoiceDocument } from "@/lib/domain/types";
import { buildCategoryTree, flattenCategoryTree } from "@/lib/data/queries";
import {
  validateAmount,
  validateAmountConsistency,
  validateBankAccount,
  validateDate,
  validateDocumentNumber,
  validateDueDate,
  validateNip,
} from "@/lib/domain/validation";

interface FormState {
  number: string;
  typeId: string;
  counterpartyId: string;
  issueDate: string;
  saleDate: string;
  dueDate: string;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  currency: string;
  paymentAccount: string;
  categoryId: string;
  paymentStatus: InvoiceDocument["paymentStatus"];
  notes: string;
}

interface NewCounterpartyState {
  name: string;
  nip: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  bankAccount: string;
}

const emptyCounterparty: NewCounterpartyState = {
  name: "",
  nip: "",
  street: "",
  postalCode: "",
  city: "",
  country: "PL",
  bankAccount: "",
};

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function toFormState(document: InvoiceDocument | null, defaultTypeId: string): FormState {
  if (!document) {
    return {
      number: "",
      typeId: defaultTypeId,
      counterpartyId: "",
      issueDate: today(),
      saleDate: today(),
      dueDate: today(),
      netAmount: "",
      vatAmount: "",
      grossAmount: "",
      currency: "PLN",
      paymentAccount: "",
      categoryId: "",
      paymentStatus: "unpaid",
      notes: "",
    };
  }

  return {
    number: document.number,
    typeId: document.typeId,
    counterpartyId: document.counterpartyId,
    issueDate: document.issueDate,
    saleDate: document.saleDate ?? document.issueDate,
    dueDate: document.dueDate,
    netAmount: String(document.netAmount),
    vatAmount: String(document.vatAmount),
    grossAmount: String(document.grossAmount),
    currency: document.currency,
    paymentAccount: document.paymentAccount ?? "",
    categoryId: document.categoryId ?? "",
    paymentStatus: document.paymentStatus,
    notes: document.notes ?? "",
  };
}

function parseAmount(value: string): number {
  return Number(value.replace(/\s/g, "").replace(",", ".")) || 0;
}

/**
 * Formularz dodawania i edycji dokumentu.
 *
 * Walidacja korzysta z reguł domenowych (`lib/domain/validation`), tych samych,
 * które obowiązują po stronie serwera — komponent tylko prezentuje ich wynik.
 */
export function DocumentFormModal({
  open,
  onClose,
  document,
  defaultStage = "registered",
  attachment = null,
}: {
  open: boolean;
  onClose: () => void;
  document: InvoiceDocument | null;
  defaultStage?: InvoiceDocument["stage"];
  /** Plik powiązany z dokumentem — ustawiany przy dodawaniu faktury z PDF. */
  attachment?: Attachment | null;
}) {
  const { state, addDocument, updateDocument, upsertCounterparty } = useAppData();
  const toast = useToast();

  const [form, setForm] = useState<FormState>(() => toFormState(document, state.documentTypes[0]?.id ?? ""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [creatingCounterparty, setCreatingCounterparty] = useState(false);
  const [newCounterparty, setNewCounterparty] = useState<NewCounterpartyState>(emptyCounterparty);

  useEffect(() => {
    if (!open) return;
    setForm(toFormState(document, state.documentTypes[0]?.id ?? ""));
    setErrors({});
    setCreatingCounterparty(false);
    setNewCounterparty(emptyCounterparty);
  }, [open, document, state.documentTypes]);

  const categoryOptions = useMemo(
    () => flattenCategoryTree(buildCategoryTree(state.categories, state.documents)),
    [state.categories, state.documents],
  );

  const sortedCounterparties = useMemo(
    () => [...state.counterparties].sort((left, right) => left.name.localeCompare(right.name, "pl")),
    [state.counterparties],
  );

  const selectedCounterparty = state.counterparties.find((item) => item.id === form.counterpartyId);

  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  /** Wybór kontrahenta podpowiada rachunek i kategorię z reguły automatycznej. */
  const onCounterpartyChange = (counterpartyId: string) => {
    const counterparty = state.counterparties.find((item) => item.id === counterpartyId);
    update({
      counterpartyId,
      paymentAccount: form.paymentAccount || (counterparty?.bankAccount ?? ""),
      categoryId: form.categoryId || (counterparty?.defaultCategoryId ?? ""),
    });
  };

  /** Kwota brutto podąża za netto i VAT, dopóki użytkownik jej nie nadpisze. */
  const onAmountChange = (field: "netAmount" | "vatAmount", value: string) => {
    const next = { ...form, [field]: value };
    const net = parseAmount(field === "netAmount" ? value : form.netAmount);
    const vat = parseAmount(field === "vatAmount" ? value : form.vatAmount);
    next.grossAmount = (Math.round((net + vat) * 100) / 100).toFixed(2);
    setForm(next);
  };

  const validate = (): { valid: boolean; counterpartyId: string } => {
    const nextErrors: Record<string, string> = {};

    const numberCheck = validateDocumentNumber(form.number);
    if (!numberCheck.valid) nextErrors.number = numberCheck.message!;

    const issueCheck = validateDate(form.issueDate, "Data wystawienia");
    if (!issueCheck.valid) nextErrors.issueDate = issueCheck.message!;

    const dueCheck = validateDueDate(form.issueDate, form.dueDate);
    if (!dueCheck.valid) nextErrors.dueDate = dueCheck.message!;

    const netCheck = validateAmount(form.netAmount || "0", "Kwota netto");
    if (!netCheck.valid) nextErrors.netAmount = netCheck.message!;

    const vatCheck = validateAmount(form.vatAmount || "0", "Kwota VAT");
    if (!vatCheck.valid) nextErrors.vatAmount = vatCheck.message!;

    const grossCheck = validateAmount(form.grossAmount || "0", "Kwota brutto");
    if (!grossCheck.valid) nextErrors.grossAmount = grossCheck.message!;

    const consistency = validateAmountConsistency(
      parseAmount(form.netAmount),
      parseAmount(form.vatAmount),
      parseAmount(form.grossAmount),
    );
    if (!consistency.valid) nextErrors.grossAmount = consistency.message!;

    if (form.paymentAccount) {
      const accountCheck = validateBankAccount(form.paymentAccount);
      if (!accountCheck.valid) nextErrors.paymentAccount = accountCheck.message!;
    }

    let counterpartyId = form.counterpartyId;

    if (creatingCounterparty) {
      if (!newCounterparty.name.trim()) nextErrors.newName = "Nazwa kontrahenta jest wymagana.";
      const nipCheck = validateNip(newCounterparty.nip);
      if (!nipCheck.valid) nextErrors.newNip = nipCheck.message!;
      if (newCounterparty.bankAccount) {
        const accountCheck = validateBankAccount(newCounterparty.bankAccount);
        if (!accountCheck.valid) nextErrors.newBankAccount = accountCheck.message!;
      }
    } else if (!counterpartyId) {
      nextErrors.counterpartyId = "Wybierz kontrahenta lub dodaj nowego.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return { valid: false, counterpartyId };

    if (creatingCounterparty) {
      const created: Counterparty = {
        id: `cp-new-${Date.now().toString(36)}`,
        name: newCounterparty.name.trim(),
        nip: newCounterparty.nip.replace(/[\s-]/g, ""),
        address: {
          street: newCounterparty.street.trim(),
          postalCode: newCounterparty.postalCode.trim(),
          city: newCounterparty.city.trim(),
          country: newCounterparty.country.trim().toUpperCase() || "PL",
        },
        bankAccount: newCounterparty.bankAccount.replace(/\s/g, "") || null,
        defaultCategoryId: null,
      };
      upsertCounterparty(created);
      counterpartyId = created.id;
    }

    return { valid: true, counterpartyId };
  };

  const submit = () => {
    const { valid, counterpartyId } = validate();
    if (!valid) return;

    const payload = {
      number: form.number.trim(),
      typeId: form.typeId,
      counterpartyId,
      issueDate: form.issueDate,
      saleDate: form.saleDate || null,
      dueDate: form.dueDate,
      netAmount: parseAmount(form.netAmount),
      vatAmount: parseAmount(form.vatAmount),
      grossAmount: parseAmount(form.grossAmount),
      currency: form.currency,
      paymentAccount: form.paymentAccount.replace(/\s/g, "") || null,
      categoryId: form.categoryId || null,
      notes: form.notes.trim() || null,
      paymentStatus: form.paymentStatus,
    };

    if (document) {
      const result = updateDocument(document.id, payload);
      if (!result.ok) {
        setErrors({ number: result.message });
        toast.error("Nie zapisano zmian", result.message);
        return;
      }
      toast.success(result.message);
      onClose();
      return;
    }

    const draft: DocumentDraft = {
      ...payload,
      source: attachment ? "upload" : "manual",
      ksefNumber: null,
      stage: defaultStage,
      attachment,
      lines: [],
      categoryAutoAssigned: false,
    } as DocumentDraft;

    const result = addDocument(draft);
    if (!result.ok) {
      setErrors({ number: result.message });
      toast.error("Nie dodano dokumentu", result.message);
      return;
    }
    toast.success(result.message);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={document ? `Edycja dokumentu ${document.number}` : attachment ? "Dane faktury z pliku PDF" : "Nowy dokument"}
      description={
        document
          ? "Zmiany zostaną zapisane w rejestrze po zatwierdzeniu."
          : attachment
            ? `Plik ${attachment.filename} zostanie załącznikiem dokumentu — uzupełnij pola, których nie ma w PDF.`
            : "Dokument spoza KSeF — uzupełnij dane ręcznie. Sprawdzimy je pod kątem duplikatu."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Anuluj
          </Button>
          <Button variant="primary" onClick={submit}>
            {document ? "Zapisz zmiany" : "Dodaj dokument"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Numer dokumentu" required error={errors.number}>
            <Input
              value={form.number}
              onChange={(event) => update({ number: event.target.value })}
              placeholder="np. FV/2026/08/117"
              invalid={Boolean(errors.number)}
            />
          </Field>

          <Field label="Typ dokumentu" required>
            <Select value={form.typeId} onChange={(event) => update({ typeId: event.target.value })}>
              {state.documentTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} ({type.direction === "receivable" ? "należność" : "zobowiązanie"})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status płatności">
            <Select
              value={form.paymentStatus}
              onChange={(event) => update({ paymentStatus: event.target.value as FormState["paymentStatus"] })}
            >
              <option value="unpaid">Nieopłacona</option>
              <option value="partial">Częściowo opłacona</option>
              <option value="paid">Zapłacona</option>
            </Select>
          </Field>
        </div>

        <div className="rounded-xl border border-border bg-surface-2/50 p-3">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-semibold tracking-wide text-fg-muted uppercase">Kontrahent</span>
            <Button
              size="sm"
              variant={creatingCounterparty ? "ghost" : "secondary"}
              onClick={() => setCreatingCounterparty((value) => !value)}
            >
              {creatingCounterparty ? (
                <>
                  <X className="size-3.5" aria-hidden />
                  Wybierz z listy
                </>
              ) : (
                <>
                  <Plus className="size-3.5" aria-hidden />
                  Nowy kontrahent
                </>
              )}
            </Button>
          </div>

          {creatingCounterparty ? (
            <div className="grid gap-3 sm:grid-cols-6">
              <Field label="Nazwa" required error={errors.newName} className="sm:col-span-4">
                <Input
                  value={newCounterparty.name}
                  onChange={(event) => setNewCounterparty({ ...newCounterparty, name: event.target.value })}
                  invalid={Boolean(errors.newName)}
                />
              </Field>
              <Field label="NIP" required error={errors.newNip} className="sm:col-span-2">
                <Input
                  value={newCounterparty.nip}
                  onChange={(event) => setNewCounterparty({ ...newCounterparty, nip: event.target.value })}
                  placeholder="1234567890"
                  invalid={Boolean(errors.newNip)}
                />
              </Field>
              <Field label="Ulica i numer" className="sm:col-span-3">
                <Input
                  value={newCounterparty.street}
                  onChange={(event) => setNewCounterparty({ ...newCounterparty, street: event.target.value })}
                />
              </Field>
              <Field label="Kod pocztowy" className="sm:col-span-1">
                <Input
                  value={newCounterparty.postalCode}
                  onChange={(event) => setNewCounterparty({ ...newCounterparty, postalCode: event.target.value })}
                  placeholder="00-000"
                />
              </Field>
              <Field label="Miejscowość" className="sm:col-span-2">
                <Input
                  value={newCounterparty.city}
                  onChange={(event) => setNewCounterparty({ ...newCounterparty, city: event.target.value })}
                />
              </Field>
              <Field
                label="Rachunek bankowy"
                hint="NRB lub IBAN — sprawdzamy sumę kontrolną."
                error={errors.newBankAccount}
                className="sm:col-span-6"
              >
                <Input
                  value={newCounterparty.bankAccount}
                  onChange={(event) => setNewCounterparty({ ...newCounterparty, bankAccount: event.target.value })}
                  invalid={Boolean(errors.newBankAccount)}
                />
              </Field>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Kontrahent" required error={errors.counterpartyId} className="sm:col-span-2">
                <Select
                  value={form.counterpartyId}
                  onChange={(event) => onCounterpartyChange(event.target.value)}
                  invalid={Boolean(errors.counterpartyId)}
                >
                  <option value="">— wybierz —</option>
                  {sortedCounterparties.map((counterparty) => (
                    <option key={counterparty.id} value={counterparty.id}>
                      {counterparty.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="NIP kontrahenta">
                <Input value={selectedCounterparty?.nip ?? ""} readOnly disabled className="tnum font-mono" />
              </Field>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Data wystawienia" required error={errors.issueDate}>
            <Input
              type="date"
              value={form.issueDate}
              onChange={(event) => update({ issueDate: event.target.value })}
              invalid={Boolean(errors.issueDate)}
            />
          </Field>
          <Field label="Data sprzedaży">
            <Input type="date" value={form.saleDate} onChange={(event) => update({ saleDate: event.target.value })} />
          </Field>
          <Field label="Termin płatności" required error={errors.dueDate}>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(event) => update({ dueDate: event.target.value })}
              invalid={Boolean(errors.dueDate)}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Kwota netto" required error={errors.netAmount}>
            <Input
              inputMode="decimal"
              value={form.netAmount}
              onChange={(event) => onAmountChange("netAmount", event.target.value)}
              placeholder="0,00"
              className="tnum text-right"
              invalid={Boolean(errors.netAmount)}
            />
          </Field>
          <Field label="Kwota VAT" required error={errors.vatAmount}>
            <Input
              inputMode="decimal"
              value={form.vatAmount}
              onChange={(event) => onAmountChange("vatAmount", event.target.value)}
              placeholder="0,00"
              className="tnum text-right"
              invalid={Boolean(errors.vatAmount)}
            />
          </Field>
          <Field label="Kwota brutto" required error={errors.grossAmount}>
            <Input
              inputMode="decimal"
              value={form.grossAmount}
              onChange={(event) => update({ grossAmount: event.target.value })}
              placeholder="0,00"
              className="tnum text-right"
              invalid={Boolean(errors.grossAmount)}
            />
          </Field>
          <Field label="Waluta">
            <Select value={form.currency} onChange={(event) => update({ currency: event.target.value })}>
              <option value="PLN">PLN</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Rachunek do zapłaty"
            hint="Podpowiadany z kartoteki kontrahenta."
            error={errors.paymentAccount}
          >
            <Input
              value={form.paymentAccount}
              onChange={(event) => update({ paymentAccount: event.target.value })}
              placeholder="PL00 0000 0000 0000 0000 0000 0000"
              className="tnum font-mono text-[12.5px]"
              invalid={Boolean(errors.paymentAccount)}
            />
          </Field>
          <Field label="Kategoria" hint="Puste pole = reguła kontrahent → kategoria przypisze ją automatycznie.">
            <Select value={form.categoryId} onChange={(event) => update({ categoryId: event.target.value })}>
              <option value="">— bez kategorii —</option>
              {categoryOptions.map((node) => (
                <option key={node.id} value={node.id}>
                  {`${"  ".repeat(node.depth)}${node.depth > 0 ? "└ " : ""}${node.name}`}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Uwagi">
          <Textarea
            rows={2}
            value={form.notes}
            onChange={(event) => update({ notes: event.target.value })}
            placeholder="Opcjonalny opis, lokalizacja oryginału, ustalenia z kontrahentem…"
          />
        </Field>
      </div>
    </Modal>
  );
}
