/**
 * Genera la factura de venta como PDF tipo tiquete (58 u 80 mm) directamente
 * en el navegador, sin librerías. Usa la fuente estándar Courier (monoespaciada),
 * así el ajuste de líneas es exacto y el PDF no necesita incrustar fuentes.
 */

export interface TicketItem {
  name: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface TicketData {
  orgName: string;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  invoiceNumber: string;
  dateLabel: string;
  voided: boolean;
  customerName: string;
  customerDocument: string | null;
  customerPhone: string | null;
  soldBy: string | null;
  items: TicketItem[];
  /** Solo si la venta tiene impuestos: subtotal sin impuestos y una línea por impuesto. */
  subtotal?: string;
  taxLines?: { label: string; amount: string }[];
  total: string;
  paymentText: string | null;
  footer: string | null;
}

interface Line {
  text: string;
  bold?: boolean;
  align?: "left" | "center";
}

const FONT_SIZE = 8;
const CHAR_WIDTH = FONT_SIZE * 0.6; // Courier: 600/1000 em por carácter
const LEADING = 10;
const MARGIN = 8;
const MM_TO_PT = 72 / 25.4;

/** Normaliza el texto a Latin-1 (lo que soporta WinAnsi sin incrustar fuentes). */
function clean(text: string) {
  return text
    .replace(/[  ]/g, " ")
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function wrap(text: string, cols: number): string[] {
  const words = clean(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    let rest = word;
    while (rest.length > cols) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(rest.slice(0, cols));
      rest = rest.slice(cols);
    }
    if (!current) current = rest;
    else if ((current + " " + rest).length <= cols) current += " " + rest;
    else {
      lines.push(current);
      current = rest;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

/** Izquierda + derecha en una sola línea; si no caben, la derecha baja. */
function leftRight(left: string, right: string, cols: number): string[] {
  const l = clean(left);
  const r = clean(right);
  if (l.length + r.length + 1 <= cols) {
    return [l + " ".repeat(cols - l.length - r.length) + r];
  }
  return [...wrap(l, cols), " ".repeat(Math.max(0, cols - r.length)) + r];
}

function encodeLatin1(text: string): Uint8Array {
  const out: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 63;
    const byte = code < 256 ? code : 63; // "?" para lo que no existe en Latin-1
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out.push(0x5c); // escapa ( ) \
    out.push(byte);
  }
  return new Uint8Array(out);
}

export function buildTicketPdf(data: TicketData, widthMm: 58 | 80): Blob {
  const pageWidth = Math.round(widthMm * MM_TO_PT);
  const cols = Math.floor((pageWidth - MARGIN * 2) / CHAR_WIDTH);
  const rule = "-".repeat(cols);

  const lines: Line[] = [];
  const add = (text: string, opts: Omit<Line, "text"> = {}) => lines.push({ text, ...opts });
  const addWrapped = (text: string, opts: Omit<Line, "text"> = {}) =>
    wrap(text, cols).forEach((part) => add(part, opts));

  addWrapped(data.orgName, { bold: true, align: "center" });
  if (data.taxId) addWrapped(`NIT: ${data.taxId}`, { align: "center" });
  if (data.address) addWrapped(data.address, { align: "center" });
  if (data.phone) addWrapped(`Tel: ${data.phone}`, { align: "center" });

  add(rule);
  add("FACTURA DE VENTA", { bold: true, align: "center" });
  addWrapped(`N. ${data.invoiceNumber}`, { align: "center" });
  addWrapped(data.dateLabel, { align: "center" });
  if (data.voided) add("*** ANULADA ***", { bold: true, align: "center" });

  add(rule);
  addWrapped(`Cliente: ${data.customerName}`);
  if (data.customerDocument) addWrapped(`Doc: ${data.customerDocument}`);
  if (data.customerPhone) addWrapped(`Tel: ${data.customerPhone}`);
  if (data.soldBy) addWrapped(`Vendido por: ${data.soldBy}`);

  add(rule);
  for (const item of data.items) {
    addWrapped(item.name);
    leftRight(`${item.quantity} x ${item.unitPrice}`, item.subtotal, cols).forEach((l) => add(l));
  }

  add(rule);
  if (data.subtotal && data.taxLines && data.taxLines.length > 0) {
    leftRight("Subtotal", data.subtotal, cols).forEach((l) => add(l));
    for (const tax of data.taxLines) {
      leftRight(tax.label, tax.amount, cols).forEach((l) => add(l));
    }
  }
  leftRight("TOTAL", data.total, cols).forEach((l) => add(l, { bold: true }));
  if (data.paymentText) addWrapped(`Pago: ${data.paymentText}`);

  if (data.footer) {
    add(rule);
    addWrapped(data.footer, { align: "center" });
  }

  const pageHeight = MARGIN * 2 + lines.length * LEADING;

  // Contenido de la página (texto posicionado línea por línea).
  const encoder = new TextEncoder();
  const content: Uint8Array[] = [];
  lines.forEach((line, index) => {
    const text = clean(line.text);
    const textWidth = text.length * CHAR_WIDTH;
    const x =
      line.align === "center"
        ? Math.max(MARGIN, (pageWidth - textWidth) / 2)
        : MARGIN;
    const y = pageHeight - MARGIN - (index + 1) * LEADING + 2;
    content.push(
      encoder.encode(
        `BT /${line.bold ? "F2" : "F1"} ${FONT_SIZE} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (`
      ),
      encodeLatin1(text),
      encoder.encode(") Tj ET\n")
    );
  });
  const contentLength = content.reduce((sum, part) => sum + part.length, 0);

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let position = 0;
  const write = (value: string | Uint8Array) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    position += bytes.length;
  };
  const startObject = (id: number) => {
    offsets[id] = position;
    write(`${id} 0 obj\n`);
  };

  write("%PDF-1.4\n");
  startObject(1);
  write("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObject(2);
  write("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  startObject(3);
  write(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>\nendobj\n`
  );
  startObject(4);
  write(`<< /Length ${contentLength} >>\nstream\n`);
  content.forEach((part) => write(part));
  write("endstream\nendobj\n");
  startObject(5);
  write("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj\n");
  startObject(6);
  write(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>\nendobj\n"
  );

  const xref = position;
  write("xref\n0 7\n0000000000 65535 f \n");
  for (let id = 1; id <= 6; id++) {
    write(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  write(`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
