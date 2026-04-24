# Venus Skin — Narrativa con IA (optimizado para mínimo gasto de tokens)

> **Objetivo**: generar narrativa profesional en español + recomendaciones de tratamientos Venus, gastando el mínimo de tokens por análisis (~$0.003 USD c/u).

---

## Estrategia de optimización

Cinco palancas que aplicamos simultáneamente:

1. **Compactación extrema del input**: de 8,000 → 300 tokens enviando solo métricas relevantes
2. **Prompt caching** de Anthropic: el system prompt (menú Venus + reglas) se cachea — solo pagas 10% después del primer hit
3. **Claude Haiku 4.5** en vez de Sonnet — 12× más barato, suficiente para narrativa guiada
4. **Structured output JSON**: fuerza respuestas concisas y parseables
5. **max_tokens limitado** a 600

**Resultado**: ~$0.003 USD por análisis (20 análisis/día = ~$1.80 USD/mes)

---

## Arquitectura del prompt

```
┌─────────────────────────────────────────────────────┐
│ SYSTEM PROMPT (cacheado — pagas 10% después del 1º) │
│   - Rol: dermocosmetóloga de Venus                  │
│   - Menú completo de tratamientos Venus             │
│   - Reglas de escritura (tono, extensión, español)  │
│   - Schema JSON estricto de salida                  │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ USER MESSAGE (único por análisis — ~300 tokens)     │
│   - Edad, tipo de piel, fototipo                    │
│   - Solo métricas con severity ≠ 'excellent'        │
│   - Solo campos relevantes (score, count, nivel)    │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ OUTPUT JSON (~500 tokens)                           │
│   - headline (1 línea)                              │
│   - summary (2-3 oraciones)                         │
│   - concerns[] (top 3 prioridades)                  │
│   - recommendations[] (tratamientos Venus mapeados) │
│   - homeCare[] (tips rutina casa)                   │
│   - nextAnalysisIn (semanas sugeridas)              │
└─────────────────────────────────────────────────────┘
```

---

## 1. Compactador de input

**Archivo**: `src/lib/ai/compact-analysis.ts`

Toma el `VenusSkinAnalysis` normalizado (el output de `normalizeYiyuanResponse`) y genera el payload mínimo que se envía a Claude.

```typescript
import type { VenusSkinAnalysis } from '@/lib/yiyuan/normalizer';

/**
 * Reduce el análisis al mínimo necesario para la IA.
 * - Solo métricas con severity ≠ 'excellent' (las buenas no necesitan consejo)
 * - Solo campos que el modelo realmente usa
 * - Números redondeados (menos tokens)
 */
export interface CompactAnalysisInput {
  age: number;
  skinType: string;        // 'Grasa' | 'Seca' | 'Mixta' | 'Normal'
  skinColor: string;
  overallScore: number;
  // Lista compacta: "acne:86|blackhead:36/160|pore:34/953|spot:33/49"
  concerns: string;
  // Lista de métricas excelentes (solo nombres separados por |)
  strengths: string;
}

export function compactForAI(analysis: VenusSkinAnalysis): CompactAnalysisInput {
  // Separar en preocupaciones vs fortalezas
  const concerns = analysis.metrics
    .filter((m) => m.severity !== 'excellent')
    .sort((a, b) => a.score - b.score) // peor primero
    .map((m) => {
      const count = m.count && m.count > 0 ? `/${m.count}` : '';
      return `${m.key}:${Math.round(m.score)}${count}`;
    })
    .join('|');

  const strengths = analysis.metrics
    .filter((m) => m.severity === 'excellent')
    .map((m) => m.key)
    .join('|');

  return {
    age: analysis.client.ageReal,
    skinType: analysis.client.skinType,
    skinColor: analysis.client.skinColor,
    overallScore: Math.round(analysis.overallScore),
    concerns,
    strengths,
  };
}
```

**Tamaño del payload**:
```
Antes (JSON crudo): ~8,000 tokens
Después (CompactAnalysisInput como string): ~150-300 tokens
```

---

## 2. System prompt (cacheado)

**Archivo**: `src/lib/ai/prompts.ts`

Este string se envía como `system` con `cache_control`. La primera llamada cuesta normal, las siguientes cuestan 10%. Supabase/Vercel mantienen el prompt caliente entre invocaciones.

