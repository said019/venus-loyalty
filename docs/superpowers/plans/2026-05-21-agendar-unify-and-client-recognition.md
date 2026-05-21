# Agendar: unificar con index + reconocer al cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cliente con tarjeta no tenga que volver a teclear su WhatsApp al agendar, y que el navbar/cabecera de `agendar.html` se vean como `index.html`.

**Architecture:** Persistir identidad en `localStorage.venus_card` (la escribe la vista de tarjeta en `index.html` y el lookup de `agendar.html`; la lee `autoIdentifyFromCard` al cargar agendar). Reskin self-contained del navbar de agendar usando su propio CSS `vn-*` (no Tailwind utilities) + fuente Prata en brand/hero para igualar index. El wizard de 4 pasos no se toca.

**Tech Stack:** HTML estático + JS inline (sin framework), CSS en `<style>` por página, fuentes Google (Prata, Playfair Display, DM Sans). Sin harness de test DOM → verificación por `node --check` de scripts inline + prueba manual en navegador.

**Spec:** `docs/superpowers/specs/2026-05-21-agendar-unify-and-client-recognition-design.md`

---

## Task 1: index.html — guardar identidad + manejar `?login=1`

**Files:**
- Modify: `public/index.html` (showCardView ~2216-2226; bloque init `if (urlCardId)` ~2287)

- [ ] **Step 1: Guardar `venus_card` al mostrar la tarjeta**

En `showCardView(data)`, justo después del bloque que reescribe los links de agendar (termina en línea ~2226 con `});`), añadir el guardado. `cardId`, `name`, `phone` ya están en scope (definidos al inicio de la función, líneas 2159-2163).

Buscar:
```js
      document.querySelectorAll('a[href^="/agendar.html"]').forEach(a => {
        a.href = `/agendar.html?cardId=${encodeURIComponent(cardId)}`;
      });
```
Reemplazar por:
```js
      document.querySelectorAll('a[href^="/agendar.html"]').forEach(a => {
        a.href = `/agendar.html?cardId=${encodeURIComponent(cardId)}`;
      });

      // Recordar la identidad en ESTE dispositivo para que /agendar.html
      // reconozca al cliente sin pedirle el WhatsApp otra vez.
      try {
        localStorage.setItem('venus_card', JSON.stringify({ cardId, name, phone }));
      } catch (e) { /* localStorage no disponible (modo privado) → ignorar */ }
```

- [ ] **Step 2: Abrir login + scroll cuando llega `?login=1`**

El navbar de agendar tendrá "Mi tarjeta" → `/?login=1#lealtad`. `index.html` debe leer ese flag. `params` está definido en línea 1972 y `showTab` en 1976. Localizar el bloque `if (urlCardId) {` (línea ~2287) y añadir DESPUÉS de su cierre `}`:

Buscar (el bloque completo de carga por URL):
```js
    if (urlCardId) {
      fetch(`/api/card/${encodeURIComponent(urlCardId)}`)
```
Para anclar, añadir el nuevo bloque inmediatamente ANTES de `if (urlCardId) {`:
```js
    // "Mi tarjeta" desde otra página llega con ?login=1: abrir la pestaña
    // "Ya tengo tarjeta" y bajar a la sección de lealtad.
    if (params.get('login') === '1') {
      try { showTab('login'); } catch (e) {}
      document.getElementById('lealtad')?.scrollIntoView({ behavior: 'smooth' });
    }

    if (urlCardId) {
      fetch(`/api/card/${encodeURIComponent(urlCardId)}`)
```

- [ ] **Step 3: Verificar sintaxis**

