"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Camera, FileUp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { imagesToPdf, MAX_PDF_BYTES } from "@/lib/image-pdf";

interface PageItem {
  id: string;
  file: File;
  previewUrl: string;
}

interface AttachmentPickerProps {
  /** Nombre del campo que recibe el servidor (siempre un solo archivo). */
  name?: string;
  /** Avisa cuando se está armando el PDF, para bloquear el botón de guardar. */
  onBusyChange?: (busy: boolean) => void;
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Adjunto de facturas/movimientos: se toman o eligen una o varias fotos, se
 * reducen y se juntan en UN solo PDF que viaja en el formulario. También
 * acepta un PDF ya hecho, que se sube tal cual.
 */
export function AttachmentPicker({ name = "file", onBusyChange }: AttachmentPickerProps) {
  const hiddenRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const filesRef = React.useRef<HTMLInputElement>(null);
  const runRef = React.useRef(0);

  const [pages, setPages] = React.useState<PageItem[]>([]);
  const [pdf, setPdf] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resultSize, setResultSize] = React.useState<number | null>(null);

  React.useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  function assign(file: File | null) {
    const input = hiddenRef.current;
    if (!input) return;
    const transfer = new DataTransfer();
    if (file) transfer.items.add(file);
    input.files = transfer.files;
  }

  // Cada vez que cambian las hojas se vuelve a armar el PDF único.
  React.useEffect(() => {
    if (pages.length === 0) {
      if (!pdf) {
        assign(null);
        setResultSize(null);
      }
      return;
    }
    const run = ++runRef.current;
    setBusy(true);
    setError(null);
    imagesToPdf(pages.map((page) => page.file))
      .then((blob) => {
        if (run !== runRef.current) return;
        if (blob.size > MAX_PDF_BYTES * 1.15) {
          setError("Las hojas pesan demasiado aun comprimidas. Quita algunas o sube menos páginas.");
          assign(null);
          setResultSize(null);
        } else {
          assign(new File([blob], `adjunto-${Date.now()}.pdf`, { type: "application/pdf" }));
          setResultSize(blob.size);
        }
        setBusy(false);
      })
      .catch((err: unknown) => {
        if (run !== runRef.current) return;
        assign(null);
        setResultSize(null);
        setBusy(false);
        setError(
          err instanceof Error
            ? `${err.message}. Si es una foto en formato HEIC, tómala de nuevo con la cámara o elige un JPG.`
            : "No se pudo procesar la imagen"
        );
      });
  }, [pages, pdf]);

  // Libera las vistas previas al desmontar.
  const pagesRef = React.useRef(pages);
  React.useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  React.useEffect(() => {
    return () => pagesRef.current.forEach((page) => URL.revokeObjectURL(page.previewUrl));
  }, []);

  function addImages(files: File[]) {
    setError(null);
    setPdf(null);
    setPages((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }

  function handleSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ""; // permite volver a elegir el mismo archivo
    if (files.length === 0) return;

    const pdfFile = files.find((file) => file.type === "application/pdf");
    if (pdfFile) {
      if (pdfFile.size > MAX_PDF_BYTES * 1.15) {
        setError(`El PDF pesa ${formatSize(pdfFile.size)}; el máximo es 4 MB.`);
        return;
      }
      pages.forEach((page) => URL.revokeObjectURL(page.previewUrl));
      setPages([]);
      setPdf(pdfFile);
      setError(
        files.length > 1 ? "Se usó solo el PDF. Para varias fotos, elígelas sin PDFs." : null
      );
      assign(pdfFile);
      setResultSize(pdfFile.size);
      return;
    }

    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) {
      setError("Elige fotos (JPG, PNG, WEBP) o un PDF.");
      return;
    }
    addImages(images);
  }

  function removePage(id: string) {
    setPages((prev) => {
      const target = prev.find((page) => page.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((page) => page.id !== id);
    });
  }

  function movePage(index: number, direction: -1 | 1) {
    setPages((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function clearPdf() {
    setPdf(null);
    assign(null);
    setResultSize(null);
  }

  const hasContent = pages.length > 0 || pdf !== null;

  return (
    <div className="flex flex-col gap-3">
      <input ref={hiddenRef} type="file" name={name} className="hidden" tabIndex={-1} />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleSelected}
      />
      <input
        ref={filesRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,application/pdf"
        className="hidden"
        onChange={handleSelected}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()}>
          <Camera className="h-4 w-4" />
          {pages.length > 0 ? "Agregar otra hoja" : "Tomar foto"}
        </Button>
        <Button type="button" variant="outline" onClick={() => filesRef.current?.click()}>
          <FileUp className="h-4 w-4" />
          Elegir archivos
        </Button>
      </div>

      {pages.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {pages.map((page, index) => (
            <div
              key={page.id}
              className="relative overflow-hidden rounded-[var(--radius-brand-sm)] border border-brand-border bg-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={page.previewUrl} alt={`Hoja ${index + 1}`} className="h-24 w-full object-cover" />
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white">
                {index + 1}
              </span>
              <button
                type="button"
                onClick={() => removePage(page.id)}
                aria-label={`Quitar hoja ${index + 1}`}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex justify-between border-t border-brand-border px-1 py-0.5">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => movePage(index, -1)}
                  aria-label="Mover antes"
                  className="p-0.5 text-brand-muted disabled:opacity-30"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={index === pages.length - 1}
                  onClick={() => movePage(index, 1)}
                  aria-label="Mover después"
                  className="p-0.5 text-brand-muted disabled:opacity-30"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pdf && (
        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-brand-sm)] border border-brand-border bg-white p-2 text-sm">
          <span className="truncate">{pdf.name}</span>
          <button
            type="button"
            onClick={clearPdf}
            aria-label="Quitar PDF"
            className="text-brand-muted hover:text-brand-danger"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <p className="text-xs text-brand-muted">
        {busy
          ? "Preparando el PDF..."
          : hasContent && resultSize !== null
            ? pages.length > 0
              ? `${pages.length} ${pages.length === 1 ? "hoja" : "hojas"} → 1 PDF de ${formatSize(resultSize)}`
              : `PDF de ${formatSize(resultSize)}`
            : "Toma una foto por hoja o elige fotos/PDF. Las fotos se juntan en un solo PDF liviano."}
      </p>
      {error && <p className="text-sm text-brand-danger">{error}</p>}
    </div>
  );
}
