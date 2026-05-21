# Diseño: agendar.html — unificar con index + reconocer al cliente

**Fecha:** 2026-05-21
**Estado:** Aprobado por el usuario (brainstorming)

## Contexto

`agendar.html` es el flujo de reserva (wizard de 4 pasos: Identificación → Servicio →
Fecha → Listo). Tras el rediseño "Venus" la página principal pasó a ser `index.html`
(servida en `/`), pero `agendar.html` quedó desalineada:

- **Estética distinta:** usa su propio sistema de diseño (`vn-*`, oklch) y fuente
  Playfair Display; index usa clases `venus-*` (definidas en su `<style>`) y fuente
  **Prata** para títulos. El navbar de agendar tiene items que apuntan a la página
  **legacy** `/landing.html` (Inicio/Servicios/Resultados/Testimonios).
- **Flujo confuso:** aunque un cliente ya tenga tarjeta, al abrir `/agendar.html`
  directo se le pide el WhatsApp otra vez. Existe `autoIdentifyFromCard` que lee
  `?cardId` de la URL, pero solo funciona si llega haciendo clic desde su tarjeta;
  el acceso directo no lo reconoce. No hay persistencia de identidad (la clave
  `localStorage.venus_card` existe pero hoy solo se *borra*, nunca se *guarda*).

## Objetivo

Que agendar **deje de sentirse como otra página** y que **agendar deje de ser
confuso**: un cliente conocido no debe volver a teclear su WhatsApp.

## No-objetivos (YAGNI / seguridad)

- No tocar el wizard de 4 pasos (lógica ni estética del cuerpo).
- No tocar el cálculo de precio/descuento (10% bebida) ni el backend.
- No reescribir agendar al sistema `venus-*` completo (riesgo de romper el wizard).
- No agregar login/contraseña: el "reconocimiento" es por dispositivo, no auth.

## Parte 1 — Reconocer al cliente (localStorage `venus_card`)

**Estructura de datos:** `localStorage.venus_card` = JSON
`{ cardId: string, name: string, phone: string }` (phone normalizado a 10 dígitos).

**Puntos de escritura (set):**
- `index.html` → `showCardView(data)`: al mostrar la tarjeta, guardar
  `{ cardId, name, phone }`.
- `agendar.html` → `onSubmitPhone()`: tras un lookup exitoso (`json.exists`),
  guardar la identidad para que la próxima vez ya no pida el WhatsApp.

**Punto de lectura (get):** `agendar.html` → `autoIdentifyFromCard()` (al cargar):
1. cardId = `?cardId=` de la URL **o** `JSON.parse(localStorage.venus_card)?.cardId`.
2. Si hay cardId → fetch existente a `/api/card/:cardId` para **validar** y traer
   nombre/teléfono frescos.
3. Si válido → `existsClient=true`, `clientFirstName`, `clientCardId`, `clientPhone`
   (10 dígitos) y `goToStep(3)` (saltar el WhatsApp, saludo personalizado).

**Limpieza (clear) y fallback (seguridad):**
- Logout (botón existente en index): ya hace `removeItem('venus_card')`.
- Si el cardId guardado ya no existe (fetch 404 / `success:false`): limpiar
  `venus_card` y caer al flujo normal del Paso 1.
- Cliente nuevo / sin dato guardado / JSON corrupto: Paso 1 igual que hoy
  (try/catch alrededor del parse y del fetch).

**Resultado:** una vez que el cliente vio su tarjeta o agendó una vez en ese
dispositivo, agendar.html lo reconoce siempre — entre directo a `/agendar.html` o
desde su tarjeta.

## Parte 2 — Unificar navbar + cabecera con index

- **Navbar:** reemplazar el `vn-nav` de agendar por el navbar de index
  (`venus-nav`). Portar las reglas CSS `.venus-nav`, `.venus-nav-links`,
  `.venus-nav-mobile`, `.venus-btn*` necesarias al `<style>` de agendar.
  - Items (apuntando a la home real `/`, no a `/landing.html`):
    Rituales `/#rituales` · Experiencia `/#experiencia` · Lealtad `/#lealtad` ·
    Ubicación `/#ubicacion` · **Mi tarjeta** `/?login=1#lealtad` · **Agendar**
    (página actual). Wordmark "Venus" → `/`.
  - "Mi tarjeta" cross-page: `index.html` lee `?login=1` al cargar y abre la
    pestaña "Ya tengo tarjeta" (`showTab('login')`) además de hacer scroll a
    `#lealtad`.
- **Cabecera (hero):** alinear la fuente de títulos a **Prata** en el navbar y el
  hero "Reserva tu pausa"; botón primario al estilo `venus-btn-primary`. El resto
  del hero (cream + olivo) ya está on-brand.
- **Wizard:** intacto.

## Archivos afectados

- `public/index.html` — set `venus_card` en `showCardView`; leer `?login=1`.
- `public/agendar.html` — leer `venus_card` en `autoIdentifyFromCard`; set en
  `onSubmitPhone`; reemplazar navbar; portar CSS `venus-*`; fuente Prata en
  hero/navbar; botón primario.

## Verificación

- **Syntax:** `node --check` de los `<script>` inline de ambos archivos.
- **Manual (post-deploy):**
  1. Ver tarjeta en `/?cardId=...` → abrir `/agendar.html` **directo** → debe
     reconocer y saltar al Paso 3 (sin pedir WhatsApp).
  2. Logout → `/agendar.html` → vuelve a pedir WhatsApp (Paso 1).
  3. Cliente nuevo (sin tarjeta) → Paso 1 normal; tras crear/lookup, la 2ª vez ya
     no pide.
  4. cardId guardado inválido (tarjeta borrada) → cae a Paso 1 sin error.
  5. Navbar de agendar idéntico a index, links a `/`, "Mi tarjeta" abre login en
     la home.

## Riesgo

Bajo. El reconocimiento reutiliza `autoIdentifyFromCard` + `/api/card/:cardId`
existentes; los cambios visuales son del "chrome" (navbar/hero). El wizard que ya
funciona no se toca.