```typescript
/**
 * System prompt para narrativa de análisis de piel.
 *
 * IMPORTANTE: este string es CONSTANTE. Cualquier cambio invalida la caché.
 * Si necesitas personalizarlo por tenant (ej: distintas sucursales de Venus),
 * carga el menú desde la DB y cachea por tenant_id.
 */

export const SKIN_ANALYSIS_SYSTEM_PROMPT = `Eres la dermocosmetóloga digital de Venus Cosmetología en San Juan del Río, Querétaro. Hablas español mexicano cálido y profesional, sin ser empalagosa.

Recibes un análisis compacto de una clienta. Devuelves SOLO un JSON válido con este schema exacto:

{
  "headline": "Una frase de 8-14 palabras que resuma el estado general con un enfoque positivo y motivador.",
  "summary": "2-3 oraciones explicando el estado de la piel. Menciona 1 fortaleza real y 1-2 áreas a trabajar. Tono profesional, empático, sin dramatizar.",
  "concerns": [
    { "metric": "key_del_input", "why": "Por qué importa (1 línea, términos accesibles)", "priority": 1 }
  ],
  "recommendations": [
    { "treatment": "Nombre exacto del menú Venus", "sessions": 3, "frequency": "Cada 15 días", "why": "1 línea explicando el beneficio" }
  ],
  "homeCare": [
    "Consejo accionable y específico (no genérico)"
  ],
  "nextAnalysisIn": 8
}

REGLAS ESTRICTAS:
- "concerns": máximo 3, ordenados por prioridad (1 = más urgente)
- "recommendations": máximo 3, SOLO del menú Venus que listo abajo, mapeados a los concerns reales
- "homeCare": 3-4 consejos, específicos al tipo de piel y concerns
- "nextAnalysisIn": número entero de semanas (4-12 según severidad)
- NUNCA inventes tratamientos fuera del menú Venus
- NUNCA diagnostiques condiciones médicas — deriva al dermatólogo si score < 30 en alguna métrica
- NO uses emojis, NO uses markdown, NO uses negritas
- Responde ÚNICAMENTE el JSON, sin texto antes o después

MENÚ VENUS (único set permitido de tratamientos):

1. Limpieza Facial Profunda — Extracción de puntos negros, poros dilatados, grasa acumulada. Ideal para piel grasa o mixta con comedones.
2. Hidrafacial Premium — Limpieza + exfoliación + hidratación profunda con suero ácido hialurónico. Para deshidratación, opacidad, poros visibles.
3. Peeling Químico Superficial — Ácido mandélico/glicólico suave. Renueva textura, atenúa manchas leves, mejora luminosidad.
4. Peeling Químico Medio — Ácido salicílico + TCA bajo. Para manchas moderadas, cicatrices de acné, fotoenvejecimiento.
5. Microneedling con Dermapen — Estimula colágeno. Ideal para cicatrices de acné (pockmark), poros dilatados, líneas finas.
6. Radiofrecuencia Facial — Tensado, producción de colágeno. Para flacidez leve, pérdida de firmeza, ojeras leves.
7. Radiofrecuencia Ocular — Específica para zona periorbital. Ojeras vasculares, bolsas, líneas de expresión.
8. Fotodepilación / IPL Vascular — Para rojez persistente, cuperosis, manchas pigmentarias superficiales.
9. Mesoterapia Facial — Vitaminas inyectables. Revitaliza piel apagada, mejora hidratación profunda.
10. Tratamiento Anti-Acné Activo — Protocolo de 4 sesiones con peeling salicílico + extracción + alta frecuencia.
11. Protocolo Despigmentante — Serie de peelings + mascarillas + home care con tranexámico. Para melasma, manchas UV, pigmentación.
12. Facial Calmante Hidratante — Para piel sensible, reactiva, con rojez. Mascarillas de centella asiática y niacinamida.

CÓDIGOS DE MÉTRICAS DE ENTRADA:
acne (granos activos) · blackhead (puntos negros) · pore (poros) · spot (manchas) · pigment (pigmentación) · uv_spot (daño solar) · pockmark (cicatrices) · wrinkle (arrugas) · texture (textura) · collagen (colágeno) · ext_water (hidratación) · sensitive (sensibilidad) · dark_circle (ojeras)

ESCALA DE SCORES: 0-100 donde MAYOR = MEJOR piel. Menos de 50 = trabajar. Menos de 30 = prioritario.`;
```

**Tokens del system prompt**: ~900. Con caching, después de la 1ª llamada cuesta ~90 tokens efectivos.

---

## 3. Cliente de Claude optimizado

