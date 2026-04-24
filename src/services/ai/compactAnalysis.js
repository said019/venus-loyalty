// src/services/ai/compactAnalysis.js — Reduce el análisis normalizado al mínimo necesario para la IA
//
// De ~8000 tokens (JSON crudo) a ~200-300 tokens (key:value plano).
// Solo enviamos métricas con severity != 'excellent' (las buenas no necesitan consejo).

/**
 * @param {object} normalized - salida de normalizeYiyuanResponse
 * @returns {{
 *   age: number,
 *   skinType: string,
 *   skinColor: string,
 *   overallScore: number,
 *   concerns: string,      // "uv_spot:26/59|pore:34/953|blackhead:36/160|..."
 *   strengths: string      // "sensitive|collagen|texture|..."
 * }}
 */
export function compactForAI(normalized) {
    const metrics = normalized.metrics || [];

    const concerns = metrics
        .filter((m) => m.severity !== 'excellent')
        .sort((a, b) => Number(a.score) - Number(b.score)) // peor primero
        .map((m) => {
            const score = Math.round(Number(m.score));
            const count = m.count && Number(m.count) > 0 ? `/${m.count}` : '';
            return `${m.key}:${score}${count}`;
        })
        .join('|');

    const strengths = metrics
        .filter((m) => m.severity === 'excellent')
        .map((m) => m.key)
        .join('|');

    return {
        age: normalized.client?.ageReal ?? null,
        skinType: normalized.client?.skinType || 'Normal',
        skinColor: normalized.client?.skinColor || 'Media',
        overallScore: Math.round(Number(normalized.overallScore) || 0),
        concerns: concerns || 'ninguna',
        strengths: strengths || 'ninguna',
    };
}

/**
 * Formatea el compacto a user message plano (menos tokens que JSON)
 */
export function compactToUserMessage(compact) {
    return [
        `Edad: ${compact.age ?? 'n/d'}`,
        `Tipo piel: ${compact.skinType}`,
        `Fototipo: ${compact.skinColor}`,
        `Score global: ${compact.overallScore}/100`,
        `Preocupaciones (key:score[/count]): ${compact.concerns}`,
        `Fortalezas: ${compact.strengths}`,
    ].join('\n');
}
