-- Ejecutar después de 001-009. Idempotente.
--
-- Deja el campo de código de barras mapeado en productos (captura manual o
-- por importación). La lectura con lector/cámara queda para una fase futura.

alter table products
  add column if not exists barcode text;

-- Único por organización (dos negocios distintos sí pueden compartir el
-- mismo código de barras de fábrica); permite null y no valida duplicados de
-- cadena vacía porque el formulario/importador siempre normalizan "" a null.
create unique index if not exists products_organization_barcode_idx
  on products (organization_id, barcode)
  where barcode is not null;