**Archivo**: `src/lib/ai/claude-narrative.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { SKIN_ANALYSIS_SYSTEM_PROMPT } from './prompts';
import type { CompactAnalysisInput } from './compact-analysis';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface AiNarrativeOutput {
  headline: string;
  summary: string;
  concerns: Array<{ metric: string; why: string; priority: number }>;
  recommendations: Array<{
    treatment: string;
    sessions: number;
    frequency: string;
    why: string;
  }>;
  homeCare: string[];
  nextAnalysisIn: number;
}

/**
 * Genera la narrativa del análisis en español usando Haiku + caching.
 *
 * Costo estimado por llamada (tras el primer hit de caché):
 *   - Input cacheado: ~90 tokens efectivos
 *   - Input fresh: ~150 tokens
 *   - Output: ~500 tokens
 *   Total: ~$0.003 USD con Haiku 4.5
 */
export async function generateNarrative(
  input: CompactAnalysisInput,
): Promise<AiNarrativeOutput> {
  // User message súper corto. Formato key:value plano (menos tokens que JSON)
  const userMsg = [
    `Edad: ${input.age}`,
    `Tipo piel: ${input.skinType}`,
    `Fototipo: ${input.skinColor}`,
    `Score global: ${input.overallScore}/100`,
    `Preocupaciones (key:score[/count]): ${input.concerns || 'ninguna'}`,
    `Fortalezas: ${input.strengths || 'ninguna'}`,
  ].join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    system: [
      {
        type: 'text',
        text: SKIN_ANALYSIS_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }, // ← clave para caching
      },
    ],
    messages: [
      {
        role: 'user',
        content: userMsg,
      },
    ],
  });

  // Extraer el texto
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') {
    throw new Error('Respuesta sin contenido de texto');
  }

  // Parsear JSON (Haiku a veces agrega backticks aunque le digas que no)
  const raw = block.text.trim().replace(/^```json\s*|\s*```$/g, '');
  let parsed: AiNarrativeOutput;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Respuesta de Claude no es JSON válido: ${(e as Error).message}\nRaw: ${raw.slice(0, 200)}`,
    );
  }

  return parsed;
}
```

---

## 4. Integración con el endpoint de importación

**Archivo**: `src/app/api/yiyuan/import/route.ts` (modificación)

Después del `insert` del análisis y antes del return, añadir:

```typescript
// Después de guardar el análisis en Supabase
import { compactForAI } from '@/lib/ai/compact-analysis';
import { generateNarrative } from '@/lib/ai/claude-narrative';

// ... dentro del POST, después del insert exitoso ...

// 5. Generar narrativa con IA (async, no bloquea la respuesta)
const compact = compactForAI(analysis);

// Opción A: bloqueante (respuesta tarda 2-3s más pero sale todo listo)
try {
  const narrative = await generateNarrative(compact);

  await supabase
    .from('skin_analyses')
    .update({
      ai_summary_es: narrative.summary,
      ai_recommendations: narrative,
      treatment_suggestions: narrative.recommendations,
    })
    .eq('id', analysisRow.id);
} catch (err) {
  // No bloqueamos el flujo si IA falla — se puede regenerar después
  console.error('Error generando narrativa:', err);
}

