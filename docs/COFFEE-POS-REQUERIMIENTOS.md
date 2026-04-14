# Product Brief: Venus The Coffee Bar — Punto de Venta (POS)

**Fecha:** 13 de abril de 2026
**Autor:** Business Analyst (via BMAD skill)
**Status:** Draft — Listo para revision de stakeholder
**Version:** 1.0

---

## 1. Resumen Ejecutivo

Venus Beauty ya opera un sistema de lealtad, citas, catalogo de servicios, notificaciones y wallet passes desde un panel de admin monolitico (HTML legacy + React "New version"). El codigo del admin ya es demasiado grande.

Se necesita agregar un **Punto de Venta (POS) para cafeteria** llamado **"Venus The Coffee Bar"** que viva dentro del ecosistema admin pero **como modulo totalmente separado**, sin inflar las paginas de admin existentes.

**Puntos clave:**
- **Problema:** No hay forma de registrar ventas de cafeteria; todo se hace informal o en papel.
- **Solucion:** Un POS dedicado, accesible desde admin pero con su propia pagina/UI.
- **Usuarios objetivo:** Cajero(a) de cafeteria y admin/dueña del negocio.
- **Linea de tiempo:** Fase 1 (MVP funcional), Fase 2 (avanzado), Fase 3 (fiscal/escala).

---

## 2. Definicion del Problema

### El problema

No existe un sistema digital para registrar ventas de la cafeteria "Venus The Coffee Bar". Las ventas se manejan de forma informal, lo que provoca:
- Falta de control sobre ingresos reales de cafeteria.
- No hay historial de que se vendio, cuando ni quien cobro.
- No se puede saber que productos se venden mas o menos.
- No hay control de caja (apertura/cierre/diferencias).
- No se puede cruzar informacion de cafeteria con el resto del negocio (servicios de belleza, citas, etc.).

### Quien lo experimenta

**Usuarios primarios:**
- **Cajera de cafeteria** — necesita registrar ventas rapido sin capacitacion compleja.
- **Admin/dueña** — necesita ver reportes, controlar caja y tomar decisiones.

**Usuarios secundarios:**
- **Clientas** — reciben ticket de compra.

### Situacion actual

- Ventas se anotan en papel o no se registran.
- No hay corte de caja formal.
- No se sabe el margen real de la cafeteria.
- El inventario de insumos no se rastrea.

### Impacto y urgencia

- **Si no se resuelve:** Seguira habiendo fuga de informacion financiera y no se podra evaluar si la cafeteria es rentable.
- **Por que ahora:** La cafeteria ya esta operando y necesita formalizarse.
- **Frecuencia:** Problema diario, cada venta que ocurre.

---

## 3. Usuarios Objetivo

### Persona 1: Cajera / Barista
- **Rol:** Opera la caja, prepara bebidas, cobra.
- **Metas:** Cobrar rapido, no equivocarse, cerrar su turno limpio.
- **Puntos de dolor:** No tiene herramienta digital, anota en papel, no sabe si cuadra la caja.
- **Nivel tecnico:** Basico — usa celular pero no sistemas complejos.
- **Patron de uso:** Todo el turno, cada venta (15-40 ventas/dia estimado).

### Persona 2: Admin / Dueña
- **Rol:** Supervisa cafeteria, revisa numeros, toma decisiones.
- **Metas:** Saber cuanto vende la cafeteria, que se vende mas, que la caja cuadre.
- **Puntos de dolor:** No tiene datos; depende de lo que le digan verbalmente.
- **Nivel tecnico:** Intermedio — ya usa el admin de Venus para citas y lealtad.
- **Patron de uso:** Diario al cierre, semanal para reportes.

### Necesidades del usuario

**Debe tener (Must have):**
- Registrar una venta rapidamente (< 30 segundos).
- Ver el total con impuestos.
- Cobrar en efectivo, tarjeta o transferencia.
- Imprimir o ver un ticket.
- Abrir y cerrar caja con control de montos.
- Ver ventas del dia y corte de caja.

**Deberia tener (Should have):**
- Buscar producto por nombre.
- Notas por producto ("sin azucar", "extra caliente").
- Descuentos por item o por venta.
- Reporte de productos mas vendidos.

**Seria bueno (Nice to have):**
- Pago mixto (parte efectivo, parte tarjeta).
- Inventario con alertas de bajo stock.
- Integracion con lealtad (sello por compra de cafe).
- Impresion en termica.

