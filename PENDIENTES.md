# Stockia — Pendientes y decisiones

Última actualización: 2026-11-19. Organización de pruebas: PET SHOP ANIMAL HOME (trabajar solo sobre esa).

## Plan de mejora (2026-11-19)
Orden acordado con el usuario: primero **Fase B (comercial)**, después A (base fiscal / factura electrónica), C (operación) y D (conexión con proveedor DIAN; aún no hay proveedor elegido).
- [ ] **B1. Fiado, cartera y medios de pago**: hecho en código (ver abajo), sin commit.
- [ ] **B2. Descuentos**: hecho en código (ver abajo), sin commit.
- [ ] **B3. Compras y proveedores**: hecho en código (ver abajo), sin commit. Mejoras (soporte, Excel, crear producto) en la migración 027.
- [ ] **B4. Stock mínimo y alertas**: hecho en código (ver abajo), sin commit.
- [ ] **B5. Decimales y unidades** (kg, litro, metro): el cambio más delicado (cantidades enteras a decimales en stock, ventas y movimientos).
- Fase A (después de B): copia de los datos fiscales del negocio en cada venta (hoy la factura lee los datos ACTUALES: cambiar NIT o resolución altera facturas viejas), campos DIAN opcionales con valores por defecto, tabla de resoluciones (POS y factura electrónica), estado electrónico por venta, devolución parcial y nota crédito.

## Mejoras de compras + B4 stock mínimo (2026-11-19): SIN commit; correr migración 027 (después de 026) antes de desplegar
Migración **027** (`sql/027_soporte_compras_stock_minimo.sql`). Probada en Postgres local (instalación limpia 001–027; alertas con mínimo general/propio/0/apagadas, auxiliar sin proveedor ni costo, aislamiento entre organizaciones, soporte solo del owner y solo en su carpeta, producto creado desde la compra con stock 0 que luego entra con la compra; fiado y compras siguen pasando). `tsc`, `eslint` y `next build` pasan. Falta probar en la app.
- **Crear producto desde la compra**: botón "Producto nuevo" y, si el buscador no encuentra nada, "Crear '...' como producto nuevo" (si lo escrito son solo dígitos se toma como código de barras). Pide categoría, nombre, código, costo, precio de venta e impuesto (si el negocio maneja impuestos). El producto se crea de una vez en el Catálogo con stock 0 (si la compra no se guarda, queda ahí con stock 0); la cantidad entra al registrar la compra.
- **Soporte de la factura del proveedor**: foto(s) o PDF al registrar la compra o después en su detalle (ver, reemplazar, quitar). Se guarda en el bucket `invoices` en `<org>/compras/<compra>/...`; la 027 deja esa carpeta solo para el administrador (el auxiliar sigue viendo los demás adjuntos). Si la subida falla, la compra queda y el detalle avisa para reintentar.
- **Excel de compras** (Compras → Exportar): rango por fecha de la factura; hoja "Compras" (una fila por compra: total, forma de pago, vence, saldo, estado, soporte sí/no) y hoja "Detalle" (una fila por producto).
- **B4 stock mínimo** (decisiones del usuario: mínimo por producto + mínimo general del negocio, sin "cantidad ideal", el auxiliar ve las alertas sin costos ni proveedores):
  - Mi Cuenta → "Alertas de inventario": encender/apagar y mínimo general (por defecto 5). Con 0 solo avisa cuando se agota.
  - Cada producto: "Stock mínimo" al crearlo/editarlo (vacío = el general) y editable directo en la lista "Por agotarse".
  - Regla: **agotado** si stock ≤ 0; **por agotarse** si stock ≤ mínimo. Reemplaza el umbral fijo de 10 que había en Catálogo, buscador, Informes e Excel de inventario (que ahora trae la columna "Stock mínimo").
  - Contador rojo en "Catálogo" del menú, aviso en el Catálogo y página `/dashboard/catalogo/por-agotarse` (filtros Todos/Agotados/Por agotarse, buscador).
  - **Pedido sugerido** (solo administrador): agrupado por el último proveedor al que se le compró cada producto (compras no anuladas); cantidad = lo que falta para el mínimo (mínimo 1), editable; costo estimado con el último costo; copiar pedido, WhatsApp al celular del proveedor y Excel con las cantidades editadas.
  - **Además**: el Catálogo ya no muestra "Precio compra" al auxiliar (ni se envía al navegador). Ojo: la base de datos aún le permite leerlo si alguien consulta directo la API; cerrarlo del todo queda para la Fase C (vista o permisos por columna).
