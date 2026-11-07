"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildInvoicePdf, downloadBlob } from "@/lib/invoice-client";

interface DownloadInvoiceButtonProps {
  saleId: string;
  widthMm?: 58 | 80;
  /** "icon" para filas de tabla; "button" muestra el texto. */
  display?: "button" | "icon";
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
}

/**
 * Descarga la factura de una venta como PDF en el equipo desde el que se
 * pulsa (celular, tablet o computador). El PDF se arma en el navegador.
 */
export function DownloadInvoiceButton({
  saleId,
  widthMm = 80,
  display = "button",
  variant = "outline",
  size = "default",
}: DownloadInvoiceButtonProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDownload() {
    setBusy(true);
    setError(null);
    try {
      const invoice = await buildInvoicePdf(saleId, widthMm);
      if ("error" in invoice) {
        setError(invoice.error);
        return;
      }
      downloadBlob(invoice.blob, invoice.fileName);
    } catch {
      setError("No se pudo generar el PDF");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {display === "icon" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleDownload}
          disabled={busy}
          aria-label="Descargar factura en PDF"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </Button>
      ) : (
        <Button type="button" variant={variant} size={size} onClick={handleDownload} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Descargar PDF
        </Button>
      )}
      {error && <span className="text-xs text-brand-danger">{error}</span>}
    </>
  );
}
