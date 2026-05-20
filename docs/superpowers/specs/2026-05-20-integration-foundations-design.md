# Integration Foundations — Design Spec

**Fecha:** 2026-05-20
**Autor:** Said Romero (con asistencia de Claude Code)
**Estado:** Aprobado, pendiente de plan de implementación
**Subproyecto A** del roadmap de integración con Claude Small Business (ver `docs/CLAUDE_SMALL_BUSINESS_INTEGRATION.md`).

---

## Problema

La plataforma Venus tiene 163 endpoints REST pero todos protegidos por **cookie JWT de login admin** (`adminAuth`) o **Basic Auth de staff** acotado a 4 rutas. No existe forma limpia para que un cliente machine-to-machine (MCP server, Claude, futuras integraciones) consuma datos o ejecute acciones sin reusar credenciales de un humano.

Sin esto, **todo el roadmap de integración con Claude Small Business está bloqueado**: no hay manera de que Claude llame endpoints de la plataforma sin embedir cookies de admin (frágil, sin scopes, sin auditoría).

## No-objetivos

- **No** introduce ningún endpoint de negocio (cashflow, brief, sales) — eso es Subproyecto B.
- **No** introduce el MCP server — eso es Subproyecto C.
- **No** introduce rate limiting (YAGNI: Claude es consumidor único de confianza; añadir cuando haya señal de problema).
- **No** introduce múltiples keys / roles / scopes — una sola key fija basta para MVP. Multi-key se evalúa cuando aparezca un segundo consumidor.
- **No** rota la key automáticamente — rotación es manual via env var.
- **No** registra request bodies en logs (privacidad).

## Solución

Una variable de entorno `INTEGRATION_API_KEY`, un middleware `integrationAuth` que la verifica con `crypto.timingSafeEqual`, un middleware `integrationLogger` que registra cada request como una línea JSON estructurada, un router montado en `/api/integrations/*` con un único endpoint `GET /ping` que prueba el camino end-to-end.

Tres archivos modificados, dos nuevos.

## Variable de entorno

```
INTEGRATION_API_KEY=<string aleatorio ≥32 chars>
```

- Generación recomendada: `openssl rand -hex 32`.
- Va en `.env` local y en el dashboard de Render (production).
- **Sin esta variable seteada en el server, el middleware rechaza TODAS las llamadas a `/api/integrations/*` con 503** (fail-closed). Evita que un deploy mal configurado abra el namespace por accidente con auth no funcional.

## Componentes

### 1. Middleware `integrationAuth` (en `lib/auth.js`)

Verifica el header `Authorization: Bearer <key>` contra `process.env.INTEGRATION_API_KEY` con comparación constante-en-tiempo. Coloca `req.integration = { name: 'claude' }` en éxito (placeholder para multi-key futuro).

Comportamiento exacto:

| Condición | Respuesta | Status |
|---|---|---|
| `INTEGRATION_API_KEY` no seteada en el server | `{error:'INTEGRATION_DISABLED'}` | 503 |
| Header `Authorization` ausente o no empieza con `Bearer ` | `{error:'UNAUTHORIZED'}` | 401 |
| Key presentada distinta a la del server | `{error:'UNAUTHORIZED'}` | 401 (mismo body y tiempo constante para no filtrar info) |
| Key correcta | `next()` | (sigue al router) |

Implementación:
```js
import crypto from 'node:crypto';

export function integrationAuth(req, res, next) {
  const expected = process.env.INTEGRATION_API_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'INTEGRATION_DISABLED', message: 'INTEGRATION_API_KEY no configurada' });
  }
  const hdr = req.headers.authorization || '';
  const presented = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
  // timingSafeEqual requiere buffers del mismo largo
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  req.integration = { name: 'claude' };
  next();
}
```

### 2. Middleware `integrationLogger` (en `lib/auth.js`)

Una línea JSON por request al namespace, sin body. Útil para `grep '"kind":"integration"'` en logs de Render.

```js
export function integrationLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      kind: 'integration',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
    }));
  });
  next();
}
```

Se ejecuta ANTES de `integrationAuth` para que también registre los 401/503 (útil para detectar intentos de acceso).

### 3. Router `src/routes/integrations.js`

Un solo endpoint en este subproyecto:

```js
import { Router } from 'express';
const router = Router();

router.get('/ping', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), version: '1' });
});

export default router;
```

Endpoints adicionales (`cashflow`, `brief`, etc.) llegan en Subproyecto B agregándolos a este mismo router.

### 4. Wiring en `server.js`

Importar el router + los dos middlewares + montar el namespace:

```js
import integrationsRouter from "./src/routes/integrations.js";
import { integrationAuth, integrationLogger } from "./lib/auth.js";

// ... (en la sección donde se montan otros routers) ...
app.use("/api/integrations", integrationLogger, integrationAuth, integrationsRouter);
```

