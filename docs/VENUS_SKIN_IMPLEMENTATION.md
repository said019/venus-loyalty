# Venus Skin — Integración completa con Yiyuan Analyzer

> **Propósito**: Envolver el analizador facial Yiyuan (yiyuan.ai / ZM Skin) con una app propia de Venus Cosmetología que lee el QR del aparato, importa el reporte clínico completo, lo guarda en el historial del cliente, y genera reportes premium marcados Venus.
>
> **Autor**: WalletClub Studio — Said Romero
> **Stack**: Next.js 15 (App Router) + Supabase + TypeScript + Tailwind

---

## Tabla de contenidos

1. [Contexto y descubrimiento](#1-contexto-y-descubrimiento)
2. [Flujo físico en el spa](#2-flujo-físico-en-el-spa)
3. [Arquitectura](#3-arquitectura)
4. [Setup del proyecto](#4-setup-del-proyecto)
5. [Estructura de archivos](#5-estructura-de-archivos)
6. [Migración SQL de Supabase](#6-migración-sql-de-supabase)
7. [Código fuente completo](#7-código-fuente-completo)
8. [Cómo integrarlo con Venus existente](#8-cómo-integrarlo-con-venus-existente)
9. [Script de prueba standalone](#9-script-de-prueba-standalone)
10. [Siguientes pasos](#10-siguientes-pasos)

---

## 1. Contexto y descubrimiento

El aparato Yiyuan (fabricante: Shenzhen Yiyuan Intelligent Technology, yiyuan.ai) es una tablet Android todo‑en‑uno con cámara multiespectral que hace análisis de piel. Al terminar, genera un QR que contiene una URL de reporte del tipo:

```
https://zm.yiyuan.ai/zmskinweb/#/report?shareId=88a29e9bbc149e39ed21b840b3647017&locale=es
```

Esa URL, cuando se abre, hace una llamada a un endpoint REST interno que devuelve el reporte completo en JSON. Por reverse‑engineering del frontend oficial descubrimos:

### Endpoint principal

```
GET https://zm.yiyuan.ai/skinSrv/analysis/shareDetail?shareId={shareId}
```

Headers requeridos:

- `referer: https://zm.yiyuan.ai/zmskinweb/`
- `accept: application/json, text/plain, */*`
- `locale: es-419`
- `user-agent`: cualquier UA válido

**No requiere autenticación** más allá del `Referer`.

### Lo que devuelve

- 13 métricas clínicas de piel con score 0‑100, nivel 1‑5, y URLs de imágenes con detecciones marcadas: acné, puntos negros, poros, manchas, pigmentación, manchas UV, cicatrices/pockmark, arrugas, textura, colágeno, hidratación, sensibilidad, ojeras
- Clasificación de piel: tipo (grasa/seca/mixta/normal), color/fototipo (ITA), sensibilidad
- 8+ imágenes multiespectrales base: normal, polarizada positiva, polarizada cruzada, UV, Wood, canal azul/marrón/rojo
- Métricas estéticas: edad biológica, forma de cara, proporciones faciales, triángulo áureo, forma de cejas/labios, simulación de envejecimiento
- 40+ features adicionales (atractivo, pómulos altos, bolsas bajo ojos, etc.)

---

## 2. Flujo físico en el spa

```
1. Esteticista hace análisis en el aparato Yiyuan
2. Aparato muestra QR con la URL del reporte
3. En Venus: Clientes → [Cliente] → "Nuevo análisis de piel"
4. Pestaña "Cámara" → apunta al QR del aparato
5. Detecta shareId → llama /api/yiyuan/import
6. En 2-3 segundos tienes el análisis completo en Venus
7. Queda ligado al historial del cliente
8. Botones: "Enviar por WhatsApp" · "Generar PDF" · "Agendar seguimiento"
```

---

## 3. Arquitectura

```
Aparato Yiyuan → QR con shareId
        ↓
[Cámara del tablet Venus escanea QR]
        ↓
Cliente Next.js extrae shareId de la URL
        ↓
POST /api/yiyuan/import { shareId, clientId }
        ↓
Backend: GET yiyuan.ai/skinSrv/analysis/shareDetail?shareId=XXX
        ↓
Normaliza → Supabase (skin_analyses + scores + images)
        ↓
Claude Sonnet genera narrativa ES + recomendaciones
        ↓
PDF premium + WhatsApp + Wallet pass
```

---

## 4. Setup del proyecto

### Dependencias

```bash
pnpm add zod html5-qrcode lucide-react
pnpm add -D tsx typescript @types/node
```

Asume que ya tienes instaladas: `next`, `react`, `@supabase/supabase-js`, `@supabase/ssr`, `tailwindcss`.

### Variables de entorno

Ninguna nueva requerida. La integración con Yiyuan no usa secretos — solo el `shareId` público.

### Migración de base de datos

Pegar el SQL de la sección [6](#6-migración-sql-de-supabase) en el SQL Editor de Supabase Studio, o correr:

```bash
supabase db push
```

---

## 5. Estructura de archivos

```
src/
  types/yiyuan.ts                     # Tipos TS basados en JSON real
  lib/
    yiyuan/
      client.ts                       # fetchYiyuanShareDetail + extractShareId
      normalizer.ts                   # códigos chinos → modelo Venus
    hooks/
      useQrScanner.ts                 # hook para html5-qrcode
    supabase/
      server.ts                       # helper SSR de Supabase
  components/
    YiyuanQrScanner.tsx              # UI scanner (cámara / foto / URL)
    NewAnalysisClient.tsx             # pantalla "Nuevo análisis"
  app/
    api/yiyuan/import/route.ts        # POST endpoint server-side
    clientes/[clientId]/analisis/nuevo/page.tsx
supabase/migrations/
  20260424_venus_skin.sql             # schema + RLS + vista evolución
scripts/
  test-yiyuan-fetch.ts                # CLI de prueba sin Next.js
```

---

## 6. Migración SQL de Supabase

**Archivo**: `supabase/migrations/20260424_venus_skin.sql`

```sql
-- ============================================================================
-- Venus Skin — Schema para análisis de piel con Yiyuan Analyzer
-- ============================================================================
-- Multi-tenant ready. Asume que ya existe auth.users y un concepto de tenants
-- en tu app Venus. Si es single-tenant, elimina las columnas tenant_id y RLS
-- relacionado.
-- ============================================================================

-- Extensiones ---------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. Clientes (solo si aún no existe; si ya tienes Venus, enlaza a tu tabla)
-- ============================================================================
create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  nickname     text not null,
  mobile       text,
  email        text,
  birthday     date,
  sex          char(1) check (sex in ('F', 'M')),
  yiyuan_customer_id text,  -- puente con el aparato
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_clients_tenant on public.clients(tenant_id);
create index if not exists idx_clients_mobile on public.clients(mobile);

-- ============================================================================
-- 2. Análisis de piel (uno por shareId de Yiyuan)
-- ============================================================================
create table if not exists public.skin_analyses (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  client_id             uuid not null references public.clients(id) on delete cascade,

  -- IDs del sistema Yiyuan
  yiyuan_share_id       text unique not null,
  yiyuan_analysis_id    bigint,

  analyzed_at           timestamptz not null,
  age_at_analysis       int,
  biological_age        int,

  -- Clasificación de piel (traducida al español)
  skin_type             text,        -- 'Grasa' | 'Seca' | 'Mixta' | 'Normal'
  skin_color            text,        -- fototipo en texto
  ita                   numeric,     -- Individual Typology Angle

  -- Scores globales
  overall_score         int,
  appearance_score      int,

  -- Métricas estéticas
  face_shape            text,
  golden_triangle       numeric,

  -- Narrativa generada con IA
  ai_summary_es         text,
  ai_recommendations    jsonb,
  treatment_suggestions jsonb,        -- mapeado al menú real de Venus

  -- JSON crudo de Yiyuan (para no perder información nunca)
  raw_response          jsonb not null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_skin_analyses_client on public.skin_analyses(client_id, analyzed_at desc);
create index if not exists idx_skin_analyses_tenant on public.skin_analyses(tenant_id, analyzed_at desc);

-- ============================================================================
-- 3. Scores por métrica (estructurado para queries de evolución)
-- ============================================================================
create table if not exists public.skin_analysis_scores (
  id            uuid primary key default gen_random_uuid(),
  analysis_id   uuid not null references public.skin_analyses(id) on delete cascade,

  metric        text not null,       -- 'acne'|'blackhead'|'pore'|'spot'|...
  label_es      text not null,        -- etiqueta en español para UI

  score         numeric not null,     -- 0-100 (mayor = mejor piel)
  level         int,                  -- nivel interno de Yiyuan 1-5
  count         int,                  -- cantidad detectada
  severity      text not null check (severity in ('excellent','good','moderate','concern','critical')),

  image_url     text,                  -- URL de Yiyuan con detecciones marcadas
  storage_path  text,                  -- path en Supabase Storage

  created_at    timestamptz not null default now()
);

create index if not exists idx_scores_analysis   on public.skin_analysis_scores(analysis_id);
create index if not exists idx_scores_metric     on public.skin_analysis_scores(metric);
create index if not exists idx_scores_severity   on public.skin_analysis_scores(severity);

-- ============================================================================
-- 4. Imágenes capturadas (las 7 bases multiespectrales + derivadas)
-- ============================================================================
create table if not exists public.skin_analysis_images (
  id            uuid primary key default gen_random_uuid(),
  analysis_id   uuid not null references public.skin_analyses(id) on delete cascade,

  image_type    text not null,
  label_es      text not null,

  original_url  text,                  -- URL pública en zm.yiyuan.ai
  storage_path  text,                  -- path en Supabase Storage

  created_at    timestamptz not null default now()
);

create index if not exists idx_images_analysis on public.skin_analysis_images(analysis_id);

-- ============================================================================
-- 5. Row Level Security
-- ============================================================================
alter table public.clients                enable row level security;
alter table public.skin_analyses          enable row level security;
alter table public.skin_analysis_scores    enable row level security;
alter table public.skin_analysis_images    enable row level security;

-- Helper: obtener tenant_id del usuario autenticado
create or replace function public.current_tenant_id()
returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id', '')::uuid,
    (auth.jwt()->'user_metadata'->>'tenant_id')::uuid
  );
$$;

-- Policies
drop policy if exists clients_tenant_rw on public.clients;
create policy clients_tenant_rw on public.clients
  for all
  using  (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists skin_analyses_tenant_rw on public.skin_analyses;
create policy skin_analyses_tenant_rw on public.skin_analyses
  for all
  using  (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists scores_tenant_rw on public.skin_analysis_scores;
create policy scores_tenant_rw on public.skin_analysis_scores
  for all
  using (exists (
    select 1 from public.skin_analyses a
    where a.id = skin_analysis_scores.analysis_id
      and a.tenant_id = public.current_tenant_id()
  ))
  with check (exists (
    select 1 from public.skin_analyses a
    where a.id = skin_analysis_scores.analysis_id
      and a.tenant_id = public.current_tenant_id()
  ));

drop policy if exists images_tenant_rw on public.skin_analysis_images;
create policy images_tenant_rw on public.skin_analysis_images
  for all
  using (exists (
    select 1 from public.skin_analyses a
    where a.id = skin_analysis_images.analysis_id
      and a.tenant_id = public.current_tenant_id()
  ))
  with check (exists (
    select 1 from public.skin_analyses a
    where a.id = skin_analysis_images.analysis_id
      and a.tenant_id = public.current_tenant_id()
  ));

-- ============================================================================
-- 6. Vista útil: evolución por cliente
-- ============================================================================
create or replace view public.v_skin_evolution as
select
  a.client_id,
  a.tenant_id,
  a.id                 as analysis_id,
  a.analyzed_at,
  a.overall_score,
  s.metric,
  s.label_es,
  s.score,
  s.severity,
  lag(s.score) over (
    partition by a.client_id, s.metric
    order by a.analyzed_at
  ) as prev_score,
  s.score - lag(s.score) over (
    partition by a.client_id, s.metric
    order by a.analyzed_at
  ) as delta
from public.skin_analyses a
join public.skin_analysis_scores s on s.analysis_id = a.id;
```

---

## 7. Código fuente completo

### 7.1. Tipos TypeScript

**Archivo**: `src/types/yiyuan.ts`

```typescript
/**
 * Tipos TypeScript para la API de Yiyuan Skin Analyzer
 *
 * Basados en la respuesta real del endpoint:
 *   GET https://zm.yiyuan.ai/skinSrv/analysis/shareDetail?shareId={shareId}
 */

export interface YiyuanSuggestion {
  [key: string]: unknown;
}

export interface YiyuanMetricBase {
  score: number | string;
  level?: number;
  filename?: string;
  goods?: unknown[];
  suggestion?: YiyuanSuggestion;
}

// ── Métricas de piel ───────────────────────────────────────────────────────

export interface YiyuanAcne extends YiyuanMetricBase {
  count: number;
}

export interface YiyuanBlackhead extends YiyuanMetricBase {
  count: number;
  draw_level: number;
  area: number;
  prob: number;
}

export interface YiyuanPore extends YiyuanMetricBase {
  count: number;
  draw_level: number;
  prob: number;
}

export interface YiyuanSpotCategory {
  cls: string;
  count: number;
  score: number;
  level?: string;
}

export interface YiyuanSpot extends YiyuanMetricBase {
  count: number;
  category: YiyuanSpotCategory[];
}

export interface YiyuanPigment extends YiyuanMetricBase {}

export interface YiyuanUvSpot extends YiyuanMetricBase {
  count: number;
}

export interface YiyuanPockmark extends YiyuanMetricBase {
  count: number;
  category: YiyuanSpotCategory[];
}

export interface YiyuanWrinkleCategory {
  cls: 'forehead' | 'crow_feet' | 'glabella' | 'nasolabial' | string;
  count: number;
  score: number;
  level: 'none' | 'lightly' | 'moderate' | 'severe' | string;
  prob: number;
}

export interface YiyuanWrinkle extends YiyuanMetricBase {
  count: number;
  prob: number;
  category: YiyuanWrinkleCategory[];
}

export interface YiyuanTexture extends YiyuanMetricBase {
  count: string;
}

export interface YiyuanCollagen extends YiyuanMetricBase {}

export interface YiyuanExtWater extends YiyuanMetricBase {
  result: number;
}

export interface YiyuanSensitive extends YiyuanMetricBase {
  type: 'tolerance' | 'sensitive' | string;
  level_score: number;
}

export interface YiyuanDarkCircle {
  type: string;
  level: number;
  score: number;
  leftType: string;
  leftLevel: string;
  rightType: string;
  rightLevel?: string;
}

export interface YiyuanSkinType extends YiyuanMetricBase {
  type: 'oil' | 'dry' | 'mixed' | 'neutral' | string;
  level_score: number;
  category: unknown[];
}

export interface YiyuanColor extends YiyuanMetricBase {
  r_result: string;
  result: string;
  ita: number;
}

// ── Métricas estéticas ─────────────────────────────────────────────────────

export interface YiyuanAge {
  result: number;
}

export interface YiyuanAgingSimu {
  filenames: string[];
}

export interface YiyuanAppearance {
  score: number;
}

export interface YiyuanBrowShape {
  eyebrow_type: string[];
  eyebrow_form: string[];
  eyebrowlen_form: string[];
  eyeins_form: string[];
  brow_height: number;
  brow_thick: number;
  brow_width: number;
  camber_angle: number;
  uptrend_angle: number;
}

export interface YiyuanLipShape {
  mouth_type: string[];
  lip_type: string[];
  uv_type: string;
  score: string;
  lip_thickness: number;
}

export interface YiyuanFaceShape {
  shape: string;
  score: string;
  face_height: number;
  tempus_width: number;
  zygoma_width: number;
  mandible_width: number;
  mandible_angle: number;
}

export interface YiyuanFaceRatio {
  atriums_radio: number[];
  atriums_widths: number[];
  eyes_radio: number[];
  eyes_widths: number[];
  golden_triangle: number;
  filename_atriums: string;
  filename_eyes: string;
}

export interface YiyuanFeatures {
  female: number;
  male: number;
  attractive: string;
  bags_under_eyes: string;
  high_cheekbones: string;
  heavy_makeup: string;
  wearing_lipstick: string;
  pale_skin: string;
  rosy_cheeks: string;
  chubby: string;
  double_chin: string;
  [key: string]: string | number;
}

export interface YiyuanFinalResult {
  age: number;
  calc_age: number;
  skin_result: 'oil' | 'dry' | 'mixed' | 'neutral' | string;
  goods: unknown[];
  suggestion: YiyuanSuggestion;
}

export interface YiyuanAnalysis {
  code: number;
  error_detect_types: number;
  detect_types: string;
  deep_beat?: number;
  layer_beat?: number;

  // Imágenes multiespectrales base
  filename: string;
  filename_positive?: string;
  filename_negative?: string;
  filename_uv?: string;
  filename_woods?: string;
  filename_blue?: string;
  filename_brown?: string;
  filename_red?: string;

  // Métricas de piel
  acne: YiyuanAcne;
  blackhead: YiyuanBlackhead;
  pore: YiyuanPore;
  spot: YiyuanSpot;
  pigment: YiyuanPigment;
  uv_spot: YiyuanUvSpot;
  pockmark: YiyuanPockmark;
  wrinkle: YiyuanWrinkle;
  texture: YiyuanTexture;
  collagen: YiyuanCollagen;
  ext_water: YiyuanExtWater;
  sensitive: YiyuanSensitive;
  dark_circle: YiyuanDarkCircle;
  skin_type: YiyuanSkinType;
  color: YiyuanColor;

  // Métricas estéticas
  age: YiyuanAge;
  aging_simu: YiyuanAgingSimu;
  appearance: YiyuanAppearance;
  brow_shape: YiyuanBrowShape;
  lip_shape: YiyuanLipShape;
  face_shape: YiyuanFaceShape;
  face_ratio: YiyuanFaceRatio;
  features: YiyuanFeatures;
  final_result: YiyuanFinalResult;

  recognition?: { face_id: string | null };
  id: string;
}

export interface YiyuanShareDetailResponse {
  code: number;
  id: number;
  status: number;
  crt_time: string;
  age: number;
  birthday: string;
  customer_id: string;
  analysis_user: number;
  api_version: string;
  face_id: string | null;
  locale: string;
  mobile: string;
  nickname: string;
  sex: number;
  score: number;
  sid: string;
  shareId: string;
  transparent: string;
  user_id?: number;
  open_id: string | null;
  analysis: YiyuanAnalysis;
}
```

### 7.2. Cliente de la API de Yiyuan

**Archivo**: `src/lib/yiyuan/client.ts`

```typescript
/**
 * Cliente para la API de Yiyuan Skin Analyzer
 *
 * Endpoint descubierto por reverse-engineering del frontend oficial:
 *   GET https://zm.yiyuan.ai/skinSrv/analysis/shareDetail?shareId={shareId}
 *
 * Requiere header Referer desde zm.yiyuan.ai para pasar el check del servidor.
 */

import type { YiyuanShareDetailResponse } from '@/types/yiyuan';

const YIYUAN_BASE = 'https://zm.yiyuan.ai';
const DEFAULT_REFERER = `${YIYUAN_BASE}/zmskinweb/`;

const DEFAULT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

export class YiyuanApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: number,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'YiyuanApiError';
  }
}

export interface FetchShareDetailOptions {
  locale?: 'es-419' | 'es' | 'en' | 'zh-CN';
  timeoutMs?: number;
}

export async function fetchYiyuanShareDetail(
  shareId: string,
  opts: FetchShareDetailOptions = {},
): Promise<YiyuanShareDetailResponse> {
  if (!shareId || !/^[a-f0-9]{20,64}$/i.test(shareId)) {
    throw new YiyuanApiError(`shareId inválido: ${shareId}`);
  }

  const { locale = 'es-419', timeoutMs = 15_000 } = opts;
  const url = `${YIYUAN_BASE}/skinSrv/analysis/shareDetail?shareId=${shareId}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'es-419,es;q=0.9,en;q=0.8',
        locale,
        referer: DEFAULT_REFERER,
        'user-agent': DEFAULT_UA,
      },
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err) {
    clearTimeout(timeout);
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? `Timeout (${timeoutMs}ms) consultando Yiyuan`
        : `Error de red consultando Yiyuan: ${(err as Error).message}`;
    throw new YiyuanApiError(message);
  }
  clearTimeout(timeout);

  if (!res.ok) {
    throw new YiyuanApiError(`Yiyuan respondió HTTP ${res.status}`, res.status);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new YiyuanApiError('Respuesta de Yiyuan no es JSON válido');
  }

  const data = json as Partial<YiyuanShareDetailResponse>;

  if (!data || typeof data !== 'object') {
    throw new YiyuanApiError('Respuesta vacía de Yiyuan', undefined, undefined, json);
  }

  if (data.code !== 0) {
    throw new YiyuanApiError(
      `Yiyuan devolvió error de negocio (code=${data.code})`,
      res.status,
      data.code,
      json,
    );
  }

  if (!data.analysis) {
    throw new YiyuanApiError(
      'Respuesta sin objeto analysis (reporte incompleto o expirado)',
      res.status,
      data.code,
      json,
    );
  }

  return data as YiyuanShareDetailResponse;
}

/**
 * Extrae el shareId desde una URL de reporte de Yiyuan.
 * Acepta:
 *   https://zm.yiyuan.ai/zmskinweb/#/report?shareId=XXX&locale=es
 *   https://zm.yiyuan.ai/zmskinweb/#/report?locale=es&shareId=XXX
 *   XXX (directo)
 */
export function extractShareId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-f0-9]{20,64}$/i.test(trimmed)) return trimmed;
  const match = trimmed.match(/shareId=([a-f0-9]{20,64})/i);
  return match?.[1] ?? null;
}
```

### 7.3. Normalizador (Yiyuan → modelo Venus)

**Archivo**: `src/lib/yiyuan/normalizer.ts`

```typescript
/**
 * Normalizador: convierte la respuesta cruda de Yiyuan
 * al modelo de dominio limpio de Venus Skin.
 *
 * Aplica:
 *  - Traducción de códigos chinos (shen_character, baixi, XGX, etc.)
 *  - Mapeo a esquema plano para Supabase
 *  - Clasificación de severidad para UI
 */

import type {
  YiyuanShareDetailResponse,
  YiyuanAnalysis,
} from '@/types/yiyuan';

export type Severity = 'excellent' | 'good' | 'moderate' | 'concern' | 'critical';

export interface VenusSkinMetric {
  key: string;
  labelEs: string;
  score: number;
  level?: number;
  count?: number;
  severity: Severity;
  imageUrl?: string;
}

export interface VenusSkinImage {
  type:
    | 'normal'
    | 'positive'
    | 'negative'
    | 'uv'
    | 'woods'
    | 'blue'
    | 'brown'
    | 'red'
    | 'aging_simu'
    | 'face_atriums'
    | 'face_eyes';
  labelEs: string;
  url: string;
}

export interface VenusClientInfo {
  nickname: string;
  mobile: string;
  birthday: string;
  ageReal: number;
  ageBiological: number;
  sex: 'F' | 'M';
  skinType: string;
  skinColor: string;
  ita: number;
}

export interface VenusSkinAnalysis {
  yiyuanShareId: string;
  yiyuanAnalysisId: number;
  analyzedAt: string;
  locale: string;
  client: VenusClientInfo;
  overallScore: number;
  metrics: VenusSkinMetric[];
  images: VenusSkinImage[];
  appearance?: number;
  faceShape?: string;
  goldenTriangle?: number;
  rawResponse: YiyuanShareDetailResponse;
}

// ── Diccionarios ES ────────────────────────────────────────────────────────

const SKIN_TYPE_ES: Record<string, string> = {
  oil: 'Grasa',
  dry: 'Seca',
  mixed: 'Mixta',
  neutral: 'Normal',
};

const SKIN_COLOR_ES: Record<string, string> = {
  baixi: 'Blanca clara',
  zhongxi: 'Media',
  heixi: 'Morena',
  baihuang: 'Blanca amarilla',
  zihuang: 'Amarilla natural',
};

const FACE_SHAPE_ES: Record<string, string> = {
  shen_character: 'Ovalada alargada (申)',
  guo_character: 'Cuadrada (国)',
  tian_character: 'Redonda (田)',
  you_character: 'Rectangular (由)',
  jia_character: 'Triangular invertida (甲)',
  feng_character: 'Corazón (风)',
  mu_character: 'Corazón alargado (目)',
};

const METRIC_LABELS_ES: Record<string, string> = {
  acne: 'Acné',
  blackhead: 'Puntos negros',
  pore: 'Poros',
  spot: 'Manchas',
  pigment: 'Pigmentación',
  uv_spot: 'Manchas UV (daño solar)',
  pockmark: 'Marcas / cicatrices',
  wrinkle: 'Arrugas',
  texture: 'Textura de piel',
  collagen: 'Colágeno',
  ext_water: 'Hidratación',
  sensitive: 'Sensibilidad',
  dark_circle: 'Ojeras',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function toNumber(v: number | string | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function severityFromScore(score: number): Severity {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'moderate';
  if (score >= 30) return 'concern';
  return 'critical';
}

function translate(dict: Record<string, string>, key: string | undefined): string {
  if (!key) return '';
  return dict[key] ?? key;
}

// ── Extractores ────────────────────────────────────────────────────────────

function extractMetrics(a: YiyuanAnalysis): VenusSkinMetric[] {
  const entries: Array<[string, { score: number | string; level?: number; count?: number | string; filename?: string }]> = [
    ['acne', a.acne],
    ['blackhead', a.blackhead],
    ['pore', a.pore],
    ['spot', a.spot],
    ['pigment', a.pigment],
    ['uv_spot', a.uv_spot],
    ['pockmark', a.pockmark],
    ['wrinkle', a.wrinkle],
    ['texture', a.texture],
    ['collagen', a.collagen],
    ['ext_water', a.ext_water],
    ['sensitive', a.sensitive],
  ];

  const metrics: VenusSkinMetric[] = entries.map(([key, m]) => {
    const score = toNumber(m?.score);
    return {
      key,
      labelEs: METRIC_LABELS_ES[key] ?? key,
      score,
      level: m?.level,
      count: typeof m?.count === 'number' ? m.count : toNumber(m?.count),
      severity: severityFromScore(score),
      imageUrl: m?.filename,
    };
  });

  if (a.dark_circle) {
    metrics.push({
      key: 'dark_circle',
      labelEs: METRIC_LABELS_ES.dark_circle,
      score: a.dark_circle.score,
      level: a.dark_circle.level,
      severity: severityFromScore(a.dark_circle.score),
    });
  }

  return metrics;
}

function extractImages(a: YiyuanAnalysis): VenusSkinImage[] {
  const imgs: VenusSkinImage[] = [];

  const add = (type: VenusSkinImage['type'], labelEs: string, url?: string) => {
    if (url) imgs.push({ type, labelEs, url });
  };

  add('normal', 'Foto normal', a.filename);
  add('positive', 'Luz polarizada (superficie)', a.filename_positive);
  add('negative', 'Luz polarizada cruzada (subdérmica)', a.filename_negative);
  add('uv', 'Luz ultravioleta', a.filename_uv);
  add('woods', 'Luz de Wood', a.filename_woods);
  add('blue', 'Canal azul (vascularidad)', a.filename_blue);
  add('brown', 'Canal marrón (pigmentación)', a.filename_brown);
  add('red', 'Canal rojo (rojez / inflamación)', a.filename_red);

  if (a.face_ratio?.filename_atriums) {
    add('face_atriums', 'Proporciones faciales (tercios)', a.face_ratio.filename_atriums);
  }
  if (a.face_ratio?.filename_eyes) {
    add('face_eyes', 'Proporciones oculares (quintos)', a.face_ratio.filename_eyes);
  }

  a.aging_simu?.filenames?.forEach((url, idx) => {
    add('aging_simu', `Simulación de envejecimiento #${idx + 1}`, url);
  });

  return imgs;
}

export function normalizeYiyuanResponse(
  raw: YiyuanShareDetailResponse,
): VenusSkinAnalysis {
  const a = raw.analysis;

  const client: VenusClientInfo = {
    nickname: raw.nickname,
    mobile: raw.mobile,
    birthday: raw.birthday,
    ageReal: raw.age,
    ageBiological: a.age?.result ?? raw.age,
    sex: raw.sex === 1 ? 'F' : 'M',
    skinType: translate(SKIN_TYPE_ES, a.skin_type?.type),
    skinColor: translate(SKIN_COLOR_ES, a.color?.result),
    ita: a.color?.ita ?? 0,
  };

  return {
    yiyuanShareId: raw.shareId,
    yiyuanAnalysisId: raw.id,
    analyzedAt: raw.crt_time.replace(' ', 'T') + 'Z',
    locale: raw.locale,
    client,
    overallScore: raw.score || a.appearance?.score || 0,
    metrics: extractMetrics(a),
    images: extractImages(a),
    appearance: a.appearance?.score,
    faceShape: translate(FACE_SHAPE_ES, a.face_shape?.shape),
    goldenTriangle: a.face_ratio?.golden_triangle,
    rawResponse: raw,
  };
}
```

### 7.4. Hook del scanner QR

**Archivo**: `src/lib/hooks/useQrScanner.ts`

```typescript
'use client';

/**
 * Hook para escanear QR con la cámara usando html5-qrcode.
 *
 * Instalar:
 *   pnpm add html5-qrcode
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseQrScannerOptions {
  elementId: string;
  onDecoded: (text: string) => void;
  fps?: number;
  qrboxSize?: number;
}

export function useQrScanner({
  elementId,
  onDecoded,
  fps = 10,
  qrboxSize = 260,
}: UseQrScannerOptions) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<unknown>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode(elementId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps, qrbox: { width: qrboxSize, height: qrboxSize } },
        (decodedText) => {
          onDecoded(decodedText);
        },
        () => {
          // ignorar errores de frame individual
        },
      );
      setIsScanning(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error iniciando cámara';
      setError(msg);
      setIsScanning(false);
    }
  }, [elementId, fps, qrboxSize, onDecoded]);

  const stop = useCallback(async () => {
    const s = scannerRef.current as
      | { stop: () => Promise<void>; clear: () => void; getState: () => number }
      | null;
    if (!s) return;
    try {
      if (s.getState() === 2) await s.stop();
      s.clear();
    } catch {
      /* ignore */
    } finally {
      scannerRef.current = null;
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return { start, stop, isScanning, error };
}

export async function decodeQrFromFile(file: File): Promise<string | null> {
  const { Html5Qrcode } = await import('html5-qrcode');
  const scanner = new Html5Qrcode('qr-file-reader-temp', { verbose: false });
  try {
    const result = await scanner.scanFile(file, false);
    return result;
  } catch {
    return null;
  }
}
```

### 7.5. Componente del scanner

**Archivo**: `src/components/YiyuanQrScanner.tsx`

```tsx
'use client';

/**
 * Componente: Escáner de QR para análisis Yiyuan.
 *
 * Tres métodos de captura:
 *   1. Cámara en vivo (html5-qrcode)
 *   2. Subir foto del QR
 *   3. Pegar URL manualmente
 */

import { useCallback, useRef, useState } from 'react';
import { Camera, Upload, Link2, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { useQrScanner, decodeQrFromFile } from '@/lib/hooks/useQrScanner';
import { extractShareId } from '@/lib/yiyuan/client';

interface YiyuanQrScannerProps {
  onShareId: (shareId: string) => void;
  submitLabel?: string;
}

type Mode = 'idle' | 'camera' | 'upload' | 'manual';

const SCANNER_ELEMENT_ID = 'venus-qr-scanner';

export function YiyuanQrScanner({
  onShareId,
  submitLabel = 'Importar análisis',
}: YiyuanQrScannerProps) {
  const [mode, setMode] = useState<Mode>('idle');
  const [detectedShareId, setDetectedShareId] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDecoded = useCallback((decoded: string) => {
    const shareId = extractShareId(decoded);
    if (!shareId) {
      setFeedback({ type: 'err', msg: 'El QR no es de un reporte Yiyuan válido' });
      return;
    }
    setDetectedShareId(shareId);
    setFeedback({ type: 'ok', msg: `Reporte detectado: ${shareId.slice(0, 12)}…` });
    void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { start, stop, isScanning, error } = useQrScanner({
    elementId: SCANNER_ELEMENT_ID,
    onDecoded: handleDecoded,
  });

  const switchMode = async (newMode: Mode) => {
    if (isScanning) await stop();
    setMode(newMode);
    setFeedback(null);
    if (newMode === 'camera') {
      setTimeout(() => void start(), 50);
    }
  };

  const handleFileUpload = async (file: File) => {
    setFeedback(null);
    const decoded = await decodeQrFromFile(file);
    if (!decoded) {
      setFeedback({ type: 'err', msg: 'No se detectó QR en la imagen' });
      return;
    }
    handleDecoded(decoded);
  };

  const handleManualSubmit = () => {
    const shareId = extractShareId(manualUrl);
    if (!shareId) {
      setFeedback({ type: 'err', msg: 'URL inválida o sin shareId' });
      return;
    }
    setDetectedShareId(shareId);
    setFeedback({ type: 'ok', msg: 'URL válida' });
  };

  const reset = async () => {
    if (isScanning) await stop();
    setDetectedShareId(null);
    setFeedback(null);
    setManualUrl('');
    setMode('idle');
  };

  const confirm = () => {
    if (!detectedShareId) return;
    onShareId(detectedShareId);
  };

  return (
    <div className="w-full max-w-xl mx-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-6 text-neutral-100 shadow-2xl">
      <header className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight">Importar análisis de piel</h2>
        <p className="text-sm text-neutral-400">
          Escanea el QR del aparato, sube una foto, o pega la URL del reporte.
        </p>
      </header>

      {!detectedShareId && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <MethodButton
            active={mode === 'camera'}
            icon={<Camera size={18} />}
            label="Cámara"
            onClick={() => void switchMode('camera')}
          />
          <MethodButton
            active={mode === 'upload'}
            icon={<Upload size={18} />}
            label="Foto"
            onClick={() => void switchMode('upload')}
          />
          <MethodButton
            active={mode === 'manual'}
            icon={<Link2 size={18} />}
            label="URL"
            onClick={() => void switchMode('manual')}
          />
        </div>
      )}

      {mode === 'camera' && !detectedShareId && (
        <div className="space-y-3">
          <div
            id={SCANNER_ELEMENT_ID}
            className="aspect-square w-full rounded-xl overflow-hidden bg-black border border-neutral-800"
          />
          <p className="text-xs text-neutral-500 text-center">
            Apunta la cámara al QR del aparato Yiyuan
          </p>
          {error && (
            <p className="text-sm text-red-400">
              No se pudo acceder a la cámara: {error}
            </p>
          )}
        </div>
      )}

      {mode === 'upload' && !detectedShareId && (
        <div className="space-y-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full aspect-square rounded-xl border-2 border-dashed border-neutral-700 hover:border-fuchsia-500 hover:bg-neutral-900/50 transition flex flex-col items-center justify-center gap-3 text-neutral-400 hover:text-fuchsia-300"
          >
            <Upload size={40} strokeWidth={1.5} />
            <span className="text-sm">Toca para subir foto del QR</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFileUpload(f);
            }}
          />
          <div id="qr-file-reader-temp" className="hidden" />
        </div>
      )}

      {mode === 'manual' && !detectedShareId && (
        <div className="space-y-3">
          <label className="block text-sm text-neutral-300">URL del reporte</label>
          <input
            type="url"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://zm.yiyuan.ai/zmskinweb/#/report?shareId=..."
            className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-fuchsia-500"
          />
          <button
            onClick={handleManualSubmit}
            disabled={!manualUrl.trim()}
            className="w-full rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-neutral-800 disabled:text-neutral-600 py-2 text-sm font-medium transition"
          >
            Validar URL
          </button>
        </div>
      )}

      {feedback && (
        <div
          className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            feedback.type === 'ok'
              ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-900'
              : 'bg-red-950/50 text-red-300 border border-red-900'
          }`}
        >
          {feedback.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{feedback.msg}</span>
        </div>
      )}

      {detectedShareId && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-fuchsia-900 bg-fuchsia-950/30 p-4">
            <p className="text-xs uppercase tracking-wide text-fuchsia-300">
              Reporte listo para importar
            </p>
            <p className="font-mono text-xs text-neutral-300 mt-1 break-all">
              {detectedShareId}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void reset()}
              className="flex-1 rounded-lg border border-neutral-800 py-2 text-sm hover:bg-neutral-900 transition flex items-center justify-center gap-2"
            >
              <X size={16} /> Cancelar
            </button>
            <button
              onClick={confirm}
              className="flex-[2] rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 py-2 text-sm font-medium transition"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MethodButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs transition ${
        active
          ? 'border-fuchsia-500 bg-fuchsia-950/30 text-fuchsia-200'
          : 'border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
```

### 7.6. Pantalla "Nuevo análisis" (client)

**Archivo**: `src/components/NewAnalysisClient.tsx`

```tsx
'use client';

/**
 * Pantalla que ata el scanner + la llamada al endpoint + loading state.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { YiyuanQrScanner } from '@/components/YiyuanQrScanner';

interface NewAnalysisClientProps {
  clientId: string;
  clientName: string;
}

type ImportState =
  | { status: 'idle' }
  | { status: 'importing' }
  | { status: 'error'; msg: string };

export function NewAnalysisClient({ clientId, clientName }: NewAnalysisClientProps) {
  const router = useRouter();
  const [state, setState] = useState<ImportState>({ status: 'idle' });

  const handleShareId = async (shareId: string) => {
    setState({ status: 'importing' });
    try {
      const res = await fetch('/api/yiyuan/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareId, clientId }),
      });

      const json = await res.json();

      if (!res.ok) {
        setState({ status: 'error', msg: json.error ?? 'Error importando el análisis' });
        return;
      }

      router.push(`/clientes/${clientId}/analisis/${json.analysisId}`);
    } catch (e) {
      setState({
        status: 'error',
        msg: e instanceof Error ? e.message : 'Error de red',
      });
    }
  };

  if (state.status === 'importing') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-neutral-300">
        <div className="relative">
          <Loader2 className="animate-spin text-fuchsia-500" size={48} />
          <Sparkles
            className="absolute inset-0 m-auto text-fuchsia-300 animate-pulse"
            size={24}
          />
        </div>
        <div className="text-center">
          <p className="font-medium">Importando análisis de {clientName}</p>
          <p className="text-sm text-neutral-500">
            Descargando datos · Procesando 25 métricas · Guardando historial
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider text-fuchsia-400">
            Venus · Análisis de piel
          </p>
          <h1 className="text-2xl font-semibold text-neutral-100 mt-1">
            Nuevo análisis para {clientName}
          </h1>
        </div>

        <YiyuanQrScanner onShareId={handleShareId} />

        {state.status === 'error' && (
          <div className="max-w-xl mx-auto mt-4 rounded-lg bg-red-950/50 border border-red-900 p-3 text-sm text-red-300">
            {state.msg}
          </div>
        )}

        <details className="max-w-xl mx-auto mt-6 text-sm text-neutral-500">
          <summary className="cursor-pointer hover:text-neutral-300">
            ¿Cómo genero el QR en el aparato?
          </summary>
          <ol className="mt-2 space-y-1 list-decimal pl-5">
            <li>En el aparato Yiyuan termina el análisis normalmente</li>
            <li>Cuando se muestre el reporte, toca el botón de compartir</li>
            <li>Selecciona &quot;QR&quot; o &quot;Código compartido&quot;</li>
            <li>Apunta la cámara de esta tablet al QR del aparato</li>
          </ol>
        </details>
      </div>
    </div>
  );
}
```

### 7.7. Página server (route)

**Archivo**: `src/app/clientes/[clientId]/analisis/nuevo/page.tsx`

```tsx
/**
 * Ruta: /clientes/[clientId]/analisis/nuevo
 */

import { notFound } from 'next/navigation';
import { NewAnalysisClient } from '@/components/NewAnalysisClient';
import { createServerSupabase } from '@/lib/supabase/server';

interface PageProps {
  params: Promise<{ clientId: string }>;
}

export default async function NuevoAnalisisPage({ params }: PageProps) {
  const { clientId } = await params;

  const supabase = createServerSupabase();
  const { data: client, error } = await supabase
    .from('clients')
    .select('id, nickname')
    .eq('id', clientId)
    .single();

  if (error || !client) {
    notFound();
  }

  return <NewAnalysisClient clientId={client.id} clientName={client.nickname} />;
}
```

### 7.8. API route de importación

**Archivo**: `src/app/api/yiyuan/import/route.ts`

```typescript
/**
 * POST /api/yiyuan/import
 *
 * Body: { shareUrl?: string, shareId?: string, clientId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  fetchYiyuanShareDetail,
  extractShareId,
  YiyuanApiError,
} from '@/lib/yiyuan/client';
import { normalizeYiyuanResponse } from '@/lib/yiyuan/normalizer';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z
  .object({
    shareUrl: z.string().url().optional(),
    shareId: z.string().optional(),
    clientId: z.string().uuid(),
  })
  .refine((v) => v.shareUrl || v.shareId, {
    message: 'Debes mandar shareUrl o shareId',
  });

export async function POST(req: NextRequest) {
  // 1. Validación
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Body inválido', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { shareUrl, shareId: rawShareId, clientId } = parsed.data;
  const shareId = rawShareId ?? (shareUrl ? extractShareId(shareUrl) : null);

  if (!shareId) {
    return NextResponse.json(
      { error: 'No pude extraer shareId de la URL' },
      { status: 400 },
    );
  }

  // 2. Fetch desde Yiyuan
  let yiyuanData;
  try {
    yiyuanData = await fetchYiyuanShareDetail(shareId);
  } catch (err) {
    if (err instanceof YiyuanApiError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status ?? 502 },
      );
    }
    throw err;
  }

  // 3. Normalizar
  const analysis = normalizeYiyuanResponse(yiyuanData);

  // 4. Persistir en Supabase
  const supabase = createServerSupabase();

  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, tenant_id')
    .eq('id', clientId)
    .single();

  if (clientErr || !client) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  const { data: analysisRow, error: insErr } = await supabase
    .from('skin_analyses')
    .upsert(
      {
        client_id: clientId,
        tenant_id: client.tenant_id,
        yiyuan_share_id: analysis.yiyuanShareId,
        yiyuan_analysis_id: analysis.yiyuanAnalysisId,
        analyzed_at: analysis.analyzedAt,
        age_at_analysis: analysis.client.ageReal,
        biological_age: analysis.client.ageBiological,
        skin_type: analysis.client.skinType,
        skin_color: analysis.client.skinColor,
        ita: analysis.client.ita,
        overall_score: analysis.overallScore,
        face_shape: analysis.faceShape,
        golden_triangle: analysis.goldenTriangle,
        appearance_score: analysis.appearance,
        raw_response: analysis.rawResponse,
      },
      { onConflict: 'yiyuan_share_id' },
    )
    .select('id')
    .single();

  if (insErr || !analysisRow) {
    return NextResponse.json(
      { error: 'Error guardando análisis', details: insErr?.message },
      { status: 500 },
    );
  }

  // Reemplazar scores
  await supabase
    .from('skin_analysis_scores')
    .delete()
    .eq('analysis_id', analysisRow.id);

  const scoreRows = analysis.metrics.map((m) => ({
    analysis_id: analysisRow.id,
    metric: m.key,
    label_es: m.labelEs,
    score: m.score,
    level: m.level ?? null,
    count: m.count ?? null,
    severity: m.severity,
    image_url: m.imageUrl ?? null,
  }));

  if (scoreRows.length > 0) {
    await supabase.from('skin_analysis_scores').insert(scoreRows);
  }

  // Reemplazar imágenes
  await supabase
    .from('skin_analysis_images')
    .delete()
    .eq('analysis_id', analysisRow.id);

  const imageRows = analysis.images.map((img) => ({
    analysis_id: analysisRow.id,
    image_type: img.type,
    label_es: img.labelEs,
    original_url: img.url,
    storage_path: null,
  }));

  if (imageRows.length > 0) {
    await supabase.from('skin_analysis_images').insert(imageRows);
  }

  return NextResponse.json({
    ok: true,
    analysisId: analysisRow.id,
    shareId: analysis.yiyuanShareId,
    summary: {
      client: analysis.client,
      overallScore: analysis.overallScore,
      topConcerns: analysis.metrics
        .filter((m) => m.severity === 'critical' || m.severity === 'concern')
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
        .map((m) => ({ key: m.key, label: m.labelEs, score: m.score })),
    },
  });
}
```

### 7.9. Helper de Supabase SSR

**Archivo**: `src/lib/supabase/server.ts`

Si ya tienes uno en tu proyecto Venus, úsalo y borra este. Si no, aquí va uno estándar con `@supabase/ssr`:

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createServerSupabase() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          return (await cookieStore).getAll();
        },
        async setAll(cookiesToSet) {
          try {
            const store = await cookieStore;
            cookiesToSet.forEach(({ name, value, options }) => {
              store.set(name, value, options);
            });
          } catch {
            // Server component: set() no está disponible, se ignora
          }
        },
      },
    },
  );
}
```

Requiere:

```bash
pnpm add @supabase/ssr
```

Y en `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 8. Cómo integrarlo con Venus existente

La tabla `clients` asume esquema multi-tenant. Tienes dos opciones:

**Opción A — Mantener tablas separadas (recomendada al inicio)**
En `clients` solo guardas los que hayan hecho al menos un análisis. Usa teléfono/email como puente con tu tabla principal.

**Opción B — Apuntar FK a tu tabla real**
En `skin_analyses.client_id` haz que referencie a tu tabla `customers` (o como se llame) y elimina la tabla `clients` creada aquí.

**Agregar el botón en la ficha del cliente:**

```tsx
<Link
  href={`/clientes/${cliente.id}/analisis/nuevo`}
  className="rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 px-4 py-2 text-white text-sm font-medium"
>
  Nuevo análisis de piel
</Link>
```

**Permisos de cámara:**
`html5-qrcode` pide permiso automáticamente. En iPad/iOS Safari requiere HTTPS (localhost está exento en dev). Si Venus ya se sirve por HTTPS, no hay nada más que configurar.

---

## 9. Script de prueba standalone

**Archivo**: `scripts/test-yiyuan-fetch.ts`

Útil para iterar sin levantar Next.js. Valida que el fetch server-side funciona y que el normalizador clasifica bien.

```typescript
/**
 * Uso:
 *   npx tsx scripts/test-yiyuan-fetch.ts 88a29e9bbc149e39ed21b840b3647017
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchYiyuanShareDetail } from '../src/lib/yiyuan/client';
import { normalizeYiyuanResponse } from '../src/lib/yiyuan/normalizer';

async function main() {
  const shareId = process.argv[2];
  if (!shareId) {
    console.error('Uso: npx tsx scripts/test-yiyuan-fetch.ts <shareId>');
    process.exit(1);
  }

  console.log(`→ Descargando reporte shareId=${shareId}...`);
  const raw = await fetchYiyuanShareDetail(shareId);

  console.log(`  ✓ cliente: ${raw.nickname} (${raw.mobile})`);
  console.log(`  ✓ edad: ${raw.age} años, fototipo: ${raw.analysis.color?.result}`);
  console.log(`  ✓ tipo de piel: ${raw.analysis.skin_type?.type}`);

  const normalized = normalizeYiyuanResponse(raw);

  console.log('\n→ Métricas normalizadas:');
  for (const m of normalized.metrics) {
    const bar = '█'.repeat(Math.round(m.score / 5)).padEnd(20);
    console.log(
      `  ${m.labelEs.padEnd(28)} ${bar} ${String(m.score).padStart(3)}/100  [${m.severity}]`,
    );
  }

  console.log(`\n→ ${normalized.images.length} imágenes disponibles`);

  const outDir = resolve(process.cwd(), 'tmp');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'yiyuan-raw.json'), JSON.stringify(raw, null, 2));
  writeFileSync(
    resolve(outDir, 'venus-normalized.json'),
    JSON.stringify(normalized, null, 2),
  );

  console.log(`\n✅ Archivos guardados en ${outDir}/`);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  if (err.raw) console.error(JSON.stringify(err.raw, null, 2));
  process.exit(1);
});
```

**Correrlo:**

```bash
npx tsx scripts/test-yiyuan-fetch.ts 88a29e9bbc149e39ed21b840b3647017
```

Si imprime las 13 métricas con barras ASCII, el pipeline está funcionando.

---

## 10. Siguientes pasos

- [x] Cliente API + normalizador + tipos
- [x] Endpoint `/api/yiyuan/import`
- [x] Schema Supabase con RLS
- [x] Scanner QR con 3 métodos
- [x] Página "Nuevo análisis"
- [x] Helper Supabase SSR
- [ ] **Vista detalle del análisis** — UI que consuma las 3 tablas, con heatmap facial y radar chart
- [ ] **Narrativa con Claude Sonnet** — convertir 25 scores en reporte premium en español con mapeo al menú de Venus
- [ ] **PDF premium** con `@react-pdf/renderer` (tema dark Venus + magenta)
- [ ] **Worker de descarga de imágenes** a Supabase Storage (para no depender de URLs de Yiyuan)
- [ ] **Gráfica de evolución** con la vista `v_skin_evolution`
- [ ] **WhatsApp + Wallet pass** con próxima cita sugerida según severidades críticas

**Orden recomendado:** narrativa con Claude primero (es el diferenciador clave frente al software del aparato), después vista detalle, luego PDF, y al final la integración con WhatsApp + Wallet.

---

## Apéndice — Comandos rápidos de referencia

```bash
# Instalar deps
pnpm add zod html5-qrcode lucide-react @supabase/ssr
pnpm add -D tsx typescript @types/node

# Migración Supabase (elegir uno)
supabase db push
# o pegar el SQL en Supabase Studio → SQL Editor

# Probar fetch standalone
npx tsx scripts/test-yiyuan-fetch.ts <shareId>

# Levantar Next.js
pnpm dev
```

**Endpoint de Yiyuan (referencia):**

```bash
curl 'https://zm.yiyuan.ai/skinSrv/analysis/shareDetail?shareId=<shareId>' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'locale: es-419' \
  -H 'referer: https://zm.yiyuan.ai/zmskinweb/' \
  -H 'user-agent: Mozilla/5.0'
```

---

_Documento generado el 24 de abril de 2026. WalletClub Studio — Said Romero._
