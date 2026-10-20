# Inventario de consultorio

En Catálogo, **Venta (unidades)** conserva el catálogo de productos existente y **Consultorio (ml)** administra insumos independientes.

1. Agregar un producto con contenido de un frasco, ml disponibles actuales (incluye frascos abiertos) y umbral de existencia baja.
2. Entrada o ajuste permite registrar ml comprados, mermas o pasar frascos enteros desde Venta. La transferencia descuenta unidades y suma el contenido del frasco en una transacción; no genera ingresos.
3. Al completar el cobro desde Agenda o Caja se pregunta por cada servicio, incluidos cobros agrupados. Introducir ml utilizados o indicar explícitamente que no se usaron productos. El consumo no cambia el pago.
4. Dejar para después conserva el servicio en Consultorio → Consumos pendientes. La migración fija la fecha inicial en 20 de octubre de 2026, inicio del día de México; no depende de haber creado el primer insumo.
5. Administración puede corregir un consumo: se aplica solo la diferencia y se agregan movimientos a la bitácora. Recepción puede registrar consumos y consultar; solo administración crea productos, mueve stock o corrige consumos.

Cantidades almacenadas como milésimas de ml enteras (hasta tres decimales). El saldo no puede ser negativo. Las escrituras tienen referencias de idempotencia; correcciones usan revisión optimista. Los descuentos y movimientos se guardan en transacciones. No se reponen ml por cancelar un cobro: el tratamiento pudo haberse realizado; se corrige el consumo expresamente.

## Instalación

Generar Prisma y aplicar `prisma/migrations/20261020000000_clinic_inventory/migration.sql` antes de publicar código que consulte estas tablas. La migración es aditiva e idempotente y no modifica productos, citas, pagos ni sus existencias. Debido al historial de tablas instaladas fuera de Prisma, no ejecutar `db push` ni todas las migraciones pendientes sobre producción como parte de este cambio.

## Verificación

- `node --test tests/clinic-inventory.test.js`
- Con PostgreSQL **local** y cliente Prisma generado contra el esquema: `CLINIC_TEST_DATABASE_URL=postgresql://...@127.0.0.1:55439/postgres node --test tests/clinic-inventory.integration.test.js`.
- Prueba de navegador: `CLINIC_TEST_DATABASE_URL=... PLAYWRIGHT_MODULE=/ruta/playwright/index.mjs node tests/clinic-inventory.browser.mjs`. Usa Chrome instalado y datos efímeros locales. No usar credenciales ni bases reales.

Las pruebas verifican precisión decimal, permisos, reintentos simultáneos, correcciones, saldo insuficiente, reversión transaccional de múltiples insumos, transferencia desde venta, competencia por el último saldo y flujos móvil/escritorio.
