"use client";

import { useState } from "react";
import { ExternalLink, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/format";

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300];

/**
 * Podgląd PDF renderowany przez wbudowaną przeglądarkę dokumentów.
 * Zapewnia przewijanie stron i powiększenie bez pobierania pliku na dysk.
 *
 * Docelowo warto zastąpić to `react-pdf` (pdf.js), żeby mieć własny pasek
 * narzędzi, miniatury stron i wyszukiwanie w treści niezależnie od przeglądarki.
 */
export function PdfViewer({ url, filename, size }: { url: string; filename: string; size: number }) {
  const [zoomIndex, setZoomIndex] = useState(2);
  const zoom = ZOOM_STEPS[zoomIndex];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[12.5px] font-medium text-fg">{filename}</span>
          <span className="shrink-0 text-[11.5px] text-fg-subtle">{formatFileSize(size)}</span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Pomniejsz"
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
          >
            <Minus className="size-3.5" aria-hidden />
          </Button>
          <span className="tnum w-12 text-center text-[12.5px] text-fg-muted">{zoom}%</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Powiększ"
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            onClick={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))}
          >
            <Plus className="size-3.5" aria-hidden />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Powiększenie domyślne" onClick={() => setZoomIndex(2)}>
            <RotateCcw className="size-3.5" aria-hidden />
          </Button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            title="Otwórz w nowej karcie"
            className="ml-1 rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
          >
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-surface-3">
        {/* Zmiana klucza wymusza przeładowanie widoku po zmianie powiększenia. */}
        <iframe
          key={zoom}
          src={`${url}#zoom=${zoom}&view=FitH&toolbar=0`}
          title={`Podgląd dokumentu ${filename}`}
          className="size-full border-0"
        />
      </div>
    </div>
  );
}