- Probar: correr 027; en Mi Cuenta poner mínimo general; poner mínimo propio a un producto; vender hasta llegar al mínimo y ver contador/aviso/lista (con administrador y auxiliar); pedido sugerido (cambiar cantidad, copiar, WhatsApp, Excel); compra con producto nuevo creado desde la compra; adjuntar soporte al registrar y después (ver/reemplazar/quitar); confirmar que el auxiliar no ve el precio de compra; Excel de compras.

## B3. Compras y proveedores (2026-11-19): SIN commit; correr migración 026 (después de 024 y 025) antes de desplegar
Migración **026** (`sql/026_compras_proveedores.sql`). Probada en Postgres local (instalación limpia 001–026; costo promedio, anulación, abonos, caja, permisos; las pruebas del fiado siguen pasando). `tsc`, `eslint` y `next build` pasan. Falta probar en la app.
- **Módulo nuevo "Compras y Proveedores"** (key `compras`): hay que ACTIVARLO en Super Admin para Animal Home. Solo el administrador (muestra costos); el auxiliar no ve ni registra compras (RLS).
- **Proveedores** (`/dashboard/proveedores`): nombre, NIT, teléfono, correo, dirección, notas y cuánto se le debe. No se puede borrar un proveedor al que se le debe.
- **Nueva compra** (`/dashboard/compras/nueva`): proveedor (o crear uno ahí mismo), factura del proveedor, fecha (no futura), productos con buscador o lector de código de barras, cantidad, costo unitario y nuevo precio de venta opcional (muestra el nuevo costo promedio y el margen). Solo productos que ya existen en Catálogo.
- **Costo promedio ponderado**: (stock × costo actual + cantidad × costo de compra) / (stock + cantidad); sin stock, queda el costo de la compra. La utilidad de las ventas usa el costo del momento de vender, así que lo pasado no cambia.
- **Pago**: de contado desde la caja (sale del efectivo esperado en el cierre), de contado por fuera de la caja (no la toca) o a crédito con plazo en días desde la fecha de la factura (cuenta por pagar).
- **Pagos a proveedores** (detalle de la compra): parciales o total, desde la caja o por fuera; se pueden anular (con la caja de ese día abierta si fue desde la caja).
- **Anular compra**: devuelve el stock y revierte el costo promedio (exacto si no hubo otras compras en medio; si el stock queda en 0, vuelve el costo anterior). No se puede si ya se vendió parte y no alcanza el stock, si tiene pagos o, si se pagó desde la caja, con la caja de ese día cerrada. El precio de venta no se revierte.
- **Cierre de caja**: nuevas líneas "Compras pagadas desde la caja" y "Pagos a proveedores desde la caja".
- **Utilidad**: las compras NO son gastos (su costo entra al vender). Avisar al cliente: si registraba la mercancía como gasto "Compra de mercancía", dejar de hacerlo para no contarla dos veces.
- Probar: activar el módulo; crear proveedor; compra de contado desde caja y por fuera; compra a crédito y pagarla en dos partes; revisar stock, costo y precio en Catálogo; vender ese producto y ver Utilidad; cierre de caja; anular una compra; intentar anular una compra cuyo stock ya se vendió.
- Hechos después (027): soporte de la factura, Excel de compras, crear producto desde la compra. Facturas vs Compras (resuelto): "Facturas" queda como ARCHIVO de soportes (adjuntos de gastos + facturas antiguas + soportes de compras, estos solo para el administrador y con enlace a la compra, filtro por origen). Las compras se registran en Compras; la mercancía no se registra como gasto.

