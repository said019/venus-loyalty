// src/services/yiyuan.js — Cliente API Yiyuan Skin Analyzer
//
// Endpoint descubierto por reverse-engineering del frontend oficial:
//   GET https://zm.yiyuan.ai/skinSrv/analysis/shareDetail?shareId={shareId}
//
// Requiere header Referer desde zm.yiyuan.ai para pasar el check del servidor.
// No requiere autenticación — el shareId es público una vez generado por el aparato.

const YIYUAN_BASE = 'https://zm.yiyuan.ai';
const DEFAULT_REFERER = `${YIYUAN_BASE}/zmskinweb/`;
const DEFAULT_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) ' +
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

export class YiyuanApiError extends Error {
    constructor(message, { status, code, raw } = {}) {
        super(message);
        this.name = 'YiyuanApiError';
        this.status = status;
        this.code = code;
        this.raw = raw;
    }
}

/**
 * Extrae el shareId desde una URL de reporte de Yiyuan.
 * Acepta:
 *   https://zm.yiyuan.ai/zmskinweb/#/report?shareId=XXX&locale=es
 *   https://zm.yiyuan.ai/zmskinweb/#/report?locale=es&shareId=XXX
 *   XXX (directo)
 */
export function extractShareId(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (/^[a-f0-9]{20,64}$/i.test(trimmed)) return trimmed;
    const match = trimmed.match(/shareId=([a-f0-9]{20,64})/i);
    return match?.[1] ?? null;
}

/**
 * Descarga el reporte completo de Yiyuan para un shareId dado.
 * @param {string} shareId - hex string de 20-64 chars
 * @param {{ locale?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<object>} - respuesta cruda de Yiyuan
 */
export async function fetchYiyuanShareDetail(shareId, opts = {}) {
    if (!shareId || !/^[a-f0-9]{20,64}$/i.test(shareId)) {
        throw new YiyuanApiError(`shareId inválido: ${shareId}`);
    }

    const { locale = 'es-419', timeoutMs = 15_000 } = opts;
    const url = `${YIYUAN_BASE}/skinSrv/analysis/shareDetail?shareId=${shareId}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let res;
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
        });
    } catch (err) {
        clearTimeout(timeout);
        if (err?.name === 'AbortError') {
            throw new YiyuanApiError(`Timeout (${timeoutMs}ms) consultando Yiyuan`);
        }
        throw new YiyuanApiError(`Error de red consultando Yiyuan: ${err.message}`);
    }
    clearTimeout(timeout);

    if (!res.ok) {
        throw new YiyuanApiError(`Yiyuan respondió HTTP ${res.status}`, { status: res.status });
    }

    let json;
    try {
        json = await res.json();
    } catch {
        throw new YiyuanApiError('Respuesta de Yiyuan no es JSON válido');
    }

    if (!json || typeof json !== 'object') {
        throw new YiyuanApiError('Respuesta vacía de Yiyuan', { raw: json });
    }

    if (json.code !== 0) {
        throw new YiyuanApiError(
            `Yiyuan devolvió error de negocio (code=${json.code})`,
            { status: res.status, code: json.code, raw: json }
        );
    }

    if (!json.analysis) {
        throw new YiyuanApiError(
            'Respuesta sin objeto analysis (reporte incompleto o expirado)',
            { status: res.status, code: json.code, raw: json }
        );
    }

    return json;
}
