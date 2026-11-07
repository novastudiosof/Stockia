"use client";

import * as React from "react";
import { Loader2, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getInvoiceShareLink } from "@/lib/actions/ventas-productos";
import { normalizeWhatsappNumber } from "@/lib/invoice-client";

interface WhatsappInvoiceButtonProps {
  saleId: string;
  /** Número del cliente (registrado o escrito al vender). */
  phone?: string | null;
  size?: "default" | "sm";
  display?: "button" | "icon";
}

/**
 * Abre de una vez el chat de WhatsApp del cliente con el mensaje listo y el
 * enlace a su factura. WhatsApp no permite adjuntar un archivo desde un
 * enlace, así que la factura va como enlace público (se abre sin cuenta y
 * se puede guardar como PDF).
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

    // La pestaña se abre ya, dentro del clic, para que el navegador no la
    // bloquee; después se le pone la dirección cuando el enlace esté listo.
    const popup = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const share = await getInvoiceShareLink(saleId);
      if (share.error || !share.url) {
        popup?.close();
        setError(share.error ?? "No se pudo preparar el enlace");
        return;
      }

      const text =
        `Hola, adjunto la factura de tu compra.\n` +
        `Somos ${share.orgName ?? "tu tienda"}.\n` +
        share.url;
      const target = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

      if (popup) popup.location.href = target;
      else window.location.href = target;
    } catch {
      popup?.close();
      setError("No se pudo abrir WhatsApp");
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
