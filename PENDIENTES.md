# Stockia — Pendientes y decisiones

Última actualización: 2026-11-08. Organización de pruebas: PET SHOP ANIMAL HOME (trabajar solo sobre esa).

## Hecho en código, sin commit ni probar (2026-11-08)
- [ ] **Color de la página y Datos de facturación pasaron de Super Admin a Mi Cuenta** (solo administrador). Tipo de negocio sigue en Super Admin. Acciones `updateMyThemeColor` y `updateMyInvoiceSettings` en `lib/actions/cuenta.ts` (usan service role porque RLS de organizations es solo super admin).
- [ ] **Devoluciones**: botón en el historial de Ventas por Productos (solo administrador). Devuelve la venta completa, regresa stock y la saca de informes. Si el cliente conserva productos, se registra de nuevo la venta con esos. **Correr migración 019 (`sql/019_devoluciones.sql`) antes de desplegar.** **Migración 021** (`sql/021_devoluciones_en_su_dia.sql`): la devolución se descuenta en el día en que se hace (caja, ventas del día, utilidad, por el mismo medio de pago), sin tocar el día original ni exigir reabrir su caja. Requiere la caja de HOY abierta. Las anulaciones siguen igual (solo antes del cierre del día de la venta). Probada en un Postgres en memoria; falta probar en producción: devolver una venta de hace días y revisar cierre de caja, Ventas y Gastos e Informes → Utilidad.
- [ ] **Ventas en espera (borrador compartido)**: el carrito se guarda solo en la base (migración **020_borradores_venta.sql**, correr antes de desplegar). Cada venta tiene un responsable; todos ven quién la inició y quién la tiene, solo el responsable la edita; se puede pasar a otro usuario o el administrador la toma. Se borra al confirmar la venta y a los 3 días. Probar con dos usuarios a la vez.

## Actualización de dependencias (2026-11-11, sin commit ni desplegar)
- [ ] Next 16.3.5 → 16.4.6 (y eslint-config-next), zod 4.6.7, sharp 0.35.5 y brace-expansion vía `npm audit fix`. `tsc`, `eslint` y `next build` pasan. Queda 1 aviso moderado (`uuid` dentro de `exceljs`; su "arreglo" bajaría exceljs a 3.4.0, se descartó). Probar en local flujos principales antes de desplegar.
- [ ] **Migraciones 022 y 023**: correr en Supabase junto con 019–021, en orden, antes de desplegar.

## Impuestos y datos fiscales (preparación para factura electrónica) — 2026-11-11, sin commit ni desplegar
Hecho en código y probado en un Postgres local (001–023 + ventas, devolución y utilidad con cifras); falta probar en la app y en producción.
- [ ] **Todo apagado por defecto.** En Mi Cuenta → Datos de facturación el administrador activa "Manejar impuestos" y elige si sus precios YA incluyen el impuesto o se suman encima (opción por negocio). Mientras esté apagado, nada cambia.
- [ ] **Impuesto por producto** (Catálogo, solo si el negocio lo activó): sin impuesto (excluido), exento, IVA 5% / 19%, impuesto al consumo 4% / 8% / 16%. Los productos existentes quedan en "sin impuesto".
- [ ] La venta guarda desglose por ítem (taxKind, taxRate, base, tax) y sales.tax_total. create_sale() lo calcula en el servidor; lib/tax.ts replica el cálculo para mostrar el total en el carrito (deben coincidir; si se cambia uno, cambiar el otro).
- [ ] Utilidad usa el ingreso SIN impuesto; cierre de caja y listados siguen usando el total cobrado.
- [ ] Factura (pantalla, impresión y PDF): muestra subtotal e impuestos si la venta los tiene; NIT con DV, régimen, ciudad, tipo de documento del cliente y resolución DIAN si están llenos.
- [ ] Datos fiscales del negocio (DV, régimen, ciudad, responsabilidades, resolución con rango y vigencia) y tipo de documento del cliente (módulo Clientes).
- Por ahora NO hace: enviar a la DIAN ni al proveedor tecnológico, CUFE/QR, notas crédito, validar rango/vigencia de la resolución al vender. Tampoco: tipo de documento al crear un cliente nuevo desde la venta (solo en el módulo Clientes), importación masiva con impuesto (entra "sin impuesto"), buscador del catálogo muestra el precio base.
- Probar: activar impuestos en una organización de prueba, poner IVA a un producto, vender (con precios incluidos y sin incluir), imprimir/PDF, devolver esa venta, revisar Informes → Utilidad y cierre de caja.

