import { METRIC_LABELS_ES } from './skinNormalizer.js';

const LABELS = { frente: 'Frente', entrecejo: 'Entrecejo', nariz: 'Nariz', mejilla_izq: 'Mejilla izquierda', mejilla_der: 'Mejilla derecha', menton: 'Mentón', ojo_izq: 'Ojo izquierdo', ojo_der: 'Ojo derecho', surco_nasogeniano: 'Surco nasogeniano' };
const SKIN = { forehead: 'frente', nose: 'nariz', left_cheek: 'mejilla_izq', right_cheek: 'mejilla_der', chin: 'menton' };
const WRINKLES = { forehead: ['frente'], glabella: ['entrecejo'], eyecorner: ['ojo_izq', 'ojo_der'], crowfeet: ['ojo_izq', 'ojo_der'], nasolabial: ['surco_nasogeniano'] };
const LEVELS = { none: ['Sin hallazgo', 'ok'], lightly: ['Leve', 'ok'], moderately: ['Moderado', 'watch'], severely: ['Severo', 'focus'], severe: ['Severo', 'focus'] };
const RANK = { ok: 0, watch: 1, focus: 2 };
export function numericScore(value) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
function finding(metric, labelEs, data) {
    const [levelEs, status] = LEVELS[data.level] || ['Sin nivel disponible', null];
    return { metric, labelEs, levelEs, status, score: numericScore(data.score), ...(Number.isFinite(data.count) ? { count: data.count } : {}) };
}
export function buildZoneMap(rawResponse) {
    const a = rawResponse?.analysis || {};
    const zones = new Map();
    const add = (key, item) => {
        if (!zones.has(key)) zones.set(key, { key, labelEs: LABELS[key], status: null, findings: [] });
        const zone = zones.get(key);
        zone.findings.push(item);
        if (item.status && (zone.status === null || RANK[item.status] > RANK[zone.status])) zone.status = item.status;
    };
    for (const entry of Array.isArray(a.skin_type?.category) ? a.skin_type.category : []) {
        if (!entry || !SKIN[entry.cls]) continue;
        add(SKIN[entry.cls], finding('skin_type', { oil: 'Grasa', dry: 'Sequedad', mid: 'Equilibrio de grasa' }[entry.type] || 'Tipo de piel', entry));
    }
    for (const entry of Array.isArray(a.wrinkle?.category) ? a.wrinkle.category : []) {
        if (!entry || !WRINKLES[entry.cls]) continue;
        for (const key of WRINKLES[entry.cls]) add(key, {
            ...finding(`wrinkle_${entry.cls}`, entry.cls === 'crowfeet' ? 'Patas de gallo' : 'Arrugas', entry),
            ...(WRINKLES[entry.cls].length > 1 ? { shared: true } : {}),
        });
    }
    for (const [side, key] of [['left', 'ojo_izq'], ['right', 'ojo_der']]) {
        const level = a.dark_circle?.[`${side}Level`];
        if (level != null) add(key, finding('dark_circle', 'Ojeras', { level }));
    }
    const global = Object.entries(METRIC_LABELS_ES).filter(([key]) => a[key] && key !== 'wrinkle' && key !== 'dark_circle').map(([key, label]) => ({
        ...finding(key, label, a[key]), imageUrl: typeof a[key].filename === 'string' ? a[key].filename : null,
    }));
    return { zones: [...zones.values()], global };
}