## B2. Descuentos (2026-11-19): SIN commit; correr migración 025 (después de la 024) antes de desplegar
Migración **025** (`sql/025_descuentos.sql`). Cambia la firma de `create_sale` (agrega `p_discount`): la app nueva NO funciona sin la 025. Probada en Postgres local: instalación limpia 001–025, 500 ventas al azar donde el cálculo SQL y `lib/discounts.ts` dieron exactamente lo mismo (total, impuesto y cada línea), tope del auxiliar y validaciones, y las pruebas del fiado siguen pasando. `tsc`, `eslint` y `next build` pasan. Falta probar en la app.
- **Por producto**: botón de etiqueta en cada línea del carrito → descuento en % o en $ sobre lo que paga el cliente por esa línea (con impuesto).
- **A toda la venta**: campo "Descuento a toda la venta" (% o $) sobre lo que queda después de los descuentos por producto. Se reparte entre las líneas en proporción a su valor para que el IVA de cada línea quede bien.
- Los descuentos se redondean a pesos enteros.
- **Tope del auxiliar**: Mi Cuenta → "Medios de pago y descuentos" → Descuento máximo para auxiliares (10 % por defecto; 0 = no pueden descontar). Se mide sobre el valor de la venta antes de descuentos. El administrador no tiene tope. Lo valida el servidor.
- **Factura, ticket y PDF**: cada línea muestra su valor antes del descuento y "Descuento -X"; aparte "Descuento a la venta -X". Historial: "Descuento: $X".
- **Utilidad**: usa lo realmente cobrado (sin impuesto, con descuento). Caja y fiado usan el total ya descontado.
- Ventas en espera guardan los descuentos.
- Si se cambia el cálculo en la 025, cambiar también `lib/discounts.ts` (el pago mixto debe sumar exactamente el total del servidor).
- Probar: descuento % y $ por producto y a la venta, con y sin impuestos (precios con y sin IVA incluido); auxiliar dentro y fuera del tope; venta mixta y fiada con descuento; factura, ticket 58mm y PDF; Informes → Utilidad.

## B1. Fiado, cartera y medios de pago (2026-11-19): SIN commit; correr migración 024 antes de desplegar
Migración **024** (`sql/024_fiado_cartera_medios_pago.sql`) probada en Postgres local (001–024, y la 024 dos veces): fiado total y mixto, cupos del auxiliar, abonos repartidos (más antigua primero o a una venta), devolución de venta fiada con abonos, anulación de abonos, cierre de caja y utilidad. `tsc`, `eslint` y `next build` pasan. Falta probar en la app (no se vio en navegador).
- **Mi Cuenta → Medios de pago** (administrador): activar Nequi, Daviplata, Llave, Tarjeta/datáfono, "Otro" (con nombre propio, ej. Bold) y Fiado; plazo del fiado por defecto (30 días). Por defecto quedan activos Nequi, Daviplata y Llave (como antes). El servidor rechaza medios desactivados.
- **Venta**: botones según los medios activos; Fiado total o una parte en Mixto. Muestra cuánto debe el cliente, su cupo y la fecha de vencimiento. La factura, el ticket y el PDF dicen "Fiado $X, vence ...".
- **Reglas del fiado**: el administrador fía siempre (también a cliente nuevo y por encima del cupo). El auxiliar solo a clientes ya registrados, con cupo asignado y sin pasarse. El fiado exige el módulo Clientes y un cliente (no consumidor final).
- **Clientes**: cupo de fiado y plazo propio por cliente (solo administrador); columna "Debe" con enlace a la cartera. Un cliente con saldo pendiente no se puede eliminar.
- **Cartera** (menú; aparece si el fiado está activo; módulo Clientes): total por cobrar, vencido por antigüedad (1-30, 31-60, 61-90, +90) y Excel (administrador). Detalle por cliente: ventas fiadas con saldo y vencimiento; registrar abono (cualquier usuario con la caja de hoy abierta; medio de pago; a la más antigua o a una venta); anular abono (solo administrador, con la caja de ese día abierta); recordatorio por WhatsApp con el saldo.
- **Caja**: lo fiado NO entra a la caja; los abonos entran el día en que se reciben (en efectivo suman al esperado; los de otros medios se muestran aparte). Devolución de una venta fiada: cancela lo que se debía y devuelve solo lo pagado (lo cobrado al vender más los abonos, cada uno por su medio). Una venta fiada con abonos no se puede ANULAR (anular primero los abonos o hacer devolución).
- **Utilidad**: lo fiado cuenta como venta del día en que se vendió.
- Probar: activar Fiado y Tarjeta en Mi Cuenta; poner cupo a un cliente; vender fiado y mixto con el auxiliar (dentro y fuera del cupo) y con el administrador; ver factura y PDF; abonar (total, parcial, a una venta); recordatorio por WhatsApp; cierre de caja con abonos; devolver una venta fiada con abonos; anular un abono; Excel de cartera; ventas en espera viejas siguen abriendo.
- Pendiente menor: "Cartera" se oculta del menú si se desactiva el fiado aunque haya deudas (se llega desde Clientes → "Debe").

