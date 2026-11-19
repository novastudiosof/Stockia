"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, FilePlus, Minus, Plus, Search, ShoppingCart, Tag, Trash2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSale } from "@/lib/actions/ventas-productos";
import { DownloadInvoiceButton } from "@/components/ventas-productos/download-invoice-button";
import { WhatsappInvoiceButton } from "@/components/ventas-productos/whatsapp-invoice-button";
import { searchClientes } from "@/lib/actions/clientes";
import { getCustomerCredit, type CustomerCredit } from "@/lib/actions/cartera";
import type { PaymentSettings } from "@/lib/payments";
import {
  deleteSaleDraft,
  listSaleDrafts,
  saveSaleDraft,
  takeSaleDraft,
  transferSaleDraft,
} from "@/lib/actions/borradores";
import type {
  Cliente,
  DraftDiscount,
  PaymentInput,
  PaymentMethod,
  Product,
  SaleDraft,
  SaleDraftState,
  TransferChannel,
} from "@/lib/supabase/types";

import { computeLineTax, summarizeTaxes, type TaxSettings } from "@/lib/tax";
import { computeSaleTotals, discountPct, type DiscountInput } from "@/lib/discounts";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

interface CartLine {
  product: Product;
  quantity: number;
  /** Descuento de la línea (el valor se guarda como texto del campo). */
  discount?: DraftDiscount | null;
}

/** Descuento escrito en pantalla -> descuento para el cálculo (vacío = ninguno). */
function toDiscount(d: DraftDiscount | null | undefined): DiscountInput | null {
  const value = Number(d?.value);
  return d && value > 0 ? { type: d.type, value } : null;
}

interface SaleCartProps {
  products: Product[];
  /** Categorías del negocio, para filtrar los productos. */
  categories: { id: string; name: string }[];
  /** Si el módulo Clientes no está activo, solo se vende a "Consumidor final". */
  clientesEnabled: boolean;
  /** Ventas en espera de la organización (las ven todos los usuarios). */
  initialDrafts: SaleDraft[];
  currentUserId: string;
  isAdmin: boolean;
  /** Usuarios del negocio, para pasarse una venta en espera. */
  teammates: { id: string; full_name: string }[];
  /** Impuestos del negocio (apagados por defecto). */
  taxSettings: TaxSettings;
  /** Medios de pago activos del negocio. */
  paymentSettings: PaymentSettings;
  /** Descuento máximo que puede dar un auxiliar (% de la venta). */
  maxDiscountPct: number;
}

type PayMethod = PaymentMethod;

const CHANNEL_LABEL: Record<TransferChannel, string> = {
  nequi: "Nequi",
  daviplata: "Daviplata",
  llave: "Llave",
};

const CHANNELS: TransferChannel[] = ["nequi", "daviplata", "llave"];

type MixedKey = "efectivo" | "nequi" | "daviplata" | "llave" | "tarjeta" | "otro" | "credito";

type CustomerMode = "none" | "existing" | "new";

const CUSTOMER_MODE_LABEL: Record<CustomerMode, string> = {
  none: "Consumidor final",
  existing: "Cliente existente",
  new: "Cliente nuevo",
};

const EMPTY_NEW_CUSTOMER = { nombre: "", documento: "", telefono: "", direccion: "" };
const EMPTY_MIXED: Record<MixedKey, string> = {
  efectivo: "",
  nequi: "",
  daviplata: "",
  llave: "",
  tarjeta: "",
  otro: "",
  credito: "",
};

const dueFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

