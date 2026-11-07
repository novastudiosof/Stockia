/**
 * Reduce una foto en el navegador antes de subirla: recorte cuadrado al centro,
 * 512 px y formato WebP (JPEG si el navegador no sabe WebP). Una foto de
 * celular de varios MB queda en ~30-60 KB, así Storage casi no crece y la
 * página carga rápido.
 */
export async function compressSquareImage(
  file: File,
  size = 512,
  quality = 0.82
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const target = Math.min(size, side);
  const canvas = document.createElement("canvas");
  canvas.width = target;
  canvas.height = target;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Tu navegador no pudo procesar la imagen");
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, target, target);
  bitmap.close();

  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
  if (!blob) throw new Error("No se pudo comprimir la imagen");

  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `categoria.${extension}`, { type: blob.type });
}