## Por confirmar con el usuario (probar en producción)
- [ ] **Migración 018** (`sql/018_corrige_profit_by_product.sql`): confirmar que "Calcular ganancia" en Informes → Utilidad ya funciona.
- [ ] **Informes → "Ver ventas y gastos"**: el usuario reportó que no mostraba las ventas por producto. No se pudo reproducir en local. Si sigue fallando, pedir el código entre corchetes del mensaje de error (ej. `[42883]`) y verificar que corrió 015, 016, 017, 018 y que el despliegue es el nuevo.
- [ ] **Rendimiento**: optimización ya subida (commit `8fc7c1f`: getClaims, cache por petición, consultas en paralelo). El usuario debe comparar velocidad con build de producción (no `npm run dev`). Si sigue lenta: revisar región del proyecto Supabase (ideal São Paulo) y plan.

## Funcionalidades pendientes
- [ ] **Tienda virtual con QR** (aplazada por el usuario): catálogo de solo lectura para clientes frecuentes, se actualiza con el inventario. Decidir: enlace secreto con token en el QR vs. acceso con documento del cliente. Sería un módulo ("Tienda") cobrable aparte.
- [ ] **Comprimir comprobantes de gastos al subirlos** (como `lib/image-compress.ts` en categorías): el límite real del plan gratuito es Storage (1 GB), no la base de datos. Rinde 5–10 veces más.
- [ ] **Módulo de facturación electrónica DIAN** (no listo hoy). Falta:
  - IVA / impuesto al consumo por producto (0%, 5%, 19%, excluido) y desglose en la venta.
  - Datos fiscales de la organización: NIT + DV, régimen, dirección, ciudad, responsabilidades, resolución de numeración.
  - Datos fiscales del cliente: tipo de documento, correo.
  - Numeración consecutiva por prefijo.
  - Integración con proveedor tecnológico autorizado (Alegra, Siigo, Factus, Dataico…): enviar por API, guardar CUFE y QR, mostrar estado.
  - Notas crédito y anulaciones reportadas a la DIAN.
  - Antes: confirmar con el contador del cliente si su caso está obligado. No prometerlo como incluido; ofrecerlo como módulo adicional.
- [ ] **Revisión de carga de datos de prueba**: los productos sembrados en Animal Home tienen stock 10 e inventado y precios aproximados; ajustar con datos reales.

## Deuda técnica detectada en revisión
- [x] `create_sale` no bloqueaba ventas después de cerrar la caja del día → migración **022** (`sql/022_bloquea_ventas_caja_cerrada.sql`), sin desplegar ni probar. Mensaje: "La caja de hoy ya está cerrada...". Probar: cerrar caja, intentar vender, reabrir y vender.
- [ ] El control de módulos activos se hace solo en la aplicación (no en RLS de la base).
- [ ] `getClaims` no detecta usuarios revocados hasta que expira el token (mitigado: el proxy cierra sesión si no hay perfil).
- [ ] Impresión en térmica: confirmar el modelo real (las "88 mm" suelen ser 80 mm de papel) antes de prometer.

## Comercial
- [ ] Armar **cotización de una página** (precios + texto de "por qué elegir Stockia"). Texto persuasivo ya redactado en la conversación (software a la medida, módulos a elección, control total/datos exportables, funciones a pedido, soporte directo, sin ataduras). No mencionar tienda QR hasta que exista.
- Precios sugeridos (COP, propuesta, no dato de mercado):
  - Instalación inicial: 300.000–600.000 (pago único).
  - Plan Básico (ventas, productos, catálogo, ticket térmico): 60.000–80.000/mes.
  - Plan Completo (+ informes, utilidad, gastos, facturas, WhatsApp): 110.000–150.000/mes.
  - Módulo suelto: 20.000–40.000/mes. Tienda QR: 30.000–50.000/mes.
  - Licencia única sin código: 3–6 millones; con código fuente: 12–20 millones; más hosting/soporte 50.000–80.000/mes.
- Competencia (verificar en sus sitios): Alegra ~164.000/mes, Siigo ~191.000/mes (POS aparte), Loggro 30.000–150.000/mes.
- Infraestructura: Supabase gratis = 500 MB BD + 1 GB archivos, se pausa tras 1 semana sin uso y sin backups. Pro (25 USD/mes) = 8 GB BD + 100 GB archivos + backups; para clientes de pago, recomendar Pro. Compartir un proyecto entre varios clientes reparte el costo.
- Capacidad estimada (aprox.): venta ≈ 3 KB, producto ≈ 0,6 KB, gasto ≈ 0,6 KB. Gratis: ~7 años a 50 ventas/día; comprobantes agotan 1 GB en 3–12 meses con 5 al día. Pro: décadas.

## Migraciones SQL (orden)
001–023. README.md lista hasta la 023. Las migraciones se corren a mano en Supabase antes del despliegue.