export function SaleCart({
  products,
  categories,
  clientesEnabled,
  initialDrafts,
  currentUserId,
  isAdmin,
  teammates,
  taxSettings,
  paymentSettings,
  maxDiscountPct,
}: SaleCartProps) {
  const router = useRouter();
  const enabled = paymentSettings.methods;
  const channels = CHANNELS.filter((c) => enabled.includes(c));
  const creditEnabled = enabled.includes("credito") && clientesEnabled;
  // Botones de método de pago según lo que el negocio tiene activo.
  const payMethods: { key: PayMethod; label: string }[] = [
    { key: "efectivo", label: "Efectivo" },
    ...(channels.length > 0 ? [{ key: "transferencia" as const, label: "Transferencia" }] : []),
    ...(enabled.includes("tarjeta") ? [{ key: "tarjeta" as const, label: "Tarjeta" }] : []),
    ...(enabled.includes("otro") ? [{ key: "otro" as const, label: paymentSettings.otherLabel }] : []),
    ...(creditEnabled ? [{ key: "credito" as const, label: "Fiado" }] : []),
  ];
  if (payMethods.length > 1) payMethods.push({ key: "mixto", label: "Mixto" });
  // Filas del pago mixto (efectivo siempre).
  const mixedRows: { key: MixedKey; label: string }[] = [
    { key: "efectivo", label: "Efectivo" },
    ...channels.map((c) => ({ key: c as MixedKey, label: CHANNEL_LABEL[c] })),
    ...(enabled.includes("tarjeta") ? [{ key: "tarjeta" as const, label: "Tarjeta" }] : []),
    ...(enabled.includes("otro") ? [{ key: "otro" as const, label: paymentSettings.otherLabel }] : []),
    ...(creditEnabled ? [{ key: "credito" as const, label: "Fiado" }] : []),
  ];
  const [search, setSearch] = React.useState("");
  // Categoría elegida ("all" = todas). Solo filtra la lista; el carrito no cambia.
  const [categoryId, setCategoryId] = React.useState<string>("all");
  // En celular el panel de la venta es una hoja que sube desde abajo.
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [cart, setCart] = React.useState<Record<string, CartLine>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [lastSaleId, setLastSaleId] = React.useState<string | null>(null);
  const [lastSalePhone, setLastSalePhone] = React.useState<string | null>(null);

  const [customerMode, setCustomerMode] = React.useState<CustomerMode>("none");
  const [customerQuery, setCustomerQuery] = React.useState("");
  const [customerResults, setCustomerResults] = React.useState<Cliente[]>([]);
  const [selectedCustomer, setSelectedCustomer] = React.useState<Cliente | null>(null);
  const [newCustomer, setNewCustomer] = React.useState({
    nombre: "",
    documento: "",
    telefono: "",
    direccion: "",
  });

  const [customerEmail, setCustomerEmail] = React.useState("");
  // WhatsApp del consumidor final (no registrado) para enviarle la factura.
  const [whatsapp, setWhatsapp] = React.useState("");
  const [cashReceived, setCashReceived] = React.useState("");
  // Última búsqueda terminada, para saber si el cliente escrito no existe.
  const [searchedQuery, setSearchedQuery] = React.useState<string | null>(null);
  const [payMethod, setPayMethod] = React.useState<PayMethod>("efectivo");
  const [channel, setChannel] = React.useState<TransferChannel>(channels[0] ?? "nequi");
  const [mixed, setMixed] = React.useState<Record<MixedKey, string>>({ ...EMPTY_MIXED });
  // Deuda y cupo del cliente elegido, para mostrarlos al fiar.
  const [credit, setCredit] = React.useState<CustomerCredit | null>(null);
  // Descuento a toda la venta y qué líneas tienen abierto su campo de descuento.
  const [globalDiscount, setGlobalDiscount] = React.useState<DraftDiscount | null>(null);
  const [discountOpen, setDiscountOpen] = React.useState<Record<string, boolean>>({});

  // Venta en espera (borrador): se guarda en la base de datos; la ven todos
  // los usuarios del negocio pero solo la edita su responsable.
  const [drafts, setDrafts] = React.useState<SaleDraft[]>(initialDrafts);
  const [draftId, setDraftId] = React.useState<string | null>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const [draftSaving, setDraftSaving] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [transferring, setTransferring] = React.useState(false);
  const draftIdRef = React.useRef<string | null>(null);
  const saveChainRef = React.useRef<Promise<unknown>>(Promise.resolve());
  const initialDraftsRef = React.useRef(initialDrafts);

  const term = search.toLowerCase();
  const filtered = products.filter(
    (p) =>
      (categoryId === "all" || p.category_id === categoryId) &&
      (p.name.toLowerCase().includes(term) || (p.barcode ?? "").toLowerCase().includes(term))
  );
  // Solo se ofrecen las categorías que tienen productos.
  const visibleCategories = categories.filter((c) => products.some((p) => p.category_id === c.id));

  const lines = Object.values(cart);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  // Mismo cálculo que create_sale() en la base de datos (que es el oficial),
  // con los descuentos por producto y a toda la venta.
  const totals = computeSaleTotals(
    lines.map((line) => ({
      unitPrice: line.product.sale_price,
      quantity: line.quantity,
      taxRate: line.product.tax_rate,
      taxKind: line.product.tax_kind,
      discount: toDiscount(line.discount),
    })),
    taxSettings,
    toDiscount(globalDiscount)
  );
  const lineTaxes = totals.lines;
  const total = totals.total;
  const taxTotal = totals.taxTotal;
  const taxRows = summarizeTaxes(
    lineTaxes.map((t) => ({ taxKind: t.taxKind, taxRate: t.rate, base: t.base, tax: t.tax }))
  );
  const discountPercent = discountPct(totals);
  const overDiscountCap = !isAdmin && discountPercent > maxDiscountPct + 0.001;
  const mixedValue = (key: MixedKey) =>
    mixedRows.some((row) => row.key === key) ? Number(mixed[key]) || 0 : 0;
  const mixedSum = mixedRows.reduce((sum, row) => sum + mixedValue(row.key), 0);
  const mixedRemaining = total - mixedSum;
  // Lo que queda fiado con este pago.
  const creditAmount =
    payMethod === "credito" ? total : payMethod === "mixto" ? mixedValue("credito") : 0;
  const creditDue = (() => {
    const days = selectedCustomer?.credit_days ?? paymentSettings.defaultCreditDays;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return dueFormat.format(d);
  })();
  const cashReceivedNumber = Number(cashReceived) || 0;
  const cashChange = cashReceivedNumber - total;

  const trimmedQuery = customerQuery.trim();
  const customerNotFound =
    customerMode === "existing" &&
    !selectedCustomer &&
    trimmedQuery.length >= 2 &&
    searchedQuery === trimmedQuery &&
    customerResults.length === 0;

  React.useEffect(() => {
    if (customerMode !== "existing" || selectedCustomer) {
      setCustomerResults([]);
      return;
    }
    const trimmed = customerQuery.trim();
    if (trimmed.length < 2) {
      setCustomerResults([]);
      setSearchedQuery(null);
      return;
    }
    const timeout = setTimeout(() => {
      searchClientes(trimmed).then(({ results }) => {
        setCustomerResults(results);
        setSearchedQuery(trimmed);
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [customerQuery, customerMode, selectedCustomer]);

  // Al fiar a un cliente registrado se consulta cuánto debe y su cupo.
  const selectedCustomerId = selectedCustomer?.id ?? null;
  const isCredit = creditAmount > 0;
  React.useEffect(() => {
    setCredit(null);
    if (!selectedCustomerId || !isCredit) return;
    let cancelled = false;
    getCustomerCredit(selectedCustomerId).then((result) => {
      if (!cancelled) setCredit(result);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId, isCredit]);

  // Si lo escrito no existe, se prepara el alta automática: lo que parece un
  // documento (solo números) va a Documento y el resto a Nombre.
  React.useEffect(() => {
    if (!customerNotFound) return;
    const looksLikeDocument = /^[\d.\s-]+$/.test(trimmedQuery);
    setNewCustomer((c) =>
      looksLikeDocument ? { ...c, documento: trimmedQuery } : { ...c, nombre: trimmedQuery }
    );
  }, [customerNotFound, trimmedQuery]);

  // Hoja de la venta en celular: Escape la cierra y el fondo no se desplaza.
  React.useEffect(() => {
    if (!sheetOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  function selectCustomerMode(mode: CustomerMode) {
    setCustomerMode(mode);
    setSearchedQuery(null);
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerResults([]);
  }

  function addToCart(product: Product) {
    setError(null);
    setSuccess(null);
    setLastSaleId(null);
    setCart((prev) => {
      const existing = prev[product.id];
      const nextQty = (existing?.quantity ?? 0) + 1;
      if (nextQty > product.quantity) return prev;
      return { ...prev, [product.id]: { ...existing, product, quantity: nextQty } };
    });
  }

  function setLineDiscount(productId: string, discount: DraftDiscount | null) {
    setCart((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      return { ...prev, [productId]: { ...existing, discount } };
    });
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        const rest = { ...prev };
        delete rest[productId];
        return rest;
      }
      if (nextQty > existing.product.quantity) return prev;
      return { ...prev, [productId]: { ...existing, quantity: nextQty } };
    });
  }

  function removeLine(productId: string) {
    setCart((prev) => {
      const rest = { ...prev };
      delete rest[productId];
      return rest;
    });
  }

  function applyDraft(draft: SaleDraft) {
    const state = draft.state;
    const nextCart: Record<string, CartLine> = {};
    for (const line of state.lines) {
      const product = products.find((p) => p.id === line.productId);
      if (!product || product.quantity <= 0) continue;
      nextCart[product.id] = {
        product,
        quantity: Math.min(line.quantity, product.quantity),
        discount: line.discount ?? null,
      };
    }
    setCart(nextCart);
    setGlobalDiscount(state.globalDiscount ?? null);
    setDiscountOpen(
      Object.fromEntries(state.lines.filter((l) => l.discount).map((l) => [l.productId, true]))
    );
    setCustomerMode(state.customerMode);
    setSelectedCustomer(state.selectedCustomer);
    setCustomerQuery(state.selectedCustomer?.nombre ?? "");
    setSearchedQuery(null);
    setCustomerResults([]);
    setNewCustomer({ ...EMPTY_NEW_CUSTOMER, ...state.newCustomer });
    setCustomerEmail(state.customerEmail);
    setWhatsapp(state.whatsapp);
    setCashReceived(state.cashReceived);
    // Si el medio ya no está activo, la venta en espera vuelve a efectivo.
    setPayMethod(payMethods.some((m) => m.key === state.payMethod) ? state.payMethod : "efectivo");
    setChannel(channels.includes(state.channel) ? state.channel : (channels[0] ?? "nequi"));
    setMixed({ ...EMPTY_MIXED, ...state.mixed });
    setError(null);
    setSuccess(null);
    setLastSaleId(null);
    draftIdRef.current = draft.id;
    setDraftId(draft.id);
  }

  function resetSaleForm() {
    setCart({});
    setGlobalDiscount(null);
    setDiscountOpen({});
    setCustomerEmail("");
    setWhatsapp("");
    setCashReceived("");
    setPayMethod("efectivo");
    setChannel(channels[0] ?? "nequi");
    setMixed({ ...EMPTY_MIXED });
    selectCustomerMode("none");
    setNewCustomer({ ...EMPTY_NEW_CUSTOMER });
  }

  function detachDraft() {
    draftIdRef.current = null;
    setDraftId(null);
    setDraftSaving("idle");
    resetSaleForm();
  }

  /** La venta que estaba abierta aquí ya no es de este usuario (la terminaron, descartaron o pasaron). */
  function handleDraftLost(message: string) {
    detachDraft();
    setSuccess(null);
    setError(message);
  }

  /** Deja la venta en espera guardada y empieza una venta limpia. */
  function startNewSale() {
    detachDraft();
    setError(null);
    setSuccess(null);
    setLastSaleId(null);
  }

  async function discardDraft(id: string) {
    await deleteSaleDraft(id);
    if (draftIdRef.current === id) detachDraft();
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  async function passDraft(id: string, toUserId: string) {
    const target = teammates.find((t) => t.id === toUserId);
    if (!target) return;
    setTransferring(true);
    setError(null);
    if (draftIdRef.current === id) await saveChainRef.current;
    const result = await transferSaleDraft(id, toUserId);
    setTransferring(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (draftIdRef.current === id) detachDraft();
    setSuccess("Venta pasada a " + target.full_name + ". Ya puede continuarla desde Ventas por Productos.");
    setDrafts(await listSaleDrafts());
  }

  async function takeDraft(id: string) {
    const result = await takeSaleDraft(id);
    if (result.error || !result.draft) {
      setError(result.error ?? "No se pudo tomar la venta");
      return;
    }
    applyDraft(result.draft);
    setDrafts(await listSaleDrafts());
  }

  async function handleConfirm() {
    if (lines.length === 0) return;
    if (totals.error) {
      setError(totals.error);
      return;
    }
    if (overDiscountCap) {
      setError(
        `El descuento (${discountPercent.toFixed(1)}%) supera el máximo permitido para auxiliares (${maxDiscountPct}%)`
      );
      return;
    }
    if (customerMode === "new" && !newCustomer.nombre.trim()) {
      setError("Ingresa el nombre del cliente");
      return;
    }
    if (customerMode === "existing" && !selectedCustomer) {
      if (!customerNotFound) {
        setError("Selecciona un cliente de la lista, o cambia a Consumidor final / Cliente nuevo");
        return;
      }
      if (!newCustomer.nombre.trim()) {
        setError("Ese cliente no existe: escribe su nombre para crearlo con la venta");
        return;
      }
    }
    if (payMethod === "efectivo" && cashReceivedNumber > 0 && cashChange < 0) {
      setError(`El valor recibido es menor al total (faltan ${currency.format(-cashChange)})`);
      return;
    }

    if (payMethod === "mixto" && Math.abs(mixedRemaining) > 0.009) {
      setError(
        mixedRemaining > 0
          ? `Faltan ${currency.format(mixedRemaining)} por asignar en el pago mixto`
          : `El pago mixto se pasa por ${currency.format(-mixedRemaining)}`
      );
      return;
    }

    if (creditAmount > 0) {
      const hasCustomer =
        (customerMode === "existing" && (selectedCustomer || customerNotFound)) || customerMode === "new";
      if (!hasCustomer) {
        setError("Para fiar, elige el cliente (Cliente existente o Cliente nuevo)");
        return;
      }
      if (!isAdmin && !selectedCustomer) {
        setError("Solo el administrador puede fiarle a un cliente nuevo");
        return;
      }
      if (!isAdmin && selectedCustomer && credit) {
        if (credit.limit === null) {
          setError("Este cliente no tiene cupo de fiado; el administrador puede asignarlo en Clientes");
          return;
        }
        if (credit.debt + creditAmount > credit.limit + 0.009) {
          setError(
            `El fiado supera el cupo del cliente (disponible ${currency.format(
              Math.max(credit.limit - credit.debt, 0)
            )})`
          );
          return;
        }
      }
    }

    let payment: PaymentInput;
    if (payMethod === "transferencia") payment = { method: "transferencia", channel };
    else if (payMethod === "mixto") {
      payment = {
        method: "mixto",
        efectivo: mixedValue("efectivo"),
        nequi: mixedValue("nequi"),
        daviplata: mixedValue("daviplata"),
        llave: mixedValue("llave"),
        tarjeta: mixedValue("tarjeta"),
        otro: mixedValue("otro"),
        credito: mixedValue("credito"),
      };
    } else payment = { method: payMethod };

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const customer =
      customerMode === "existing" && selectedCustomer
        ? { id: selectedCustomer.id }
        : customerMode === "new" || customerNotFound
          ? { data: { ...newCustomer, email: customerEmail.trim() } }
          : undefined;

    // Número al que se podrá enviar la factura por WhatsApp.
    const salePhone =
      customerMode === "existing" && selectedCustomer
        ? selectedCustomer.telefono
        : customerMode === "none"
          ? whatsapp.trim()
          : newCustomer.telefono.trim();
    const changeText =
      payMethod === "efectivo" && cashReceivedNumber > 0 && cashChange >= 0
        ? ` · Devuelta: ${currency.format(cashChange)}`
        : "";

    const result = await createSale(
      lines.map((line) => {
        const d = toDiscount(line.discount);
        return {
          productId: line.product.id,
          quantity: line.quantity,
          ...(d ? { discountType: d.type, discountValue: d.value } : {}),
        };
      }),
      customer,
      payment,
      customerEmail.trim() || undefined,
      toDiscount(globalDiscount) ?? undefined
    );

    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }

    const creditText = creditAmount > 0 ? ` · Fiado: ${currency.format(creditAmount)}` : "";
    setSuccess(`Venta registrada por ${currency.format(result.total ?? 0)}${changeText}${creditText}`);
    setLastSaleId(result.saleId ?? null);
    setLastSalePhone(salePhone || null);
    // Espera a que termine cualquier guardado en curso y elimina la venta en
    // espera para que no reaparezca.
    const finishedDraftId = draftIdRef.current;
    draftIdRef.current = null;
    setDraftId(null);
    setDraftSaving("idle");
    resetSaleForm();
    if (finishedDraftId) {
      await saveChainRef.current;
      await deleteSaleDraft(finishedDraftId);
      setDrafts((prev) => prev.filter((d) => d.id !== finishedDraftId));
    }
    router.refresh();
  }

  // Al entrar a la pantalla se retoma la última venta en espera propia.
  React.useEffect(() => {
    const mine = initialDraftsRef.current.find((d) => d.assigned_to === currentUserId);
    if (mine) applyDraft(mine);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guardado automático (con pausa para no saturar la base).
  const draftState: SaleDraftState = {
    lines: lines.map((line) => ({
      productId: line.product.id,
      quantity: line.quantity,
      discount: line.discount ?? null,
    })),
    globalDiscount,
    customerMode,
    selectedCustomer,
    newCustomer,
    customerEmail,
    whatsapp,
    cashReceived,
    payMethod,
    channel,
    mixed,
  };
  const draftKey = JSON.stringify(draftState);
  const totalRef = React.useRef(total);
  React.useEffect(() => {
    totalRef.current = total;
  });

  React.useEffect(() => {
    if (!hydrated || submitting) return;

    if (draftState.lines.length === 0) {
      const existing = draftIdRef.current;
      if (existing) {
        draftIdRef.current = null;
        setDraftId(null);
        setDraftSaving("idle");
        saveChainRef.current = saveChainRef.current.then(() => deleteSaleDraft(existing));
      }
      return;
    }

    const timeout = setTimeout(() => {
      setDraftSaving("saving");
      saveChainRef.current = saveChainRef.current.then(async () => {
        const result = await saveSaleDraft(draftIdRef.current, draftState, totalRef.current);
        if (result.gone) {
          handleDraftLost("Esta venta en espera ya fue terminada o descartada por otro usuario.");
        } else if (result.taken) {
          handleDraftLost("Esta venta en espera ahora la tiene otro usuario.");
        } else if (result.id) {
          draftIdRef.current = result.id;
          setDraftId(result.id);
          setDraftSaving("saved");
        } else {
          setDraftSaving("error");
        }
      });
    }, 800);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, hydrated, submitting]);

  // Refresca la lista para ver las ventas en espera de los demás usuarios.
  React.useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      await saveChainRef.current;
      const list = await listSaleDrafts();
      if (cancelled) return;
      setDrafts(list);
      const activeId = draftIdRef.current;
      if (!activeId) return;
      const active = list.find((d) => d.id === activeId);
      if (!active) {
        handleDraftLost("Esta venta en espera ya fue terminada o descartada por otro usuario.");
      } else if (active.assigned_to !== currentUserId) {
        handleDraftLost(
          (active.assigned_to_name ?? "Otro usuario") + " tomó esta venta en espera."
        );
      }
    }
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeDraft = drafts.find((d) => d.id === draftId) ?? null;
  const otherDrafts = drafts.filter((d) => d.id !== draftId);
  const otherTeammates = teammates.filter((t) => t.id !== currentUserId);

  function renderPassSelect(id: string, label: string) {
    if (otherTeammates.length === 0) return null;
    return (
      <select
        aria-label={label}
        disabled={transferring}
        value=""
        onChange={(event) => {
          if (event.target.value) passDraft(id, event.target.value);
        }}
        className="h-8 rounded-[var(--radius-brand-sm)] border border-brand-border bg-white px-2 text-xs"
      >
        <option value="">Pasar a...</option>
        {otherTeammates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.full_name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {(draftId || otherDrafts.length > 0) && (
        <div className="rounded-[var(--radius-brand-md)] border border-brand-border bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium text-brand-ink">
              <Clock className="h-4 w-4" />
              Ventas en espera
              {otherDrafts.length > 0 ? " (" + otherDrafts.length + " más)" : ""}
            </p>
            {draftId && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-brand-muted">
                  Esta venta la inició{" "}
                  <span className="font-medium text-brand-ink">
                    {activeDraft?.created_by_name ?? "—"}
                  </span>
                  {activeDraft && activeDraft.assigned_to === currentUserId
                    ? " · la tienes tú"
                    : ""}
                  {" · "}
                  {draftSaving === "saving"
                    ? "Guardando..."
                    : draftSaving === "error"
                      ? "No se pudo guardar"
                      : "Guardada"}
                </span>
                {renderPassSelect(draftId, "Pasar esta venta a otro usuario")}
                <Button variant="outline" size="sm" onClick={startNewSale}>
                  <FilePlus className="h-4 w-4" />
                  Nueva venta
                </Button>
              </div>
            )}
          </div>
          {otherDrafts.length > 0 && (
            <ul className="mt-2 flex flex-col divide-y divide-brand-border">
              {otherDrafts.map((draft) => {
                const items = draft.state.lines.reduce((sum, l) => sum + l.quantity, 0);
                const mine = draft.assigned_to === currentUserId || draft.assigned_to === null;
                const starter = draft.created_by_name ?? "—";
                const holder = draft.assigned_to_name ?? "nadie";
                return (
                  <li key={draft.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="text-sm">
                      <p className="text-brand-ink">
                        {items} {items === 1 ? "producto" : "productos"} ·{" "}
                        {currency.format(draft.total)} ·{" "}
                        {draft.state.selectedCustomer?.nombre ?? "Consumidor final"}
                      </p>
                      <p className="text-xs text-brand-muted">
                        Iniciada por <span className="font-medium text-brand-ink">{starter}</span>
                        {" · "}
                        {mine ? "la tienes tú" : "la tiene " + holder} ·{" "}
                        {new Intl.DateTimeFormat("es-CO", { timeStyle: "short" }).format(
                          new Date(draft.updated_at)
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {mine && (
                        <>
                          <Button size="sm" onClick={() => applyDraft(draft)}>
                            Continuar
                          </Button>
                          {renderPassSelect(draft.id, "Pasar esta venta a otro usuario")}
                        </>
                      )}
                      {!mine && isAdmin && (
                        <Button size="sm" variant="outline" onClick={() => takeDraft(draft.id)}>
                          Tomar
                        </Button>
                      )}
                      {(mine || isAdmin) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Descartar venta en espera"
                          onClick={() => discardDraft(draft.id)}
                        >
                          <Trash2 className="h-4 w-4 text-brand-danger" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

    <div className="grid grid-cols-1 gap-6 pb-20 lg:grid-cols-3 lg:pb-0">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <Input
            placeholder="Buscar producto o código de barras..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>

        {visibleCategories.length > 0 && (
          <div
            role="tablist"
            aria-label="Categorías"
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible"
          >
            {[{ id: "all", name: "Todas" }, ...visibleCategories].map((category) => (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={categoryId === category.id}
                onClick={() => setCategoryId(category.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  categoryId === category.id
                    ? "border-brand bg-brand text-brand-ink"
                    : "border-brand-border bg-white text-brand-muted hover:text-brand-ink"
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.length === 0 && (
            <p className="col-span-full text-center text-sm text-brand-muted">
              No hay productos que coincidan.
            </p>
          )}
          {filtered.map((product) => {
            const inCart = cart[product.id]?.quantity ?? 0;
            const outOfStock = product.quantity <= 0;
            return (
              <button
                key={product.id}
                type="button"
                disabled={outOfStock || inCart >= product.quantity}
                onClick={() => addToCart(product)}
                className="flex flex-col gap-1 rounded-[var(--radius-brand-md)] border border-brand-border bg-white p-3 text-left transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                <p className="truncate text-sm font-medium text-brand-ink">{product.name}</p>
                <p className="text-sm text-brand-muted">
                  {currency.format(
                    computeLineTax(product.sale_price, 1, product.tax_rate, taxSettings).total
                  )}
                </p>
                <p className="text-xs text-brand-muted">
                  {outOfStock ? "Sin stock" : `Stock: ${product.quantity}`}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Fondo oscuro de la hoja (solo celular). */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSheetOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Panel de la venta: en PC queda fijo a la derecha y se desplaza por sí
          solo si es más alto que la pantalla; en celular es una hoja que sube
          desde abajo. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col gap-4 overflow-y-auto rounded-t-2xl bg-brand-surface p-4 shadow-2xl transition-transform duration-300 ${
          sheetOpen ? "translate-y-0" : "invisible translate-y-full"
        } lg:visible lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-4 lg:z-auto lg:max-h-[calc(100vh-2rem)] lg:translate-y-0 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none`}
        role={sheetOpen ? "dialog" : undefined}
        aria-label="Venta"
      >
        <div className="flex items-center justify-between lg:hidden">
          <p className="text-base font-semibold text-brand-ink">Venta</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setSheetOpen(false)}>
            Seguir agregando
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {clientesEnabled ? (
              <div className="flex gap-1 rounded-[var(--radius-brand-sm)] border border-brand-border p-1 text-xs">
                {(Object.keys(CUSTOMER_MODE_LABEL) as CustomerMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => selectCustomerMode(mode)}
                    className={`flex-1 rounded-[var(--radius-brand-sm)] px-2 py-1 transition-colors ${
                      customerMode === mode ? "bg-brand text-brand-ink" : "text-brand-muted"
                    }`}
                  >
                    {CUSTOMER_MODE_LABEL[mode]}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-brand-muted">
                Venta a consumidor final. Para guardar clientes, activa el módulo Clientes.
              </p>
            )}

            {customerMode === "none" && (
              <Input
                type="tel"
                inputMode="tel"
                placeholder="WhatsApp del cliente (opcional)"
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
              />
            )}
            {customerMode === "new" && (
              <Input
                type="email"
                placeholder="Correo del cliente (opcional)"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
              />
            )}

            {customerMode === "existing" &&
              (selectedCustomer ? (
                <div className="flex items-center justify-between rounded-[var(--radius-brand-sm)] border border-brand-border p-2 text-sm">
                  <div>
                    <p className="font-medium text-brand-ink">{selectedCustomer.nombre}</p>
                    {selectedCustomer.documento && (
                      <p className="text-xs text-brand-muted">{selectedCustomer.documento}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)}>
                    Cambiar
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    placeholder="Buscar por nombre o documento..."
                    value={customerQuery}
                    onChange={(event) => setCustomerQuery(event.target.value)}
                  />
                  {customerNotFound && (
                    <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-brand-sm)] border border-brand bg-brand/10 p-3">
                      <p className="text-sm font-medium text-brand-ink">
                        Este cliente no existe. Se creará automáticamente con la venta.
                      </p>
                      <Input
                        placeholder="Nombre *"
                        value={newCustomer.nombre}
                        onChange={(event) =>
                          setNewCustomer((c) => ({ ...c, nombre: event.target.value }))
                        }
                      />
                      <Input
                        placeholder="Documento (opcional)"
                        value={newCustomer.documento}
                        onChange={(event) =>
                          setNewCustomer((c) => ({ ...c, documento: event.target.value }))
                        }
                      />
                      <Input
                        type="tel"
                        inputMode="tel"
                        placeholder="Teléfono / WhatsApp (opcional)"
                        value={newCustomer.telefono}
                        onChange={(event) =>
                          setNewCustomer((c) => ({ ...c, telefono: event.target.value }))
                        }
                      />
                    </div>
                  )}
                  {customerResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-[var(--radius-brand-sm)] border border-brand-border bg-white shadow-md">
                      {customerResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustomerResults([]);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5"
                        >
                          <p className="font-medium text-brand-ink">{c.nombre}</p>
                          {c.documento && <p className="text-xs text-brand-muted">{c.documento}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

            {customerMode === "new" && (
              <div className="flex flex-col gap-2">
                <Input
                  placeholder="Nombre *"
                  value={newCustomer.nombre}
                  onChange={(event) =>
                    setNewCustomer((c) => ({ ...c, nombre: event.target.value }))
                  }
                />
                <Input
                  placeholder="Documento (opcional)"
                  value={newCustomer.documento}
                  onChange={(event) =>
                    setNewCustomer((c) => ({ ...c, documento: event.target.value }))
                  }
                />
                <Input
                  placeholder="Teléfono (opcional)"
                  value={newCustomer.telefono}
                  onChange={(event) =>
                    setNewCustomer((c) => ({ ...c, telefono: event.target.value }))
                  }
                />
                <Input
                  placeholder="Dirección (opcional)"
                  value={newCustomer.direccion}
                  onChange={(event) =>
                    setNewCustomer((c) => ({ ...c, direccion: event.target.value }))
                  }
                />
                <p className="text-xs text-brand-muted">
                  Queda guardado como cliente para futuras ventas.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4" />
              Carrito
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {lines.length === 0 && (
              <p className="text-sm text-brand-muted">Selecciona productos para agregarlos aquí.</p>
            )}
            {lines.map((line, index) => (
              <div key={line.product.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-brand-ink">{line.product.name}</p>
                  <p className="text-xs text-brand-muted">
                    {currency.format(
                      computeLineTax(line.product.sale_price, 1, line.product.tax_rate, taxSettings)
                        .total
                    )}{" "}
                    c/u ·{" "}
                    {lineTaxes[index].lineDiscount > 0 && (
                      <span className="line-through">{currency.format(lineTaxes[index].gross)}</span>
                    )}{" "}
                    {currency.format(lineTaxes[index].gross - lineTaxes[index].lineDiscount)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => changeQuantity(line.product.id, -1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center">{line.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => changeQuantity(line.product.id, 1)}
                    disabled={line.quantity >= line.product.quantity}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Descuento a este producto"
                    title="Descuento"
                    onClick={() =>
                      setDiscountOpen((o) => ({ ...o, [line.product.id]: !o[line.product.id] }))
                    }
                  >
                    <Tag
                      className={`h-3.5 w-3.5 ${line.discount && Number(line.discount.value) > 0 ? "text-brand-success" : "text-brand-muted"}`}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removeLine(line.product.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-brand-danger" />
                  </Button>
                </div>
              </div>
              {discountOpen[line.product.id] && (
                <DiscountField
                  label="Descuento"
                  value={line.discount ?? null}
                  onChange={(d) => setLineDiscount(line.product.id, d)}
                  amountText={
                    lineTaxes[index].lineDiscount > 0
                      ? `− ${currency.format(lineTaxes[index].lineDiscount)}`
                      : null
                  }
                />
              )}
              </div>
            ))}

            {lines.length > 0 && (
              <DiscountField
                label="Descuento a toda la venta"
                value={globalDiscount}
                onChange={setGlobalDiscount}
                amountText={
                  totals.globalDiscount > 0 ? `− ${currency.format(totals.globalDiscount)}` : null
                }
              />
            )}

            {totals.discountTotal > 0 && (
              <div className="flex flex-col gap-1 border-t border-brand-border pt-3 text-sm text-brand-muted">
                <div className="flex items-center justify-between">
                  <span>Antes de descuentos</span>
                  <span>{currency.format(totals.gross)}</span>
                </div>
                <div className="flex items-center justify-between text-brand-success">
                  <span>Descuentos ({discountPercent.toFixed(1)}%)</span>
                  <span>− {currency.format(totals.discountTotal)}</span>
                </div>
                {overDiscountCap && (
                  <p className="text-xs text-brand-danger">
                    Supera el máximo para auxiliares ({maxDiscountPct}%). Pide al administrador que
                    registre la venta.
                  </p>
                )}
              </div>
            )}
            {totals.error && <p className="text-xs text-brand-danger">{totals.error}</p>}

            {taxTotal > 0 && (
              <div className="flex flex-col gap-1 border-t border-brand-border pt-3 text-sm text-brand-muted">
                <div className="flex items-center justify-between">
                  <span>Subtotal (sin impuestos)</span>
                  <span>{currency.format(total - taxTotal)}</span>
                </div>
                {taxRows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span>{row.label}</span>
                    <span>{currency.format(row.tax)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-brand-border pt-3 font-semibold text-brand-ink">
              <span>Total</span>
              <span>{currency.format(total)}</span>
            </div>

            <div className="flex flex-col gap-2 border-t border-brand-border pt-3">
              <p className="text-sm font-medium text-brand-ink">Método de pago</p>
              <div className="grid grid-cols-3 gap-1 rounded-[var(--radius-brand-sm)] border border-brand-border p-1 text-xs">
                {payMethods.map((method) => (
                  <button
                    key={method.key}
                    type="button"
                    onClick={() => {
                      setPayMethod(method.key);
                      setCashReceived("");
                    }}
                    className={`truncate rounded-[var(--radius-brand-sm)] px-2 py-1.5 transition-colors ${
                      payMethod === method.key ? "bg-brand text-brand-ink" : "text-brand-muted"
                    }`}
                  >
                    {method.label}
                  </button>
                ))}
              </div>

              {payMethod === "efectivo" && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-sm text-brand-muted">Recibido</span>
                    <Input
                      type="number"
                      min={0}
                      step="1"
                      inputMode="numeric"
                      placeholder="¿Con cuánto paga?"
                      value={cashReceived}
                      onChange={(event) => setCashReceived(event.target.value)}
                    />
                  </div>
                  {cashReceivedNumber > 0 && total > 0 && (
                    <p
                      className={`text-sm font-medium ${
                        cashChange >= 0 ? "text-brand-success" : "text-brand-danger"
                      }`}
                    >
                      {cashChange >= 0
                        ? `Devuelta: ${currency.format(cashChange)}`
                        : `Faltan ${currency.format(-cashChange)}`}
                    </p>
                  )}
                </div>
              )}

              {payMethod === "transferencia" && (
                <div className="flex gap-1 text-xs">
                  {channels.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setChannel(option)}
                      className={`flex-1 rounded-[var(--radius-brand-sm)] border px-2 py-1.5 transition-colors ${
                        channel === option
                          ? "border-brand bg-brand/10 text-brand-ink"
                          : "border-brand-border text-brand-muted"
                      }`}
                    >
                      {CHANNEL_LABEL[option]}
                    </button>
                  ))}
                </div>
              )}

              {payMethod === "mixto" && (
                <div className="flex flex-col gap-2">
                  {mixedRows.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-20 truncate text-sm text-brand-muted">{label}</span>
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        placeholder="0"
                        value={mixed[key]}
                        onChange={(event) =>
                          setMixed((m) => ({ ...m, [key]: event.target.value }))
                        }
                      />
                    </div>
                  ))}
                  <p
                    className={`text-xs ${
                      Math.abs(mixedRemaining) < 0.01 ? "text-brand-success" : "text-brand-muted"
                    }`}
                  >
                    {Math.abs(mixedRemaining) < 0.01
                      ? "Pago completo"
                      : mixedRemaining > 0
                        ? `Faltan ${currency.format(mixedRemaining)}`
                        : `Sobran ${currency.format(-mixedRemaining)}`}
                  </p>
                </div>
              )}

              {creditAmount > 0 && (
                <div className="flex flex-col gap-1 rounded-[var(--radius-brand-sm)] border border-brand bg-brand/10 p-3 text-xs text-brand-ink">
                  <p className="text-sm font-medium">
                    Fiado: {currency.format(creditAmount)} · vence {creditDue}
                  </p>
                  {customerMode === "none" && (
                    <p className="text-brand-danger">Para fiar, elige Cliente existente o Cliente nuevo.</p>
                  )}
                  {selectedCustomer && credit && !credit.error && (
                    <p className="text-brand-muted">
                      Debe hoy {currency.format(credit.debt)}
                      {credit.limit !== null
                        ? ` · cupo ${currency.format(credit.limit)} · disponible ${currency.format(
                            Math.max(credit.limit - credit.debt, 0)
                          )}`
                        : " · sin cupo asignado"}
                    </p>
                  )}
                  {!isAdmin && (customerMode === "new" || customerNotFound) && (
                    <p className="text-brand-danger">
                      Solo el administrador puede fiarle a un cliente nuevo.
                    </p>
                  )}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-brand-danger">{error}</p>}
            {success && <p className="text-sm text-brand-success">{success}</p>}
            {success && lastSaleId && (
              <div className="flex flex-wrap items-center gap-2">
                <DownloadInvoiceButton saleId={lastSaleId} size="sm" />
                <WhatsappInvoiceButton saleId={lastSaleId} phone={lastSalePhone} size="sm" />
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/dashboard/ventas-productos/${lastSaleId}/factura`} target="_blank">
                    Ver factura
                  </Link>
                </Button>
              </div>
            )}

            <Button disabled={lines.length === 0 || submitting} onClick={handleConfirm}>
              {submitting ? "Registrando..." : "Confirmar venta"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Barra inferior (solo celular): resumen de la venta y acceso al panel. */}
      {!sheetOpen && (lines.length > 0 || success) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-border bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-brand-muted">
                {lines.length > 0
                  ? `${itemCount} ${itemCount === 1 ? "producto" : "productos"}`
                  : "Venta registrada"}
              </p>
              {lines.length > 0 && (
                <p className="truncate text-base font-semibold text-brand-ink">
                  {currency.format(total)}
                </p>
              )}
            </div>
            <Button type="button" onClick={() => setSheetOpen(true)}>
              {lines.length > 0 ? "Continuar →" : "Ver factura"}
            </Button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

/** Campo de descuento: tipo (% o $) y valor. Vacío = sin descuento. */
function DiscountField({
  label,
  value,
  onChange,
  amountText,
}: {
  label: string;
  value: DraftDiscount | null;
  onChange: (value: DraftDiscount | null) => void;
  /** Valor del descuento ya calculado, para mostrarlo al lado. */
  amountText: string | null;
}) {
  const type = value?.type ?? "pct";
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-xs text-brand-muted">{label}</span>
      <div className="flex shrink-0 rounded-[var(--radius-brand-sm)] border border-brand-border p-0.5 text-xs">
        {(["pct", "amount"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange({ type: t, value: value?.value ?? "" })}
            className={`rounded-[var(--radius-brand-sm)] px-2 py-0.5 ${
              type === t ? "bg-brand text-brand-ink" : "text-brand-muted"
            }`}
          >
            {t === "pct" ? "%" : "$"}
          </button>
        ))}
      </div>
      <Input
        type="number"
        min={0}
        max={type === "pct" ? 100 : undefined}
        step="any"
        inputMode="decimal"
        placeholder="0"
        className="h-8 min-w-0"
        value={value?.value ?? ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : { type, value: event.target.value })
        }
      />
      {amountText && <span className="shrink-0 text-xs text-brand-success">{amountText}</span>}
    </div>
  );
}