---

## 4. Solucion Propuesta

### Vista general

Un modulo POS web separado del admin de tabs, accesible via un boton/link desde el sidebar del admin, que abre su propia pagina completa (`/coffee-pos`). Reutiliza la autenticacion admin existente (cookie JWT "adm").

### Capacidades clave

1. **Catalogo de productos de cafeteria**
   - Descripcion: ABM de productos con nombre, SKU (opcional), categoria, precio, impuesto, variantes (tamano, extras).
   - Valor al usuario: La cajera tiene los productos listos para vender; el admin los configura una vez.

2. **Carrito de venta**
   - Descripcion: Agregar productos a una orden, editar cantidad, aplicar descuento, agregar notas por item. Calculo en tiempo real de subtotal, impuesto y total.
   - Valor al usuario: La cajera arma la orden completa antes de cobrar, sin errores de calculo.

3. **Cobro y metodo de pago**
   - Descripcion: Seleccionar metodo de pago (efectivo/tarjeta/transferencia), calcular cambio si es efectivo, confirmar venta y generar folio unico.
   - Valor al usuario: Cada venta queda registrada con metodo de pago real.

4. **Ticket imprimible**
   - Descripcion: Ticket en formato web (print CSS) con datos del negocio, items, totales, cajero, fecha/hora, folio.
   - Valor al usuario: La clienta se lleva comprobante; el negocio tiene respaldo.

5. **Control de caja**
   - Descripcion: Apertura de caja (monto inicial), cierre (monto final, diferencia esperada vs real), historial de movimientos (entradas/salidas).
   - Valor al usuario: La dueña sabe si la caja cuadro o hay faltante, por turno/dia.

6. **Reportes operativos**
   - Descripcion: Ventas del dia, por metodo de pago, top productos, corte por cajero.
   - Valor al usuario: Decisiones basadas en datos reales, no en estimaciones.

### Que lo hace diferente

No es un POS generico — esta integrado al ecosistema Venus:
- Misma autenticacion, mismo servidor, misma base de datos.
- Posibilidad futura de dar sellos de lealtad por compras de cafe.
- La dueña ve todo (servicios de belleza + cafeteria) desde una sola plataforma.

### MVP (Minimo Viable)

**Funciones core para MVP:**
- Catalogo de productos de cafe (CRUD).
- Carrito → cobro → ticket web.
- Apertura/cierre de caja.
- Reporte de ventas del dia.
- Pagina propia separada del admin de tabs.

**Diferido a despues:**
- Pago mixto.
- Inventario con descuento automatico de stock.
- Impresion termica.
- Integracion con sellos de lealtad.
- Facturacion fiscal / CFDI.

---

## 5. Metricas de Exito

### Metricas primarias

**Ventas registradas digitalmente**
- Baseline: 0 (todo en papel).
- Target: 100% de ventas de cafeteria registradas en POS.
- Timeline: 2 semanas post-lanzamiento.
- Medicion: COUNT de PosSale por dia vs estimacion de ventas reales.

**Tiempo por venta**
- Baseline: Sin dato (papel).
- Target: < 30 segundos desde primer producto hasta ticket.
- Timeline: 1 semana de uso.
- Medicion: Timestamp entre creacion de primer item y confirmacion de venta.

**Precision de caja**
- Baseline: Desconocida (no hay corte formal).
- Target: Diferencia de caja < $50 MXN por turno.
- Timeline: 1 mes.
- Medicion: Campo `difference` en PosCashSession.

### Metricas secundarias
- Ticket promedio (monto por venta).
- Productos mas vendidos (para optimizar menu).
- Ventas por hora (para staffing).

### Criterios de exito

**Debe lograr:**
- La cajera puede registrar una venta sin ayuda despues de 10 minutos de capacitacion.
- La dueña puede ver el corte del dia en cualquier momento.

**Deberia lograr:**
- Reducir discrepancias de caja a < 2% del total diario.
- Tener datos suficientes para decidir que productos mantener/quitar en 1 mes.

---

## 6. Contexto de Mercado y Competencia

### Competidores de POS para cafeterias en Mexico

| POS | Fortalezas | Debilidades | Precio |
|-----|-----------|-------------|--------|
| **Clip POS** | Hardware + software, pagos con tarjeta integrados | Costo mensual, requiere su terminal | $299-599/mes + comision |
| **Square (Squareup)** | UX excelente, reportes | Poco adoptado en Mexico, comisiones altas | 2.6% + fee |
| **Poster POS** | Inventario avanzado, multi-sucursal | Complejo para cafeteria chica, costo | $500+/mes |
| **Loyverse** | Gratis para basico, bueno para cafes | Limitado en personalizacion, datos en su nube | Gratis / addons |

