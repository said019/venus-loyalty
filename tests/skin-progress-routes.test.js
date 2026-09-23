import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadSkinProgress } from '../src/services/skinProgress.js';
import { buildZoneMap } from '../src/services/skinZones.js';
import { loadSkinMenu, resolveRecommendations } from '../src/services/ai/skinMenu.js';

function setup(previous = true) {
    const routes = new Map();
    const current = { id: 'now', cardId: 'own-card', rawResponse: {}, analyzedAt: '2026-09-22', clientName: 'Test', scores: [{ metric: 'pore', score: 75 }], images: [] };
    const prisma = { service: { findMany: async () => [] }, skinAnalysis: {
        findUnique: async q => {
            if (q.where.id !== 'now') return null;
            if (q.select) return Object.fromEntries(Object.keys(q.select).map(k => [k, current[k]]));
            return current;
        },
        findMany: async q => { assert.equal(q.where.cardId, 'own-card'); return previous ? [{ id: 'before', analyzedAt: '2026-09-01' }] : []; },
        findFirst: async q => { assert.equal(q.where.cardId, 'own-card'); return { analyzedAt: '2026-09-01', scores: [{ metric: 'pore', score: 65 }] }; },
    } };
    const router = Object.fromEntries(['get', 'post', 'delete'].map(method => [method, (path, ...handlers) => routes.set(`${method} ${path}`, handlers)]));
    const source = fs.readFileSync(new URL('../src/routes/skinAnalysis.js', import.meta.url), 'utf8').replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '').replace('export default router;', '');
    vm.runInNewContext(source, { express: { Router: () => router }, adminAuth() {}, prisma, loadSkinProgress, buildZoneMap, loadSkinMenu, resolveRecommendations, console });
    return async (route, query = {}) => {
        const res = { statusCode: 200, set() { return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } };
        await routes.get(route).at(-1)({ params: { id: 'now' }, query }, res);
        return res;
    };
}
test('admin progress defaults to previous and rejects a foreign id', async () => {
    const run = setup();
    assert.equal((await run('get /:id/progress')).body.data.progress.metrics[0].delta, 10);
    assert.equal((await run('get /:id/progress', { against: 'foreign' })).statusCode, 404);
    assert.equal((await run('get /:id/progress', { against: ['before'] })).statusCode, 400);
});
test('first scan returns null progress', async () => {
    assert.equal((await setup(false)('get /:id/progress')).body.data.progress, null);
});
test('public progress exposes values and dates without history ids or raw data', async () => {
    const res = await setup()('get /public/:id');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.progress.metrics[0].after, 75);
    const serialized = JSON.stringify(res.body);
    for (const forbidden of ['own-card', '"id":"before"', 'rawResponse', 'available', 'selectedId']) {
        assert.ok(!serialized.includes(forbidden), forbidden);
    }
    assert.equal(res.body.data.id, undefined);
});
