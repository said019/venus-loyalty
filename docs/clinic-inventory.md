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

## Facturas pendientes de clasificar

En Catálogo → Facturas, administración ve el documento original y las piezas pendientes por concepto. La carga de una factura no suma stock. Cada asignación permite elegir piezas, destino (venta o consultorio) y producto existente o nuevo. Un concepto se puede repartir entre ambos destinos mediante asignaciones parciales.

Para un producto nuevo de venta, administración fija el precio de venta; el costo se deriva del costo de compra con descuentos e IVA. Los precios y costos de productos existentes no cambian. Para consultorio se exige confirmar ml por envase incluso cuando hay una sugerencia del documento. Las presentaciones en gramos, faltantes o contradictorias no se convierten automáticamente.

Las asignaciones se registran con usuario, destino y cantidad. Un descuento condicional de piezas pendientes, el aumento de stock y la bitácora ocurren en una misma transacción. La referencia de cada confirmación evita duplicados. PDF y endpoints de facturas requieren administración. El PDF se conserva en la base de datos, no en el directorio público ni en Git.

Instalar primero `prisma/migrations/20261020010000_purchase_invoices/migration.sql` y generar Prisma. La factura importada conserva sus totales originales; esta función no registra gastos contables ni ingresos automáticamente.

Pruebas: `CLINIC_TEST_DATABASE_URL=postgresql://...@127.0.0.1:55439/postgres node --test tests/purchase-invoices.integration.test.js`. Navegador: `CLINIC_TEST_DATABASE_URL=... PLAYWRIGHT_MODULE=... node tests/purchase-invoices.browser.mjs`.

### Costos y descuento de compra
En Facturas → Costo y precio al público se guarda el precio del proveedor por pieza antes del descuento (con IVA), una nota de compra y el precio al público propuesto. El costo pagado se conserva desde el total de la línea de factura dividido entre sus piezas. El descuento se calcula contra ese costo, y la diferencia de venta se muestra antes de otros gastos. Los campos propuestos pueden dejarse pendientes. El precio propuesto se precarga al crear un producto nuevo durante la asignación; un producto existente conserva su precio y se edita desde Venta (unidades).

La migración aditiva `20261020020000_purchase_prices` añade estos datos opcionales sin modificar existencias, importes fiscales ni asignaciones. El ticket 5294 de la compra en expo corresponde a las mismas 20 piezas de la factura 809: importes con IVA $7,620 antes del descuento, $3,233 de descuento y $4,387 pagados. No se debe importar como una segunda compra.

### Tabla conjunta de compras
Catálogo → Facturas muestra todos los conceptos juntos, con búsqueda y filtro de pendientes. Administración escribe cantidades para venta y consultorio, precio por pieza y ml confirmados por envase. Guardar cambios procesa las filas editadas; cada fila guarda ambos destinos en una transacción. Los errores permanecen visibles sin borrar los datos y los reintentos de envíos inciertos conservan su referencia para evitar duplicar stock. Se pueden completar nombres y modificar el precio de productos de venta vinculados desde la tabla. Los comprobantes originales siguen accesibles en cada fila.