### Ventajas competitivas de Venus Coffee POS

- **Cero costo adicional** — ya esta en la infraestructura de Venus.
- **Integracion nativa** — lealtad, citas, wallet, todo en un lugar.
- **Sin dependencia externa** — los datos son tuyos, en tu BD Postgres.
- **Personalizado** — hecho a la medida del flujo real de Venus.

### Brechas por cerrar
- No hay hardware de pago integrado (se cobra aparte con terminal bancaria existente).
- No hay facturacion fiscal (CFDI) en MVP.

---

## 7. Consideraciones Tecnicas

### Restriccion arquitectonica fundamental

> **El codigo del admin ya es demasiado grande. El POS NO debe agregarse como un tab mas dentro de Admin.tsx.**

### Decision de arquitectura: Modulo separado

```
┌─────────────────────────────────────────────────────┐
│                  Express Server (server.js)          │
│                                                      │
│  /admin.html  ──→  Admin legacy (HTML/JS)           │
│  /admin (React) ──→  Admin tabs (Dashboard, Cards…) │
│  /coffee-pos  ──→  POS SEPARADO (nueva pagina)  ✅  │
│                                                      │
│  /api/admin/*    ──→  Rutas admin existentes        │
│  /api/pos/*      ──→  Rutas POS nuevas          ✅  │
│                                                      │
│  Auth: misma cookie JWT "adm" + adminAuth()         │
└─────────────────────────────────────────────────────┘
```

### Archivos a crear (NO tocar admin existente salvo link)

| Archivo | Proposito |
|---------|-----------|
| `public/coffee-pos.html` | Pagina standalone del POS |
| `public/coffee-pos.js` | Logica frontend del POS |
| `public/coffee-pos.css` | Estilos propios del POS |
| `lib/api/coffee-pos.js` | Router Express con todos los endpoints POS |
| `prisma/schema.prisma` | Agregar modelos POS (CoffeeProduct, CoffeeSale, etc.) |

| Archivo existente | Cambio minimo |
|-------------------|---------------|
| `server.js` | 2 lineas: `import` + `app.use('/api/pos', coffeePosRouter)` |
| `AdminSidebar.tsx` (o admin.html) | 1 link/boton: "Coffee Bar POS →" que abre `/coffee-pos` en nueva ventana |

### Integraciones existentes que se reusan

- **Autenticacion:** `lib/auth.js` → `adminAuth()` middleware, cookie "adm".
- **Base de datos:** Prisma + PostgreSQL (misma instancia).
- **Servidor:** Mismo Express, mismo deploy en Render.

### Modelo de datos propuesto (Prisma)

