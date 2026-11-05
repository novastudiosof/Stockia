-- Convierte Clientes, Informes y Registro de Actividad en módulos que el
-- super admin puede activar/desactivar por organización.
-- Idempotente. Para no quitarle nada a los clientes actuales, se activan
-- automáticamente donde ya tenían acceso:
--   * clientes  -> orgs que tienen activo ventas_productos (antes colgaba de él)
--   * informes y actividad -> todas las organizaciones existentes

insert into modules (key, name, description, price)
values
  ('clientes', 'Clientes', 'Directorio de clientes para asociarlos a las ventas y facturas.', 0),
  ('informes', 'Informes', 'Descarga de reportes en Excel: ventas, ventas por productos e inventario.', 0),
  ('actividad', 'Registro de Actividad', 'Historial de las acciones realizadas por los usuarios de tu negocio.', 0)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description;

insert into organization_modules (organization_id, module_id, enabled, enabled_at)
select om.organization_id, c.id, true, now()
from organization_modules om
join modules vp on vp.id = om.module_id and vp.key = 'ventas_productos'
join modules c on c.key = 'clientes'
where om.enabled
on conflict (organization_id, module_id) do nothing;

insert into organization_modules (organization_id, module_id, enabled, enabled_at)
select o.id, m.id, true, now()
from organizations o
join modules m on m.key in ('informes', 'actividad')
on conflict (organization_id, module_id) do nothing;
