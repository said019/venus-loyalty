# Venta Rápida: crear producto nuevo sin salir del modal

## Contexto

En "Nueva venta" (Venta Rápida, `admin.html` → `directSaleDialog`), el buscador
de "Servicio, producto o café" solo encuentra productos que ya existen en
Inventario. Si no existe, hoy el flujo obliga a cerrar el modal, ir a
Inventario, crear el producto ahí, y volver a abrir Venta Rápida para
cobrarlo. Said pidió poder crear el producto ahí mismo y cobrarlo de una vez.

De paso, Said pidió quitar la capa de compatibilidad Firestore→Prisma
(`src/db/compat.js`) del recurso `products`: aunque esa capa ya traduce todo
a Prisma por debajo (no hay Firebase real corriendo), seguía aparentando
serlo, y esa misma capa fue la causa de que Venta Rápida se cayera por
completo el 17-jul-2026 (`firestore.batch()` no estaba implementado).

## Alcance

1. Reescribir los 6 puntos de `server.js` que tocan `products` vía
   `firestore.collection('products')` para que llamen directo a
   `prisma.product`. Sin cambio de comportamiento — la capa de compat ya
   hacía exactamente esa traducción por debajo.
2. Agregar la opción de crear un producto nuevo desde el buscador de Venta
   Rápida cuando no hay resultados, y que quede listo para cobrar en el
   mismo flujo.

## Parte 1 — Quitar Firestore de `/api/products`

Puntos a reescribir en `server.js`, todos detrás de `adminAuth` +
`requireRole("admin")` (excepto el guardrail dentro de `/api/direct-sales`,
que ya vive detrás de `adminAuth`):

| Endpoint | Uso actual (compat) | Reemplazo |
|---|---|---|
| `GET /api/products` | `firestore.collection('products').orderBy('name','asc').get()` | `prisma.product.findMany({ orderBy: { name: 'asc' } })` |
| `POST /api/products` | `firestore.collection('products').add(productData)` | `prisma.product.create({ data })` |
| `PUT /api/products/:id` | `firestore.collection('products').doc(id).update(updateData)` | `prisma.product.update({ where: { id }, data })` |
| `DELETE /api/products/:id` | `firestore.collection('products').doc(id).delete()` | `prisma.product.delete({ where: { id } })` |
| `PATCH /api/products/:id/stock` | `.doc(id).get()` + `.update()` | `prisma.product.findUnique` + `prisma.product.update` |
| Guardrail en `POST /api/direct-sales` (candado de precio para recepción) | `firestore.collection('products').doc(item.productId).get()` | `prisma.product.findUnique({ where: { id: item.productId } })` |

Se deja de mandar `createdAt`/`updatedAt` manuales (la capa de compat ya los
descartaba y dejaba que Prisma los maneje solo vía `@default(now())` /
`@updatedAt` — mismo comportamiento final, código más limpio).

Formato de respuesta JSON idéntico al actual en los 4 endpoints públicos
(`{success, data}`, `{success, id, data}`, `{success}`, `{success, error}`,
`{success, newStock}`).

## Parte 2 — Crear producto desde Venta Rápida

**Disparador:** el buscador de producto (`dsFilterCatalog`) ya muestra "Sin
resultados" cuando no hay coincidencias. Se agrega ahí mismo un botón
`+ Crear producto nuevo` (solo si el usuario escribió algo).

**Formulario inline:** al hacer clic, el panel desplegable (`#ds-combo-panel`)
se reemplaza por un mini-formulario con 4 campos:
- Nombre — precargado con lo que se buscó
- Categoría — mismo catálogo que Inventario (Skincare / Maquillaje /
  Corporal / Cabello / Otro), default "Otro"
- Precio de venta
- Stock inicial — precargado con la cantidad puesta en el campo "Cantidad"
  del renglón de búsqueda (default 1), editable

Botones "Cancelar" (vuelve a la búsqueda normal) y "Crear y agregar".

**Al enviar:** `POST /api/products` (nombre y precio obligatorios, igual que
el formulario de Inventario). Si sale bien:
- El producto nuevo se agrega al catálogo en memoria de Venta Rápida
  (`dsCatalog`) y queda seleccionado, igual que si se hubiera elegido de la
  lista.
- El buscador muestra el nombre del producto, el panel se cierra, el foco
  salta a "Cantidad" — listo para tocar "Agregar" y luego "Cobrar" con el
  flujo normal, sin tocar nada más.

Si falla, mismo `venusAlert` de error que ya usa el resto del modal, sin
perder lo escrito.

**No se toca:** el descuento de stock al cobrar ya lee de `prisma.product`
directo (ver `server.js` línea ~1501-1512), así que el stock que se ponga al
crear el producto se descuenta correctamente cuando se cierra la venta — no
requiere cambios adicionales.

## Fuera de alcance

- No se toca `firestore.collection(...)` para ningún otro recurso (cards,
  appointments, etc.) — solo `products`.
- No se agrega confirmación tipo pop-up al crear el producto; sigue el mismo
  patrón silencioso que ya tiene elegir un producto existente del catálogo.
- No se edita el formulario completo de "Nuevo Producto" de Inventario
  (costo, presentación, stock mínimo, descripción) — el de Venta Rápida es
  una versión reducida a propósito.