## Devoluciones, ventas en espera y Mi Cuenta (2026-11-08) — subido a GitHub, migraciones 019–021 corridas en Supabase; falta probar en producción
- [ ] **Color de la página y Datos de facturación pasaron de Super Admin a Mi Cuenta** (solo administrador). Tipo de negocio sigue en Super Admin. Acciones `updateMyThemeColor` y `updateMyInvoiceSettings` en `lib/actions/cuenta.ts` (usan service role porque RLS de organizations es solo super admin).
- [ ] **Devoluciones**: botón en el historial de Ventas por Productos (solo administrador). Devuelve la venta completa, regresa stock y la saca de informes. Si el cliente conserva productos, se registra de nuevo la venta con esos. **Correr migración 019 (`sql/019_devoluciones.sql`) antes de desplegar.** **Migración 021** (`sql/021_devoluciones_en_su_dia.sql`): la devolución se descuenta en el día en que se hace (caja, ventas del día, utilidad, por el mismo medio de pago), sin tocar el día original ni exigir reabrir su caja. Requiere la caja de HOY abierta. Las anulaciones siguen igual (solo antes del cierre del día de la venta). Probada en un Postgres en memoria; falta probar en producción: devolver una venta de hace días y revisar cierre de caja, Ventas y Gastos e Informes → Utilidad.
- [ ] **Ventas en espera (borrador compartido)**: el carrito se guarda solo en la base (migración **020_borradores_venta.sql**, correr antes de desplegar). Cada venta tiene un responsable; todos ven quién la inició y quién la tiene, solo el responsable la edita; se puede pasar a otro usuario o el administrador la toma. Se borra al confirmar la venta y a los 3 días. Probar con dos usuarios a la vez.

## Actualización de dependencias (2026-11-11) — subido (commit 44ff4a1)
- [ ] Next 16.3.5 → 16.4.6 (y eslint-config-next), zod 4.6.7, sharp 0.35.5 y brace-expansion vía `npm audit fix`. `tsc`, `eslint` y `next build` pasan. Queda 1 aviso moderado (`uuid` dentro de `exceljs`; su "arreglo" bajaría exceljs a 3.4.0, se descartó). Probar en local flujos principales antes de desplegar.
- [x] **Migraciones 022 y 023**: el usuario las corrió en Supabase el 2026-11-11, antes del push.

