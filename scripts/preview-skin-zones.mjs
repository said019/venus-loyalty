// Local-only fixture preview. No database writes or AI calls.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeYiyuanResponse } from '../src/services/skinNormalizer.js';
import { buildZoneMap } from '../src/services/skinZones.js';
import { compareAnalyses, loadSkinProgress } from '../src/services/skinProgress.js';
import { loadSkinMenu, resolveRecommendations } from '../src/services/ai/skinMenu.js';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const raw = JSON.parse(await fs.readFile(new URL('../tests/fixtures/yiyuan-share-zonas.json', import.meta.url)));
const normalized = normalizeYiyuanResponse(raw);
const current = {
    id: 'demo', cardId: 'demo-card', clientName: 'Reporte de prueba', analyzedAt: '2026-09-22T12:00:00Z', overallScore: 71,
    skinType: normalized.client.skinType, rawResponse: raw,
    scores: normalized.metrics.map(m => ({ ...m, metric: m.key })),
    images: normalized.images.map(i => ({ imageType: i.type, labelEs: i.labelEs, originalUrl: i.url })),
    zoneMap: buildZoneMap(raw),
    aiRecommendations: { headline: 'Un plan de cuidado para tu piel', summary: 'Contenido de prueba para verificar el reporte; no es una valoración clínica.', recommendations: [{ serviceId: 'demo-service', treatment: 'Hidratación', price: 650, sessions: 3, frequency: 'Cada 15 días', why: 'Ejemplo del catálogo para comprobar la reserva' }], homeCare: ['Rutina de prueba'], concerns: [], nextAnalysisIn: 8 },
};
const previous = { ...current, analyzedAt: '2026-09-01T12:00:00Z', scores: current.scores.map(s => ({ ...s, score: Math.max(0, s.score - 8) })) };
current.progress = compareAnalyses(current, previous);
let reports = [current];
const live = process.argv.includes('--live');
if (live) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for read-only review');
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
        reports = await prisma.$transaction(async tx => {
            await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
            const menu = await loadSkinMenu(tx);
            const scans = await tx.skinAnalysis.findMany({ take: 3, orderBy: { analyzedAt: 'desc' }, include: { scores: true, images: true } });
            const results = [];
            for (const [index, scan] of scans.entries()) {
                const ai = scan.aiRecommendations;
                results.push({
                    id: 'review-' + (index + 1), clientName: 'Captura de revision ' + (index + 1),
                    analyzedAt: scan.analyzedAt, overallScore: scan.overallScore, skinType: scan.skinType,
                    scores: scan.scores.map(({ metric, labelEs, score, severity, count, imageUrl }) => ({ metric, labelEs, score, severity, count, imageUrl })),
                    images: scan.images.map(({ imageType, labelEs, originalUrl }) => ({ imageType, labelEs, originalUrl })),
                    zoneMap: buildZoneMap(scan.rawResponse), progress: (await loadSkinProgress(tx, scan)).progress,
                    aiRecommendations: ai ? { headline: 'Revision local con catalogo vigente', summary: 'Captura real; identidad omitida en esta vista de revision.', recommendations: resolveRecommendations(ai.recommendations, menu), homeCare: ai.homeCare } : null,
                });
            }
            return results;
        }, { timeout: 30000 });
    } finally { await prisma.$disconnect(); }
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        res.setHeader('Cache-Control', 'no-store');
        if (url.pathname === '/api/skin-analysis/image-proxy') {
            const image = url.searchParams.get('url');
            const permitted = new Set(reports.flatMap(r => [...r.images.map(i => i.originalUrl), ...r.scores.map(s => s.imageUrl), ...r.zoneMap.global.map(f => f.imageUrl)]));
            if (!permitted.has(image)) { res.writeHead(403).end(); return; }
            const upstream = await fetch(image, { redirect: 'error', signal: AbortSignal.timeout(12000) });
            const bytes = Buffer.from(await upstream.arrayBuffer());
            res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'image/jpeg' });
            res.end(bytes); return;
        }
        if (!live && url.pathname.endsWith('/progress')) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, data: { progress: current.progress, available: [{ id: 'previous', analyzedAt: previous.analyzedAt }], selectedId: 'previous' } })); return;
        }
        const report = reports.find(r => ['/api/skin-analysis/' + r.id, '/api/skin-analysis/public/' + r.id].includes(url.pathname));
        if (report) {
            const { rawResponse, cardId, id, ...publicData } = report;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, data: url.pathname.includes('/public/') ? publicData : report })); return;
        }
        if (url.pathname.startsWith('/api/')) { res.writeHead(404).end(); return; }
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
        res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
        res.end(await fs.readFile(file));
    } catch {
        if (!res.headersSent) res.writeHead(404);
        res.end('No disponible');
    }
}).listen(Number(process.env.PORT || 8127), '127.0.0.1', () => console.log('Preview: http://127.0.0.1:' + (process.env.PORT || 8127) + '/skin-report.html?view=' + reports[0]?.id));
