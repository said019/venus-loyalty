// src/services/skinNormalizer.js — Convierte respuesta cruda de Yiyuan al modelo Venus
//
// Aplica:
//  - Traducción de códigos chinos (shen_character, baixi, XGX, etc.)
//  - Mapeo a esquema plano para PostgreSQL/Prisma
//  - Clasificación de severidad para UI (excellent/good/moderate/concern/critical)

// ── Diccionarios ES ────────────────────────────────────────────────────────

const SKIN_TYPE_ES = {
    oil: 'Grasa',
    dry: 'Seca',
    mixed: 'Mixta',
    neutral: 'Normal',
};

const SKIN_COLOR_ES = {
    baixi: 'Blanca clara',
    zhongxi: 'Media',
    heixi: 'Morena',
    baihuang: 'Blanca amarilla',
    zihuang: 'Amarilla natural',
};

const FACE_SHAPE_ES = {
    shen_character: 'Ovalada alargada (申)',
    guo_character: 'Cuadrada (国)',
    tian_character: 'Redonda (田)',
    you_character: 'Rectangular (由)',
    jia_character: 'Triangular invertida (甲)',
    feng_character: 'Corazón (风)',
    mu_character: 'Corazón alargado (目)',
};

const METRIC_LABELS_ES = {
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

function toNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
        const n = parseFloat(v);
        return Number.isNaN(n) ? 0 : n;
    }
    return 0;
}

function severityFromScore(score) {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'moderate';
    if (score >= 30) return 'concern';
    return 'critical';
}

function translate(dict, key) {
    if (!key) return '';
    return dict[key] ?? key;
}

// ── Extractores ────────────────────────────────────────────────────────────

function extractMetrics(a) {
    const entries = [
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

    const metrics = entries
        .filter(([, m]) => m != null)
        .map(([key, m]) => {
            const score = toNumber(m?.score);
            return {
                key,
                labelEs: METRIC_LABELS_ES[key] ?? key,
                score,
                level: typeof m?.level === 'number' ? m.level : null,
                count: typeof m?.count === 'number' ? m.count : toNumber(m?.count) || null,
                severity: severityFromScore(score),
                imageUrl: m?.filename ?? null,
            };
        });

    if (a.dark_circle && typeof a.dark_circle.score === 'number') {
        metrics.push({
            key: 'dark_circle',
            labelEs: METRIC_LABELS_ES.dark_circle,
            score: a.dark_circle.score,
            level: a.dark_circle.level ?? null,
            count: null,
            severity: severityFromScore(a.dark_circle.score),
            imageUrl: null,
        });
    }

    return metrics;
}

function extractImages(a) {
    const imgs = [];

    const add = (type, labelEs, url) => {
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

    if (Array.isArray(a.aging_simu?.filenames)) {
        a.aging_simu.filenames.forEach((url, idx) => {
            add('aging_simu', `Simulación de envejecimiento #${idx + 1}`, url);
        });
    }

    return imgs;
}

/**
 * Normaliza una respuesta cruda de Yiyuan al modelo Venus.
 * @param {object} raw - respuesta de fetchYiyuanShareDetail
 * @returns {{
 *   yiyuanShareId: string,
 *   yiyuanAnalysisId: number,
 *   analyzedAt: string,
 *   locale: string,
 *   client: { nickname, mobile, birthday, ageReal, ageBiological, sex, skinType, skinColor, ita },
 *   overallScore: number,
 *   appearance: number|null,
 *   faceShape: string,
 *   goldenTriangle: number|null,
 *   metrics: Array,
 *   images: Array,
 *   rawResponse: object
 * }}
 */
export function normalizeYiyuanResponse(raw) {
    const a = raw.analysis || {};

    const client = {
        nickname: raw.nickname || 'Sin nombre',
        mobile: raw.mobile || '',
        birthday: raw.birthday || null,
        ageReal: raw.age ?? null,
        ageBiological: a.age?.result ?? raw.age ?? null,
        sex: raw.sex === 1 ? 'F' : 'M',
        skinType: translate(SKIN_TYPE_ES, a.skin_type?.type),
        skinColor: translate(SKIN_COLOR_ES, a.color?.result),
        ita: a.color?.ita ?? null,
    };

    const analyzedAt = raw.crt_time
        ? new Date(raw.crt_time.replace(' ', 'T') + 'Z').toISOString()
        : new Date().toISOString();

    return {
        yiyuanShareId: raw.shareId,
        yiyuanAnalysisId: raw.id,
        analyzedAt,
        locale: raw.locale || 'es-419',
        client,
        overallScore: raw.score || a.appearance?.score || 0,
        appearance: a.appearance?.score ?? null,
        faceShape: translate(FACE_SHAPE_ES, a.face_shape?.shape),
        goldenTriangle: a.face_ratio?.golden_triangle ?? null,
        metrics: extractMetrics(a),
        images: extractImages(a),
        rawResponse: raw,
    };
}

// Exports secundarios útiles para tests/UI
export {
    SKIN_TYPE_ES,
    SKIN_COLOR_ES,
    FACE_SHAPE_ES,
    METRIC_LABELS_ES,
    severityFromScore,
};
