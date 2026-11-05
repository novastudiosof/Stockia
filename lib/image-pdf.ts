/**
 * Utilidades (solo navegador) para convertir fotos en un PDF liviano, sin
 * librerías externas: cada foto se reduce y se re-codifica como JPEG, y luego
 * se escribe un PDF mínimo con una imagen por página.
 */

export interface PageImage {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

export interface CompressLevel {
  maxSide: number;
  quality: number;
}

/** De mejor a peor calidad; se baja de nivel solo si el PDF supera el tope. */
export const COMPRESS_LEVELS: CompressLevel[] = [
  { maxSide: 1800, quality: 0.75 },
  { maxSide: 1500, quality: 0.62 },
  { maxSide: 1200, quality: 0.5 },
  { maxSide: 1000, quality: 0.4 },
];

/** Tope del PDF final (el límite de una petición en Vercel es 4,5 MB). */
export const MAX_PDF_BYTES = 3.5 * 1024 * 1024;

async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" respeta la rotación EXIF de las fotos del celular.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // cae al método con <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo leer la imagen"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImage(file: File, level: CompressLevel): Promise<PageImage> {
  const source = await decodeImage(file);
  const srcWidth = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcHeight = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!srcWidth || !srcHeight) throw new Error("La imagen está vacía o dañada");

  const scale = Math.min(1, level.maxSide / Math.max(srcWidth, srcHeight));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no puede procesar la imagen");
  // Fondo blanco: los PNG con transparencia saldrían negros en JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  if ("close" in source) source.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", level.quality)
  );
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error("No se pudo comprimir la imagen");

  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width, height };
}

/** Arma un PDF con una imagen por página (ancho A4: 595 pt). */
export function buildPdf(pages: PageImage[]): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let position = 0;

  const write = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    position += bytes.length;
  };
  const startObject = (id: number) => {
    offsets[id] = position;
    write(`${id} 0 obj\n`);
  };

  const pageObjectId = (index: number) => 3 + index * 3;
  const totalObjects = 2 + pages.length * 3;

  write("%PDF-1.4\n");

  startObject(1);
  write("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  startObject(2);
  const kids = pages.map((_, i) => `${pageObjectId(i)} 0 R`).join(" ");
  write(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((page, i) => {
    const pageId = pageObjectId(i);
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const pageWidth = 595;
    const pageHeight = Math.round((page.height / page.width) * pageWidth);

    startObject(pageId);
    write(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
    );

    startObject(imageId);
    write(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`
    );
    write(page.jpeg);
    write("\nendstream\nendobj\n");

    const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
    startObject(contentId);
    write(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  });

  const xrefPosition = position;
  write(`xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= totalObjects; id++) {
    write(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  write(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF\n`
  );

  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

/**
 * Convierte las fotos en un solo PDF. Si el resultado supera el tope, vuelve
 * a comprimir todas las hojas con menos calidad hasta que quepa.
 */
export async function imagesToPdf(files: File[]): Promise<Blob> {
  let last: Blob | null = null;
  for (const level of COMPRESS_LEVELS) {
    const pages: PageImage[] = [];
    for (const file of files) pages.push(await compressImage(file, level));
    last = buildPdf(pages);
    if (last.size <= MAX_PDF_BYTES) return last;
  }
  return last as Blob;
}
