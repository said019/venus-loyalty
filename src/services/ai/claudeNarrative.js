// src/services/ai/claudeNarrative.js — Narrativa clínica con Claude Haiku 4.5 + prompt caching
//
// Costo estimado después del primer hit de cache:
//   - Input cacheado: ~90 tokens efectivos (system prompt cacheado al 10%)
//   - Input fresh: ~150 tokens (user message)
//   - Output: ~500 tokens
// Total: ~$0.003 USD por análisis con Haiku 4.5
//
// Requiere variable de entorno: ANTHROPIC_API_KEY

import Anthropic from '@anthropic-ai/sdk';
import { SKIN_ANALYSIS_SYSTEM_PROMPT } from './skinPrompt.js';
import { compactToUserMessage } from './compactAnalysis.js';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 700;

let _client = null;
function getClient() {
    if (_client) return _client;
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY no está configurada en el .env');
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return _client;
}

/**
 * Genera la narrativa clínica en español para un análisis compacto.
 * @param {object} compact - salida de compactForAI(normalized)
 * @returns {Promise<{
 *   headline: string,
 *   summary: string,
 *   concerns: Array<{metric:string, why:string, priority:number}>,
 *   recommendations: Array<{treatment:string, sessions:number, frequency:string, why:string}>,
 *   homeCare: string[],
 *   nextAnalysisIn: number,
 *   _usage: { inputTokens:number, outputTokens:number, cacheCreationInputTokens?:number, cacheReadInputTokens?:number }
 * }>}
 */
export async function generateNarrative(compact) {
    const client = getClient();
    const userMsg = compactToUserMessage(compact);

    const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [
            {
                type: 'text',
                text: SKIN_ANALYSIS_SYSTEM_PROMPT,
                cache_control: { type: 'ephemeral' },
            },
        ],
        messages: [
            { role: 'user', content: userMsg },
        ],
    });

    const block = response.content.find((b) => b.type === 'text');
    if (!block) {
        throw new Error('Respuesta de Claude sin bloque de texto');
    }

    // Haiku a veces envuelve con ```json aunque le digamos que no
    const raw = block.text.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/, '')
        .replace(/```$/, '')
        .trim();

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(
            `Claude devolvió respuesta no-JSON: ${err.message}. Raw: ${raw.slice(0, 300)}`
        );
    }

    // Validación básica de shape
    if (!parsed.headline || !parsed.summary || !Array.isArray(parsed.concerns) || !Array.isArray(parsed.recommendations)) {
        throw new Error('JSON de Claude incompleto: faltan campos requeridos');
    }

    // Telemetría de uso para monitoreo de costos
    parsed._usage = {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        cacheCreationInputTokens: response.usage?.cache_creation_input_tokens ?? 0,
        cacheReadInputTokens: response.usage?.cache_read_input_tokens ?? 0,
    };

    return parsed;
}

/**
 * Wrapper que no-lanza: en caso de error devuelve null y logea.
 * Útil cuando la narrativa es opcional y no debe bloquear el flujo principal.
 */
export async function generateNarrativeSafe(compact) {
    try {
        const result = await generateNarrative(compact);
        const u = result._usage || {};
        console.log(
            `[AI] Narrativa generada. tokens in=${u.inputTokens} out=${u.outputTokens} ` +
            `cache_create=${u.cacheCreationInputTokens} cache_read=${u.cacheReadInputTokens}`
        );
        return result;
    } catch (err) {
        console.warn('[AI] Error generando narrativa (continuando sin ella):', err.message);
        return null;
    }
}