```prisma
// ===== VENUS THE COFFEE BAR - POS =====

model CoffeeProduct {
  id         String   @id @default(cuid())
  name       String                         // "Americano", "Latte", "Croissant"
  category   String                         // "cafe_caliente", "cafe_frio", "panaderia", "extras"
  price      Float                          // Precio base
  taxRate    Float    @default(0.16)        // IVA 16%
  isActive   Boolean  @default(true)
  sortOrder  Int      @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  variants   CoffeeProductVariant[]
  saleItems  CoffeeSaleItem[]
}

model CoffeeProductVariant {
  id         String   @id @default(cuid())
  productId  String
  name       String                         // "Grande", "Leche de almendra"
  type       String                         // "size", "extra"
  priceAdj   Float    @default(0)           // Ajuste al precio base (+15, +10, etc.)
  isActive   Boolean  @default(true)
  product    CoffeeProduct @relation(fields: [productId], references: [id], onDelete: Cascade)
}

model CoffeeSale {
  id            String   @id @default(cuid())
  folio         String   @unique            // "VCB-20260413-001"
  cashSessionId String?
  cashierName   String                      // Quien cobro
  subtotal      Float
  tax           Float
  discount      Float    @default(0)
  total         Float
  paymentMethod String                      // "efectivo", "tarjeta", "transferencia"
  amountPaid    Float?                      // Para calcular cambio en efectivo
  change        Float?                      // Cambio devuelto
  status        String   @default("completed") // "completed", "cancelled"
  cancelReason  String?
  cancelledBy   String?
  createdAt     DateTime @default(now())
  items         CoffeeSaleItem[]
  cashSession   CoffeeCashSession? @relation(fields: [cashSessionId], references: [id])
}

model CoffeeSaleItem {
  id         String   @id @default(cuid())
  saleId     String
  productId  String
  productName String                        // Snapshot del nombre al momento de venta
  qty        Int      @default(1)
  unitPrice  Float                          // Precio con variantes aplicadas
  discount   Float    @default(0)
  notes      String?                        // "sin azucar", "extra caliente"
  variants   String?                        // JSON de variantes seleccionadas
  sale       CoffeeSale    @relation(fields: [saleId], references: [id], onDelete: Cascade)
  product    CoffeeProduct @relation(fields: [productId], references: [id])
}

model CoffeeCashSession {
  id            String    @id @default(cuid())
  openedBy      String
  openedAt      DateTime  @default(now())
  openingAmount Float                       // Fondo de caja inicial
  closedBy      String?
  closedAt      DateTime?
  expectedCash  Float?                      // Calculado: apertura + ventas efectivo - retiros
  actualCash    Float?                      // Lo que la cajera conto
  difference    Float?                      // actualCash - expectedCash
  totalSales    Float?                      // Suma de todas las ventas del turno
  status        String    @default("open")  // "open", "closed"
  notes         String?
  sales         CoffeeSale[]
  movements     CoffeeCashMovement[]
}

model CoffeeCashMovement {
  id            String   @id @default(cuid())
  cashSessionId String
  type          String                      // "income", "withdrawal"
  amount        Float
  reason        String                      // "Cambio de billete", "Pago a proveedor"
  createdBy     String
  createdAt     DateTime @default(now())
  cashSession   CoffeeCashSession @relation(fields: [cashSessionId], references: [id])
}
```

### API Endpoints

```
POST   /api/pos/products              — Crear producto
GET    /api/pos/products              — Listar productos activos (con variantes)
PUT    /api/pos/products/:id          — Editar producto
DELETE /api/pos/products/:id          — Desactivar producto

POST   /api/pos/sales                 — Registrar venta (carrito completo)
GET    /api/pos/sales                 — Listar ventas (filtros: fecha, cajero, status)
GET    /api/pos/sales/:id             — Detalle de venta + items
POST   /api/pos/sales/:id/cancel      — Cancelar venta (con motivo)

POST   /api/pos/cash/open             — Abrir sesion de caja
POST   /api/pos/cash/close            — Cerrar sesion de caja
GET    /api/pos/cash/current          — Sesion de caja activa
POST   /api/pos/cash/movement         — Registrar entrada/salida de efectivo

GET    /api/pos/reports/daily          — Resumen del dia (ventas, metodos, totales)
GET    /api/pos/reports/top-products   — Productos mas vendidos (rango de fechas)
GET    /api/pos/reports/by-cashier     — Ventas por cajero
```