## Impuestos y datos fiscales (preparación para factura electrónica) — 2026-11-11, subido (commit 2ac942b); falta probar en la app
Hecho en código y probado en un Postgres local (001–023 + ventas, devolución y utilidad con cifras); falta probar en la app y en producción.
- [ ] **Todo apagado por defecto.** En Mi Cuenta → Datos de facturación el administrador activa "Manejar impuestos" y elige si sus precios YA incluyen el impuesto o se suman encima (opción por negocio). Mientras esté apagado, nada cambia.
- [ ] **Impuesto por producto** (Catálogo, solo si el negocio lo activó): sin impuesto (excluido), exento, IVA 5% / 19%, impuesto al consumo 4% / 8% / 16%. Los productos existentes quedan en "sin impuesto".
- [ ] La venta guarda desglose por ítem (taxKind, taxRate, base, tax) y sales.tax_total. create_sale() lo calcula en el servidor; lib/tax.ts replica el cálculo para mostrar el total en el carrito (deben coincidir; si se cambia uno, cambiar el otro).
- [ ] Utilidad usa el ingreso SIN impuesto; cierre de caja y listados siguen usando el total cobrado.
- [ ] Factura (pantalla, impresión y PDF): muestra subtotal e impuestos si la venta los tiene; NIT con DV, régimen, ciudad, tipo de documento del cliente y resolución DIAN si están llenos.
- [ ] Datos fiscales del negocio (DV, régimen, ciudad, responsabilidades, resolución con rango y vigencia) y tipo de documento del cliente (módulo Clientes).
- Por ahora NO hace: enviar a la DIAN ni al proveedor tecnológico, CUFE/QR, notas crédito, validar rango/vigencia de la resolución al vender. Tampoco: tipo de documento al crear un cliente nuevo desde la venta (solo en el módulo Clientes), importación masiva con impuesto (entra "sin impuesto"), buscador del catálogo muestra el precio base.
- Probar: activar impuestos en una organización de prueba, poner IVA a un producto, vender (con precios incluidos y sin incluir), imprimir/PDF, devolver esa venta, revisar Informes → Utilidad y cierre de caja.

## 2026-11-13: arreglos de la revisión + impresión 58mm — subido
- [ ] `lib/validations/cuenta.ts`: el rango de la resolución DIAN vacío se guardaba como 0 (z.coerce.number convierte "" en 0); ahora vacío = sin valor. Si alguien ya guardó Datos de facturación con esos campos vacíos, quedaron en 0: abrir Mi Cuenta, dejarlos en blanco y guardar.
- [ ] `components/informes/ventas-productos-report-card.tsx`: el detalle mostraba el precio unitario sin impuesto junto a un subtotal con impuesto; ahora muestra el precio final por unidad.
- [ ] `thermal-invoice.tsx`: impresión 58mm ajustada (@page sin margen, ticket al ancho exacto del papel, relleno y letra menores, corte de palabras largas). Falta probar en la impresora de 58mm real (en el diálogo de impresión: márgenes "ninguno" y sin encabezados/pies de página).
- [ ] Impresión 58mm, segunda pasada (2026-11-13): el ticket se arma a 47mm útiles (la cabeza térmica imprime 48mm de 58mm de papel; 72mm de 80mm) y la letra sale más gruesa y negra. Impresora del usuario: POS-5890U-L (Zjiang, ESC/POS, USB+Bluetooth), controlador oficial PrinterDriver.exe. En el diálogo de Chrome: papel ZPrinter 58 x 3276mm, márgenes Ninguno, escala 100%. Falta confirmar que sale completo (precio y total). Impresión directa por Bluetooth (ESC/POS) quedó descartada por ahora.
- [ ] **Ventas por Productos en celular** (2026-11-13): barra inferior "N productos · total [Continuar →]" que abre el panel de la venta como hoja desde abajo; filtro por categorías (PC y celular); en PC el panel de la venta queda fijo y se desplaza solo si es más alto que la pantalla. Solo diseño (`sale-cart.tsx`, y `page.tsx` lee las categorías). Falta probarlo en celular real: agregar productos, Continuar, confirmar venta, categorías, y que en PC se vea igual que antes.
- [ ] **Barra "Continuar" que no salía** (2026-11-13): la animación `.page-enter` usaba `both` y dejaba una transformación activa que anclaba los elementos `fixed` al final de la página; ahora usa `backwards` (`globals.css`). Falta confirmarlo en celular.
- [ ] **Historial de Ventas por Productos**: ahora muestra solo las ventas de hoy (hora de Colombia); botón "Ver más: últimos 7 días" y las fechas Desde/Hasta para otros días (máx. 50 resultados en búsquedas y en los 7 días). Falta probarlo.
- Manual de la impresora USB 58mm: `docs/configuracion-impresora-usb-58mm.md`.
- Riesgos menores conocidos (no tocados): total del carrito usa la config de impuestos del momento de cargar la página (recargar si el admin la cambia); si falla solo el guardado del impuesto al crear un producto, el producto queda creado y reintentar choca por código de barras; el buscador del catálogo muestra el precio base.

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
001–027. README.md lista hasta la 027. Las migraciones se corren a mano en Supabase antes del despliegue.
