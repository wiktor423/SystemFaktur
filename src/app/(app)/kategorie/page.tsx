"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  FolderTree,
  Pencil,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { EmptyState, Meter, Panel, PanelHeader } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useAppData } from "@/lib/data/store";
import { buildCategoryTree, flattenCategoryTree, type CategoryNode } from "@/lib/data/queries";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Kategorie kosztów w strukturze drzewa oraz reguły automatycznego przypisania.
 * Reguła jest atrybutem kontrahenta (`defaultCategoryId`), więc obowiązuje
 * jednakowo dla importu z KSeF, uploadu i dodania ręcznego.
 */
export default function CategoriesPage() {
  const { state, addCategory, updateCategory, deleteCategory, upsertCounterparty } = useAppData();
  const toast = useToast();

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newRootName, setNewRootName] = useState("");
  const [childParentId, setChildParentId] = useState<string | null>(null);
  const [childName, setChildName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<CategoryNode | null>(null);
  const [ruleQuery, setRuleQuery] = useState("");

  const tree = useMemo(
    () => buildCategoryTree(state.categories, state.usage.byCategory),
    [state.categories, state.usage.byCategory],
  );

  const flat = useMemo(() => flattenCategoryTree(tree), [tree]);
  const maxAmount = useMemo(() => Math.max(1, ...tree.map((node) => node.totalAmount)), [tree]);
  const uncategorized = state.usage.uncategorized;

  const toggleCollapse = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitRoot = async () => {
    const result = await addCategory(newRootName, null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setNewRootName("");
    toast.success(result.message);
  };

  const submitChild = async () => {
    if (!childParentId) return;
    const result = await addCategory(childName, childParentId);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setChildName("");
    setChildParentId(null);
    toast.success(result.message);
  };

  const counterpartiesWithRules = useMemo(() => {
    const needle = ruleQuery.trim().toLowerCase();
    return [...state.counterparties]
      .sort((left, right) => left.name.localeCompare(right.name, "pl"))
      .filter((counterparty) => !needle || counterparty.name.toLowerCase().includes(needle));
  }, [state.counterparties, ruleQuery]);

  const ruleCount = state.counterparties.filter((item) => item.defaultCategoryId).length;

  const renderNode = (node: CategoryNode) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);

    return (
      <li key={node.id}>
        <div
          className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
          style={{ paddingLeft: `${node.depth * 1.25 + 0.5}rem` }}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggleCollapse(node.id)}
            aria-label={hasChildren ? (isCollapsed ? "Rozwiń" : "Zwiń") : undefined}
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded text-fg-subtle transition-colors",
              hasChildren ? "hover:bg-surface-3 hover:text-fg" : "opacity-0",
            )}
          >
            {isCollapsed ? <ChevronRight className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
          </button>

          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: node.color ?? "var(--color-border-strong)" }}
            aria-hidden
          />

          <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", node.depth === 0 ? "font-medium text-fg" : "text-fg")}>
            {node.name}
          </span>

          <div className="hidden w-40 shrink-0 items-center gap-2 sm:flex">
            <Meter value={(node.totalAmount / maxAmount) * 100} />
          </div>

          <span className="tnum w-28 shrink-0 text-right text-[12.5px] text-fg-muted">
            {node.totalAmount > 0 ? formatAmount(node.totalAmount) : "—"}
          </span>

          <span className="tnum w-12 shrink-0 text-right text-[12.5px] text-fg-subtle">{node.totalCount}</span>

          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={() => setChildParentId(node.id)}
              title="Dodaj podkategorię"
              className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
            >
              <FolderPlus className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setRenaming({ id: node.id, name: node.name })}
              title="Zmień nazwę"
              className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setDeleting(node)}
              title="Usuń kategorię"
              className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>

        {childParentId === node.id ? (
          <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: `${(node.depth + 1) * 1.25 + 2.1}rem` }}>
            <Input
              autoFocus
              value={childName}
              onChange={(event) => setChildName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitChild();
                if (event.key === "Escape") setChildParentId(null);
              }}
              placeholder={`Podkategoria w „${node.name}”`}
              className="h-8 max-w-72 text-[13px]"
            />
            <Button size="sm" variant="primary" onClick={submitChild}>
              Dodaj
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChildParentId(null)}>
              Anuluj
            </Button>
          </div>
        ) : null}

        {hasChildren && !isCollapsed ? <ul>{node.children.map(renderNode)}</ul> : null}
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Kategorie"
        description="Struktura kategorii kosztów i przychodów oraz reguły automatycznego przypisania."
      />

      <div className="scroll-slim flex-1 overflow-y-auto p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Panel padded={false}>
            <PanelHeader
              title="Drzewo kategorii"
              description={`${state.categories.length} kategorii · ${uncategorized} dokumentów bez przypisania`}
              actions={
                <div className="flex items-center gap-2">
                  <Input
                    value={newRootName}
                    onChange={(event) => setNewRootName(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && submitRoot()}
                    placeholder="Nowa kategoria główna"
                    className="h-8 w-52 text-[13px]"
                  />
                  <Button size="sm" variant="primary" onClick={submitRoot} disabled={!newRootName.trim()}>
                    <Plus className="size-3.5" aria-hidden />
                    Dodaj
                  </Button>
                </div>
              }
            />

            {tree.length === 0 ? (
              <EmptyState
                icon={FolderTree}
                title="Brak kategorii"
                description="Dodaj pierwszą kategorię główną, a następnie rozbuduj ją o podkategorie."
              />
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-border px-4 py-1.5 text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
                  <span className="min-w-0 flex-1">Kategoria</span>
                  <span className="hidden w-40 sm:block">Udział</span>
                  <span className="w-28 text-right">Kwota brutto</span>
                  <span className="w-12 text-right">Dok.</span>
                  <span className="w-[6.5rem]" />
                </div>
                <ul className="p-2">{tree.map(renderNode)}</ul>
              </>
            )}
          </Panel>

          <Panel padded={false}>
            <PanelHeader
              title="Reguły automatyczne"
              description={`kontrahent → kategoria · ${ruleCount} z ${state.counterparties.length} kontrahentów`}
            />

            <div className="flex items-start gap-2.5 border-b border-border bg-accent-soft/50 px-4 py-2.5 text-[12.5px] leading-relaxed text-fg-muted">
              <Wand2 className="mt-px size-3.5 shrink-0 text-accent" aria-hidden />
              <p>
                Dokument bez własnej kategorii dostaje ją automatycznie z kartoteki kontrahenta — przy imporcie z
                KSeF, uploadzie i dodaniu ręcznym. Ręczny wybór kategorii zawsze ma pierwszeństwo.
              </p>
            </div>

            <div className="border-b border-border px-4 py-2">
              <Input
                value={ruleQuery}
                onChange={(event) => setRuleQuery(event.target.value)}
                placeholder="Szukaj kontrahenta…"
                className="h-8 text-[13px]"
              />
            </div>

            {/* Lista rośnie z zawartością — przewija się cała strona. Własny
                pasek przewijania w panelu ucinał ostatni wiersz w połowie
                i tworzył drugi, konkurencyjny obszar przewijania. */}
            <ul className="divide-y divide-border">
              {counterpartiesWithRules.map((counterparty) => (
                <li key={counterparty.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{counterparty.name}</span>
                  <Select
                    value={counterparty.defaultCategoryId ?? ""}
                    onChange={(event) =>
                      upsertCounterparty({
                        ...counterparty,
                        defaultCategoryId: event.target.value || null,
                      })
                    }
                    className="h-8 w-48 shrink-0 text-[12.5px]"
                    aria-label={`Kategoria domyślna dla ${counterparty.name}`}
                  >
                    <option value="">— brak reguły —</option>
                    {flat.map((node) => (
                      <option key={node.id} value={node.id}>
                        {`${"  ".repeat(node.depth)}${node.depth > 0 ? "└ " : ""}${node.name}`}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <Modal
        open={Boolean(renaming)}
        onClose={() => setRenaming(null)}
        size="sm"
        title="Zmień nazwę kategorii"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Anuluj
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!renaming?.name.trim()) return;
                updateCategory(renaming.id, { name: renaming.name.trim() });
                toast.success("Zmieniono nazwę kategorii.");
                setRenaming(null);
              }}
            >
              Zapisz
            </Button>
          </>
        }
      >
        <Input
          autoFocus
          value={renaming?.name ?? ""}
          onChange={(event) => setRenaming((current) => (current ? { ...current, name: event.target.value } : null))}
        />
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        size="sm"
        title={`Usunąć kategorię „${deleting?.name ?? ""}”?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Anuluj
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!deleting) return;
                deleteCategory(deleting.id);
                toast.success(`Usunięto kategorię „${deleting.name}”.`);
                setDeleting(null);
              }}
            >
              Usuń kategorię
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-fg-muted">
          {deleting && deleting.children.length > 0
            ? `Podkategorie (${deleting.children.length}) zostaną przeniesione o poziom wyżej. `
            : ""}
          {deleting && deleting.directCount > 0
            ? `${deleting.directCount} ${deleting.directCount === 1 ? "dokument straci" : "dokumentów straci"} przypisanie do tej kategorii. `
            : ""}
          Reguły automatyczne wskazujące tę kategorię zostaną wyczyszczone. Dokumenty nie zostaną usunięte.
        </p>
      </Modal>
    </>
  );
}