### Patron de respuesta (consistente con el resto de la app)

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "Mensaje de error" }
```

---

## 8. UX del POS

### Layout de pantalla

```
┌──────────────────────────────────────────────────────────┐
│  Venus The Coffee Bar ☕            Cajera: Ana   [Caja] │
├─────────────────────────────┬────────────────────────────┤
│                             │                            │
│  [Cafe caliente] [Frio]    │   ORDEN ACTUAL             │
│  [Panaderia] [Extras]      │                            │
│                             │   1x Americano Gde  $45   │
│  ┌─────┐ ┌─────┐ ┌─────┐  │   1x Croissant       $35   │
│  │Ameri│ │Latte│ │Mocha│  │      -10% desc      -$3.5  │
│  │ $35 │ │ $45 │ │ $50 │  │                            │
│  └─────┘ └─────┘ └─────┘  │   ─────────────────────    │
│  ┌─────┐ ┌─────┐ ┌─────┐  │   Subtotal:        $76.50  │
│  │Cappu│ │Espre│ │  Te │  │   IVA 16%:         $12.24  │
│  │ $45 │ │ $30 │ │ $30 │  │   TOTAL:           $88.74  │
│  └─────┘ └─────┘ └─────┘  │                            │
│                             │   [Efectivo] [Tarjeta]    │
│                             │   [Transferencia]          │
│                             │                            │
│                             │   [ COBRAR $88.74 ]       │
│                             │                            │
└─────────────────────────────┴────────────────────────────┘
```

### Principios de UX
- **Botones grandes** — optimizado para touch/tablet en mostrador.
- **Maximo 2 taps para agregar producto** — tap categoria → tap producto.
- **Cobro en 1 tap** — seleccionar metodo → confirmar.
- **Colores claros** — categorias con color coding para ubicacion visual rapida.
- **Ticket automatico** — se muestra al confirmar venta con opcion de imprimir.

---

## 9. Riesgos y Mitigacion

### Riesgos altos

**Riesgo 1: Cajera no adopta el sistema**
- Probabilidad: Media
- Impacto: Alto (vuelve al papel)
- Mitigacion: UI extremadamente simple; capacitacion de 10 min; botones grandes para touch.

**Riesgo 2: Caja descuadrada por errores de registro**
- Probabilidad: Media
- Impacto: Medio
- Mitigacion: Cancelaciones requieren motivo; cierre de caja muestra diferencia clara; historial auditable.

**Riesgo 3: El modulo crece y se vuelve otro admin gigante**
- Probabilidad: Baja-Media
- Impacto: Alto (deuda tecnica)
- Mitigacion: Mantener modulo 100% separado; archivos propios; no compartir componentes UI con admin.

### Riesgos medios
- Internet inestable en mostrador → considerar cache local (service worker) en Fase 2.
- Volumen alto en horas pico → optimizar queries con indices.
- Concurrencia si dos personas usan el POS → la sesion de caja es por apertura, no por pestana.

### Supuestos criticos
- Solo hay 1 punto de venta fisico (1 caja).
- La cajera tiene acceso a tablet/computadora/celular con navegador.
- No se requiere facturacion fiscal (CFDI) en MVP.
- Los productos de cafeteria son distintos a los `Product` existentes en el admin (que son productos de belleza).

---

## 10. Estimacion de Recursos y Fases

### Fase 1 — MVP Funcional

**Que incluye:**
- Modelos Prisma + migracion.
- API: productos CRUD + ventas + caja.
- UI: pagina POS standalone con catalogo, carrito, cobro, ticket web.
- Reporte de ventas del dia.
- Link desde admin sidebar.

**Archivos a crear:**
1. `public/coffee-pos.html`
2. `public/coffee-pos.js`
3. `public/coffee-pos.css`
4. `lib/api/coffee-pos.js`

**Archivos a modificar (minimo):**
1. `prisma/schema.prisma` — agregar 5 modelos
2. `server.js` — 2 lineas (import + use)
3. `public/admin.html` o `AdminSidebar.tsx` — 1 link

### Fase 2 — Avanzado

- Pago mixto (dividir entre efectivo + tarjeta).
- Devolucion / cancelacion con permisos diferenciados.
- Inventario basico (stock, descuento por venta, alertas).
- Impresion termica (ESC/POS o PDF dedicado).
- Variantes de producto en UI (tamano, extras).

### Fase 3 — Escala

- Dashboard de rentabilidad cafeteria (ingresos - costos).
- Integracion lealtad: sello automatico por compra de cafe.
- CFDI / facturacion fiscal (Facturapi o similar).
- Multi-caja / multi-sucursal.
- Reportes cruzados belleza + cafeteria.

---

## 11. Reglas de Negocio

| Regla | Detalle |
|-------|---------|
| Venta sin pago | No se puede cerrar venta sin seleccionar metodo de pago |
| Cancelacion | Requiere motivo y nombre de quien cancela |
| Descuento maximo | Configurable (default 20%) |
| Cierre de caja | Obligatorio registrar monto real contado |
| Folio unico | Formato: `VCB-YYYYMMDD-NNN` (secuencial por dia) |
| Producto inactivo | No aparece en el POS pero se conserva en historial |
| Sesion de caja | Solo 1 abierta a la vez; debe cerrarse antes de abrir otra |

---

## 12. Siguiente paso recomendado

> **Handoff a implementacion:** Con este Product Brief aprobado, el siguiente paso es crear el PRD tecnico y comenzar con Fase 1:
> 1. Agregar modelos a `prisma/schema.prisma` y correr migracion.
> 2. Crear `lib/api/coffee-pos.js` con endpoints MVP.
> 3. Montar `server.js` con la nueva ruta.
> 4. Construir la UI en `public/coffee-pos.html` + `.js` + `.css`.
> 5. Agregar enlace en sidebar del admin.
> 6. Probar flujo completo: abrir caja → vender → cerrar caja → ver reporte.