Run:
```bash
node -e 'const fs=require("fs"),{execSync}=require("child_process");const h=fs.readFileSync("public/index.html","utf8");const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,i=0,bad=0;while((m=re.exec(h))){const c=m[1];if(!c.trim())continue;i++;const t="/tmp/t1_"+i+".js";fs.writeFileSync(t,c);try{execSync("node --check "+t,{stdio:"pipe"})}catch(e){bad++;console.log("FAIL",i,e.stderr.toString().split("\n").slice(0,3).join(" "))}}console.log("index.html:",i,"bloques,",bad,"error");' ; rm -f /tmp/t1_*.js
```
Expected: `index.html: 3 bloques, 0 error`

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(index): recuerda identidad del cliente (venus_card) + soporte ?login=1"
```

---

## Task 2: agendar.html — leer identidad recordada + guardarla en lookup

**Files:**
- Modify: `public/agendar.html` (autoIdentifyFromCard 1575-1598; onSubmitPhone success ~1697)

- [ ] **Step 1: autoIdentify lee cardId de URL o de `venus_card`**

Buscar:
```js
    async function autoIdentifyFromCard() {
      const params = new URLSearchParams(window.location.search);
      const cardId = params.get('cardId');
      const phoneParam = (params.get('phone') || '').replace(/\D/g, '');
      if (!cardId && phoneParam.length < 10) return;
```
Reemplazar por:
```js
    async function autoIdentifyFromCard() {
      const params = new URLSearchParams(window.location.search);
      let cardId = params.get('cardId');
      const phoneParam = (params.get('phone') || '').replace(/\D/g, '');
      // Si no viene en la URL, usar la identidad recordada en este dispositivo.
      if (!cardId) {
        try {
          const saved = JSON.parse(localStorage.getItem('venus_card') || 'null');
          if (saved && saved.cardId) cardId = saved.cardId;
        } catch (e) { /* JSON corrupto → ignorar */ }
      }
      if (!cardId && phoneParam.length < 10) return;
```

- [ ] **Step 2: Limpiar `venus_card` si la tarjeta guardada ya no existe**

Buscar:
```js
        if (!card) return; // cardId inválido → flujo normal (paso 1)
```
Reemplazar por:
```js
        if (!card) {
          // cardId guardado inválido (p.ej. tarjeta borrada) → limpiar y flujo normal.
          try { localStorage.removeItem('venus_card'); } catch (e) {}
          return;
        }
```

- [ ] **Step 3: Guardar identidad tras un lookup exitoso en el Paso 1**

En `onSubmitPhone`, `clientPhone` ya se setea al inicio (`clientPhone = digits`). Buscar el bloque de éxito:
```js
        if (json.exists) {
          existsClient = true;
          clientFirstName = json.firstName || 'cliente';
          clientCardId = json.cardId || null;
          status.className = 'vn-lookup success';
```
Reemplazar por:
```js
        if (json.exists) {
          existsClient = true;
          clientFirstName = json.firstName || 'cliente';
          clientCardId = json.cardId || null;
          // Recordar al cliente en este dispositivo para la próxima vez.
          try {
            localStorage.setItem('venus_card', JSON.stringify({
              cardId: clientCardId, name: json.firstName || '', phone: clientPhone
            }));
          } catch (e) {}
          status.className = 'vn-lookup success';
```

- [ ] **Step 4: Verificar sintaxis**

Run:
```bash
node -e 'const fs=require("fs"),{execSync}=require("child_process");const h=fs.readFileSync("public/agendar.html","utf8");const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,i=0,bad=0;while((m=re.exec(h))){const c=m[1];if(!c.trim())continue;i++;const t="/tmp/t2_"+i+".js";fs.writeFileSync(t,c);try{execSync("node --check "+t,{stdio:"pipe"})}catch(e){bad++;console.log("FAIL",i,e.stderr.toString().split("\n").slice(0,3).join(" "))}}console.log("agendar.html:",i,"bloques,",bad,"error");' ; rm -f /tmp/t2_*.js
```
Expected: `agendar.html: 1 bloques, 0 error`

- [ ] **Step 5: Commit**

```bash
git add public/agendar.html
git commit -m "feat(agendar): reconoce al cliente con identidad recordada (venus_card)"
```

---

## Task 3: agendar.html — navbar igual a index

**Files:**
- Modify: `public/agendar.html` (markup nav 1253-1263; CSS nav ~157)

- [ ] **Step 1: Reemplazar el markup del navbar**

Buscar:
```html
  <nav class="vn-nav">
    <div class="vn-nav__inner">
      <a href="/landing.html" class="vn-nav__brand">Venus</a>
      <div class="vn-nav__links">
        <a href="/landing.html#inicio">Inicio</a>
        <a href="/landing.html#servicios">Servicios</a>
        <a href="/landing.html#transformaciones">Resultados</a>
        <a href="/landing.html#testimonios">Testimonios</a>
      </div>
    </div>
  </nav>
```
Reemplazar por:
```html
  <nav class="vn-nav">
    <div class="vn-nav__inner">
      <a href="/" class="vn-nav__brand-wrap" aria-label="Venus Cosmetología">
        <img src="/assets/logo.png" alt="Venus Cosmetología" class="vn-nav__logo">
        <span class="vn-nav__brand">Venus</span>
      </a>
      <div class="vn-nav__links">
        <a href="/#rituales">Rituales</a>
        <a href="/#experiencia">Experiencia</a>
        <a href="/#lealtad">Lealtad</a>
        <a href="/#ubicacion">Ubicación</a>
        <a href="/?login=1#lealtad">Mi tarjeta</a>
        <a href="#step-1" class="vn-nav__cta">Agendar</a>
      </div>
      <a href="#step-1" class="vn-nav__cta vn-nav__cta--mobile">Agendar</a>
    </div>
  </nav>
```

- [ ] **Step 2: Añadir CSS del logo, brand-wrap y CTA (y mostrar CTA en móvil)**

Localizar el final de las reglas de nav (línea ~157):
```css
    @media (max-width: 720px) { .vn-nav__links { display: none; } }
```
Reemplazar por:
```css
    @media (max-width: 720px) { .vn-nav__links { display: none; } }
    .vn-nav__brand-wrap { display: flex; align-items: center; gap: 10px; text-decoration: none; }
    .vn-nav__logo {
      width: 40px; height: 40px; border-radius: 11px;
      background: #fff; padding: 4px; object-fit: contain;
      box-shadow: 0 2px 10px oklch(58% 0.075 120 / 0.12);
    }
    .vn-nav__cta {
      background: var(--olive);
      color: #fff !important;
      padding: 9px 20px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 14px;
      transition: background 180ms var(--ease-out-quart), transform 180ms var(--ease-out-quart);
    }
    .vn-nav__cta::after { display: none !important; }
    .vn-nav__cta:hover { background: var(--olive-deep); color: #fff !important; transform: translateY(-1px); }
    .vn-nav__cta--mobile { display: none; }
    @media (max-width: 720px) { .vn-nav__cta--mobile { display: inline-block; } }
```

- [ ] **Step 3: Verificar sintaxis (scripts intactos) y que no quedan links a /landing.html en el nav**

Run:
```bash
grep -n 'vn-nav__brand-wrap\|/?login=1#lealtad\|/#rituales' public/agendar.html | head
grep -c 'landing.html' public/agendar.html
```
Expected: aparecen las 3 líneas nuevas; el conteo de `landing.html` debe ser `0`.

- [ ] **Step 4: Commit**

```bash
git add public/agendar.html
git commit -m "feat(agendar): navbar unificado con index (items, links a /, CTA)"
```

---

## Task 4: agendar.html — fuente Prata en brand y hero (igual a index)

**Files:**
- Modify: `public/agendar.html` (font link línea 16; `.vn-nav__brand` ~124; `.vn-hero__title` ~195)

- [ ] **Step 1: Cargar la fuente Prata**

Buscar:
```html
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=DM+Sans:wght@400;500;600&display=swap">
```
Reemplazar por:
```html
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Prata&family=DM+Sans:wght@400;500;600&display=swap">
```

- [ ] **Step 2: Brand del nav en Prata, sin itálica (como index)**

Buscar:
```css
    .vn-nav__brand {
      font-family: var(--display);
      font-size: 26px;
      font-weight: 500;
      font-style: italic;
      letter-spacing: -0.02em;
      color: var(--olive);
      text-decoration: none;
      transition: color 180ms var(--ease-out-quart);
    }
```
Reemplazar por:
```css
    .vn-nav__brand {
      font-family: 'Prata', serif;
      font-size: 24px;
      font-weight: 400;
      font-style: normal;
      letter-spacing: 0;
      color: var(--olive);
      text-decoration: none;
      transition: color 180ms var(--ease-out-quart);
    }
```

- [ ] **Step 3: Título del hero en Prata (sin tocar el wizard)**

Buscar:
```css
    .vn-hero__title {
      font-family: var(--display);
      font-size: clamp(32px, 5.5vw, 56px);
```
Reemplazar por:
```css
    .vn-hero__title {
      font-family: 'Prata', serif;
      font-size: clamp(32px, 5.5vw, 56px);
```

- [ ] **Step 4: Verificación visual manual (post-deploy)**

Run: abrir `https://venus-loyalty.onrender.com/agendar.html` con hard refresh.
Expected: el wordmark "Venus" y el título "Reserva tu pausa" se ven en Prata (serif idéntico a index); el wizard mantiene su tipografía.

- [ ] **Step 5: Commit**

```bash
git add public/agendar.html
git commit -m "style(agendar): fuente Prata en brand y hero (igual a index)"
```

---

## Verificación final (todas las tareas)

Prueba manual en navegador tras deploy (cubre el spec):

1. **Reconocimiento por dispositivo:** ver tarjeta en `/?cardId=...` → abrir `/agendar.html` **directo** (sin params) → debe saltar al Paso 3 sin pedir WhatsApp.
2. **Logout:** cerrar sesión en la tarjeta → `/agendar.html` → vuelve a pedir WhatsApp (Paso 1).
3. **Cliente nuevo:** sin `venus_card` → Paso 1 normal; tras lookup exitoso, recargar `/agendar.html` → ya no pide.
4. **Tarjeta borrada:** con `venus_card` de un cardId inexistente → cae a Paso 1 sin error (y se limpia `venus_card`).
5. **Navbar:** agendar muestra Rituales/Experiencia/Lealtad/Ubicación/Mi tarjeta/Agendar; links van a `/`; "Mi tarjeta" abre la pestaña login en la home; brand+hero en Prata.

---

## Notas de implementación

- **No tocar** el wizard de 4 pasos, el cálculo de descuento (10% bebida), ni el backend.
- `--olive`, `--olive-deep`, `--olive-soft`, `--ease-out-quart` ya existen en el `:root` de agendar.
- Antes de cada push: `git fetch origin && git rebase origin/main` (el remoto recibe pushes de un rediseño en paralelo) y verificar con grep que los cambios sobrevivieron.
