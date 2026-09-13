-- Catálogo de módulos vendibles. Ajusta nombres/precios según lo que
-- definas comercialmente; el "key" es el identificador estable que usa el
-- código (no lo cambies sin actualizar lib/modules.ts).

insert into modules (key, name, description, price)
values
  ('ventas_gastos', 'Ventas y Gastos', 'Registro de ventas y gastos con balance por rango de fechas.', 0),
  ('facturas', 'Facturas', 'Gestión de facturas de proveedores con soporte adjunto (imagen o PDF).', 0)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description;

-- Nota: el precio se deja en 0 por defecto a propósito — defínelo desde el
-- panel de super admin o actualizando esta fila, no es una decisión que
-- debiera quedar fija en el código fuente.
