# Mejoras pendientes — Stockia

Lista de mejoras acordadas para hacer más adelante. Aún **no implementadas**.
Cuando se pregunte "qué está pendiente", esta es la fuente. Al completar una,
márcala con `[x]` y anota la fecha.

Registrado: 2026-11-02

## 1. Catálogo: el cuadro de agregar debe cerrarse al guardar
- [x] (2026-11-05) Al guardar una categoría o un producto, el diálogo debe cerrarse solo.
- Hoy el cuadro queda abierto y hay que volver a pulsar "Agregar" para abrirlo.

## 2. Diseño responsive (móvil)
- [ ] Hoy en móvil hay que hacer scroll horizontal para ver la pantalla completa
  (productos, tablas, etc.).
- Adaptar el layout, el sidebar y las tablas para pantallas pequeñas.

## 3. Icono de sumar/restar cantidad de producto
- [x] (2026-11-05) El icono actual parece el de "ordenar/organizar".
- Cambiarlo por un **+** (y un **−** para restar) que refleje lo que hace.

## 4. Ventas por productos → Ventas y Gastos + cierre de caja
- [ ] Las ventas hechas en "Ventas por productos" deben reflejarse
  automáticamente en el módulo "Ventas y Gastos".
- [ ] Desde "Ventas y Gastos" se debe poder hacer un **cierre de caja**.
- [ ] Se debe poder registrar una **base de dinero** (efectivo inicial de caja)
  para el cierre.

## 5. Correo del cliente en la venta por productos
- [ ] Agregar el campo de correo del cliente en la venta por productos.
- Es importante tenerlo, pero **opcional** (no obligatorio).

## 6. Métodos de pago
- [ ] Agregar método de pago en la venta:
  - **Efectivo**
  - **Transferencia**, indicando el origen: **Nequi**, **Daviplata** o **Llave**
  - **Mixto** (combinación de los anteriores, con el monto de cada uno)
- [ ] El método de pago debe verse reflejado en el **cierre de caja**.
- [ ] El método de pago debe verse reflejado en los **informes**.

## Notas
- Las mejoras 4, 5 y 6 están relacionadas (venta → método de pago → cierre de
  caja → informes); conviene diseñarlas juntas.
- Cualquier cambio de esquema va como nueva migración en `sql/` (siguiente
  número: `013_...`) y debe aplicarse también en Supabase.
