"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileText, FileUp, TriangleAlert, Upload, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAppData, type UploadResult } from "@/lib/data/store";
import type { Attachment, InvoiceDocument } from "@/lib/domain/types";
import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Wgrywanie faktur spoza KSeF.
 *
 * XML w schemacie FA(2)/FA(3) jest parsowany i zasila dokument automatycznie.
 * PDF nie niesie danych ustrukturyzowanych, więc plik zostaje załącznikiem, a
 * pola uzupełnia użytkownik w formularzu — dlatego wybór PDF przekazujemy dalej
 * przez `onPdfSelected`, zamiast tworzyć niekompletny dokument.
 */
export function UploadModal({
  open,
  onClose,
  onPdfSelected,
}: {
  open: boolean;
  onClose: () => void;
  onPdfSelected: (attachment: Attachment, stage: InvoiceDocument["stage"]) => void;
}) {
  const { uploadFiles } = useAppData();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<InvoiceDocument["stage"]>("buffer");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    // PDF obsługujemy poza tą listą — wymaga uzupełnienia danych w formularzu.
    const pdf = files.find((file) => file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf");
    const rest = files.filter((file) => file !== pdf);

    if (rest.length > 0) {
      setBusy(true);
      const uploadResults = await uploadFiles(rest, stage);
      setBusy(false);
      setResults((current) => [...current, ...uploadResults]);

      const added = uploadResults.filter((result) => result.ok).length;
      const failed = uploadResults.length - added;
      if (added > 0) {
        toast.success(
          `Wczytano ${added} ${added === 1 ? "plik" : "plików"}`,
          stage === "buffer" ? "Dokumenty czekają w buforze na akceptację." : "Dokumenty trafiły od razu do rejestru.",
        );
      }
      if (failed > 0) {
        toast.error(`${failed} ${failed === 1 ? "plik odrzucony" : "plików odrzuconych"}`, "Szczegóły w oknie wgrywania.");
      }
    }

    if (pdf) {
      onPdfSelected(
        {
          kind: "pdf",
          filename: pdf.name,
          size: pdf.size,
          url: URL.createObjectURL(pdf),
        },
        stage,
      );
      close();
    }
  };

  const close = () => {
    setResults([]);
    setDragging(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Wgraj fakturę spoza KSeF"
      description="Faktury zagraniczne, dokumenty papierowe, noty — wszystko, czego nie ma w KSeF."
      footer={
        <Button variant="secondary" onClick={close}>
          Zamknij
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg-muted">Gdzie umieścić dokument</span>
          <SegmentedControl
            value={stage}
            onChange={setStage}
            options={[
              { value: "buffer", label: "Do bufora (zalecane)" },
              { value: "registered", label: "Wprost do rejestru" },
            ]}
          />
          <p className="text-[12.5px] leading-relaxed text-fg-subtle">
            Domyślnie plik trafia do bufora — ta sama ścieżka co dla faktur z KSeF, więc każdy dokument
            przechodzi przez jedną akceptację, niezależnie od źródła.
          </p>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleFiles(event.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors",
            dragging ? "border-accent bg-accent-soft" : "border-border-strong bg-surface-2/50",
          )}
        >
          <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-fg-subtle">
            <Upload className="size-4.5" aria-hidden />
          </div>
          <p className="text-[13.5px] font-medium text-fg">Przeciągnij pliki albo wybierz z dysku</p>
          <p className="max-w-sm text-[12.5px] leading-relaxed text-fg-muted">
            Obsługiwane formaty: <strong className="font-medium">XML</strong> w schemacie KSeF FA(2)/FA(3)
            (dane wczytają się automatycznie) oraz <strong className="font-medium">PDF</strong> jako załącznik.
          </p>
          <Button variant="secondary" loading={busy} onClick={() => inputRef.current?.click()}>
            <FileUp className="size-4" aria-hidden />
            Wybierz pliki
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.xml,application/pdf,application/xml,text/xml"
            className="hidden"
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        {results.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {results.map((result, index) => (
              <li
                key={`${result.filename}-${index}`}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border px-3 py-2",
                  result.ok ? "border-success-border bg-success-soft" : "border-danger-border bg-danger-soft",
                )}
              >
                {result.ok ? (
                  <CheckCircle2 className="mt-px size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <TriangleAlert className="mt-px size-4 shrink-0 text-danger" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-fg">{result.filename}</p>
                  <p className={cn("text-[12.5px] leading-snug", result.ok ? "text-success" : "text-danger")}>
                    {result.message}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Usuń z listy"
                  onClick={() => setResults((current) => current.filter((_, position) => position !== index))}
                  className="rounded p-0.5 text-fg-subtle transition-colors hover:text-fg"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex gap-2.5 rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-[12.5px] leading-relaxed text-fg-muted">
          <FileText className="mt-px size-4 shrink-0" aria-hidden />
          <p>
            Nie masz pliku pod ręką? Przykładowa faktura FA(2) do testu leży w repozytorium pod{" "}
            <code className="rounded bg-surface-3 px-1 font-mono text-[11.5px]">public/sample/faktura-ksef-fa2.xml</code>{" "}
            ({formatFileSize(5200)}).
          </p>
        </div>
      </div>
    </Modal>
  );
}