Orden de middleware deliberado: **logger → auth → router**. El logger ve todo (incluyendo 401/503).

## Flujo de datos

```
Cliente (curl, MCP server, Claude)
  ↓ Authorization: Bearer <INTEGRATION_API_KEY>
Express
  ↓ integrationLogger (marca inicio)
  ↓ integrationAuth
     ├─ no env var          → 503 INTEGRATION_DISABLED
     ├─ header malo / falta → 401 UNAUTHORIZED
     ├─ key mala            → 401 UNAUTHORIZED (timing constante)
     └─ key OK              → next()
  ↓ integrationsRouter
  ↓ GET /ping handler → {ok, ts, version}
  ↓ res.on('finish') → log JSON {ts, kind:integration, method, path, status, ms}
Respuesta JSON
```

## Testing

Archivo nuevo `tests/integration-auth.test.js` con `node --test` (runner ya en uso). 4 casos cubriendo cada rama del middleware:

1. **Sin `INTEGRATION_API_KEY` seteada** → 503 con `INTEGRATION_DISABLED`.
2. **Con la key seteada, sin header** → 401 con `UNAUTHORIZED`.
3. **Con header pero key incorrecta** → 401 con `UNAUTHORIZED`.
4. **Con header y key correcta** → 200 con body `{ok:true, version:'1'}` y `ts` parseable.

Estrategia: el test importa el router y los middlewares, los monta en una mini-app Express dentro del test, y dispara requests con un cliente HTTP nativo (`fetch` global de Node 18+). Manipula `process.env.INTEGRATION_API_KEY` por test (`process.env` directo + cleanup en `afterEach`).

No usa supertest (mantenemos sin dependencias nuevas).

## Smoke post-deploy

Tras mergear y deployar a Render:

```bash
# Asume INTEGRATION_API_KEY configurada en Render
KEY='<la-misma-que-en-render>'
BASE='https://venus-loyalty.onrender.com'

curl -s -o /dev/null -w "sin auth                → %{http_code}\n" $BASE/api/integrations/ping
curl -s -o /dev/null -w "con Bearer malo         → %{http_code}\n" -H "Authorization: Bearer wrong-key-here" $BASE/api/integrations/ping
curl -s -w "con Bearer correcto     → %{http_code}\n" -H "Authorization: Bearer $KEY" $BASE/api/integrations/ping
```

Esperado:
```
sin auth                → 401
con Bearer malo         → 401
con Bearer correcto     → 200
{"ok":true,"ts":"2026-05-20T...","version":"1"}
```

En Render logs debe verse una línea JSON por request con `"kind":"integration"`.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Key se filtra (commit accidental, screenshot) | Rotar: cambiar `INTEGRATION_API_KEY` en Render → redeploy. Cliente Claude actualiza su credencial. (Manual, asumido.) |
| Deploy sin la env var deja el namespace abierto | Middleware retorna 503 si la env var falta — fail-closed. |
| Timing attack para descubrir la key | `crypto.timingSafeEqual` en el path de comparación; mismo body y status para "key mala" y "header malo". |
| Logs contienen PII | El logger registra solo método/path/status/ms — no headers, no body. |
| Confusión con `adminAuth` | Nombres explícitos (`integrationAuth` vs `adminAuth`), namespace dedicado `/api/integrations/*` distinto de `/api/admin/*`. |
| Render no cifra env vars at rest | Confiamos en Render's secret storage estándar — fuera de scope. |

## Out of scope (subproyectos posteriores)

- Endpoints agregados de negocio (cashflow, brief, sales/breakdown, customers/at-risk, call-list) → **Subproyecto B**.
- MCP server propio que use estos endpoints → **Subproyecto C**.
- Scheduled tasks de Claude (briefs lunes/viernes, lead triage) → **Subproyecto D**.
- Rate limiting.
- Múltiples keys / roles / scopes / IntegrationKey model.
- Auditoría persistente (los logs JSON quedan en stdout de Render — suficiente por ahora).

## Plan de despliegue

1. Rama: `feat/integration-foundations` (ya creada).
2. Commits incrementales: middlewares + tests, router, wiring en server.js.
3. PR a `main` con descripción + checklist QA.
4. **Antes del merge:** generar la `INTEGRATION_API_KEY` y meterla en Render como env var (sin redeploy aún — Render lo dispara al detectar nueva var).
5. Merge → Render auto-deploy.
6. Smoke curl post-deploy (3 comandos arriba) → confirma que el camino funciona end-to-end.
7. Documentar la key en el password manager personal del owner (NO en el repo, NO en chat).

Rollback: `git revert <merge-sha>` (es un namespace nuevo aislado; no toca ningún endpoint existente).
