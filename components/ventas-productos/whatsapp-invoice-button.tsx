"use client";

import * as React from "react";
import { Loader2, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildInvoicePdf, downloadBlob, normalizeWhatsappNumber } from "@/lib/invoice-client";

interface WhatsappInvoiceButtonProps {
  saleId: string;
  /** Número del cliente (registrado o escrito al vender). */
  phone?: string | null;
  size?: "default" | "sm";
  display?: "button" | "icon";
}

/**
 * Envía la factura por WhatsApp al número del cliente. En celulares con
 * soporte comparte el PDF directamente; si no, descarga el PDF y abre el chat
 * de WhatsApp con el mensaje listo (un enlace de WhatsApp no puede adjuntar
 * archivos, así que ahí solo falta adjuntar el PDF descargado).
 */
export function WhatsappInvoiceButton({
  saleId,
  phone,
  size = "default",
  display = "button",
}: WhatsappInvoiceButtonProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSend() {
    setError(null);
    let number = normalizeWhatsappNumber(phone);
    if (!number) {
      const typed = window.prompt(
        "No hay un número de WhatsApp válido para este cliente. Escríbelo (ej: 3001234567):"
      );
      if (!typed) return;
      number = normalizeWhatsappNumber(typed);
      if (!number) {
        setError("El número de WhatsApp no es válido");
        return;
      }
    }

    setBusy(true);
    try {
      const invoice = await buildInvoicePdf(saleId);
      if ("error" in invoice) {
        setError(invoice.error);
        return;
      }

      const greeting =
        invoice.customerName === "Consumidor final" ? "Hola" : `Hola ${invoice.customerName}`;
      const text =
        `${greeting}, gracias por tu compra en ${invoice.orgName}. ` +
        `Factura ${invoice.invoiceNumber} por ${invoice.totalText}.`;

      const file = new File([invoice.blob], invoice.fileName, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text });
          return;
        } catch (shareError) {
          if ((shareError as Error).name === "AbortError") return;
        }
      }

      downloadBlob(invoice.blob, invoice.fileName);
      window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    } catch {
      setError("No se pudo preparar el envío por WhatsApp");
    } finally {
      setBusy(false);
    }
  }

  const icon = busy ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <MessageCircle className="h-4 w-4 text-[#25D366]" />
  );

  return (
    <>
      {display === "icon" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleSend}
          disabled={busy}
          aria-label="Enviar factura por WhatsApp"
        >
          {icon}
        </Button>
      ) : (
        <Button type="button" variant="outline" size={size} onClick={handleSend} disabled={busy}>
          {icon}
          WhatsApp
        </Button>
      )}
      {error && <span className="text-xs text-brand-danger">{error}</span>}
    </>
  );
}