// Opción B: background (respuesta instantánea, narrativa aparece después)
// queue.enqueue('generate-narrative', { analysisId: analysisRow.id });
```

**Recomendación**: usa Opción A para el MVP (más simple). Cuando tengas volumen (50+ análisis/día), pasa a Opción B con Inngest o trigger.dev.

---

## 5. Endpoint para regenerar narrativa

Útil si cambias el menú de Venus o quieres mejorar el tono.

**Archivo**: `src/app/api/yiyuan/analysis/[id]/regenerate/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { compactForAI } from '@/lib/ai/compact-analysis';
import { generateNarrative } from '@/lib/ai/claude-narrative';
import { normalizeYiyuanResponse } from '@/lib/yiyuan/normalizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('skin_analyses')
    .select('id, raw_response')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  const normalized = normalizeYiyuanResponse(data.raw_response);
  const compact = compactForAI(normalized);
  const narrative = await generateNarrative(compact);

  await supabase
    .from('skin_analyses')
    .update({
      ai_summary_es: narrative.summary,
      ai_recommendations: narrative,
      treatment_suggestions: narrative.recommendations,
    })
    .eq('id', id);

  return NextResponse.json({ ok: true, narrative });
}
```

---

## 6. Instalar dependencia

```bash
pnpm add @anthropic-ai/sdk
```

**Variables de entorno**:

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 7. Ejemplo de output real

Para un input como:
```
Edad: 28
Tipo piel: Grasa
Fototipo: Blanca clara
Score global: 65/100
Preocupaciones (key:score[/count]): uv_spot:26/59|pore:34/953|blackhead:36/160|spot:33/49|ext_water:40|pigment:52
Fortalezas: sensitive|dark_circle|collagen|texture
```

Claude devuelve (~500 tokens):
```json
{
  "headline": "Tu piel tiene base sólida, necesita trabajo en poros y pigmentación",
  "summary": "Tu piel muestra una estructura saludable con muy buena elasticidad, textura fina y tolerancia normal. Las áreas prioritarias son el daño solar acumulado y los poros dilatados con comedones, que son el origen de la congestión que probablemente notas en zona T.",
  "concerns": [
    { "metric": "uv_spot", "why": "Tienes 59 manchas subdérmicas de daño solar que aún no se ven a simple vista pero emergerán sin protección", "priority": 1 },
    { "metric": "pore", "why": "953 poros dilatados con acumulación sebácea que causan textura irregular", "priority": 2 },
    { "metric": "blackhead", "why": "160 comedones activos en zona T que se convierten en inflamación si no se extraen", "priority": 3 }
  ],
  "recommendations": [
    { "treatment": "Protocolo Despigmentante", "sessions": 4, "frequency": "Cada 21 días", "why": "Trata el daño UV antes de que aflore como manchas visibles" },
    { "treatment": "Hidrafacial Premium", "sessions": 3, "frequency": "Cada 15 días", "why": "Extrae comedones y descongestiona poros con hidratación profunda" },
    { "treatment": "Microneedling con Dermapen", "sessions": 3, "frequency": "Mensual", "why": "Reduce el diámetro de poro y mejora textura a mediano plazo" }
  ],
  "homeCare": [
    "FPS 50+ diario sin excepción, incluso en días nublados — es el 80% del resultado despigmentante",
    "Niacinamida al 10% de noche para regular sebo y cerrar poros",
    "Limpiador con ácido salicílico 2% en zona T, 3 veces por semana máximo",
    "Hidratante gel (no crema) por tu piel grasa — busca ácido hialurónico sin oclusivos"
  ],
  "nextAnalysisIn": 8
}
```

---

## Comparación de costos reales

Asumiendo precios públicos de Anthropic (octubre 2026):

| Modelo | Input $/Mtok | Output $/Mtok | Cache read $/Mtok |
|---|---|---|---|
| Claude Haiku 4.5 | $1.00 | $5.00 | $0.10 |
| Claude Sonnet 4.6 | $3.00 | $15.00 | $0.30 |

**Por análisis, después del primer hit de caché:**

| Estrategia | Input (cached) | Input (fresh) | Output | Total USD |
|---|---|---|---|---|
| JSON crudo + Sonnet (sin cache) | — | 8,000 | 1,500 | $0.0465 |
| Compacto + Sonnet + cache | 900 × 10% | 200 | 600 | $0.0101 |
| **Compacto + Haiku + cache** ⭐ | 900 × 10% | 200 | 600 | **$0.0033** |

**20 análisis/día × 30 días = 600/mes → $2 USD/mes** con estrategia óptima.

---

## Cuándo subir a Sonnet

Haiku 4.5 es suficiente para el 95% de los casos. Considera Sonnet solo si:
- El tono de las narrativas se siente robótico después de 50+ ejemplos
- Quieres análisis comparativos entre sesiones (evolución)
- Generación del PDF premium donde la calidad literaria importa más

Puedes hacerlo híbrido: Haiku para generación rutinaria, Sonnet para el reporte PDF final mensual.

---

## Trucos adicionales para bajar más tokens

1. **Limita `homeCare` a 3 items** en el prompt → ahorra ~50 tokens output
2. **Acorta `why` a máximo 12 palabras** → prompt explícito ahorra ~100 tokens output
3. **Versiona el prompt**: guarda `prompt_version` en la tabla. Si cambias el system prompt, los reportes viejos se regeneran solo si el usuario lo pide
4. **Batch processing**: si generas reportes mensuales de evolución para todos los clientes, usa la Message Batches API de Anthropic (50% descuento extra)

---

_Documento generado el 24 de abril de 2026. WalletClub Studio — Said Romero._
