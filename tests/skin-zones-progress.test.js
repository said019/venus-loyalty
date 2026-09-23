import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildZoneMap } from '../src/services/skinZones.js';
import { compareAnalyses, loadSkinProgress } from '../src/services/skinProgress.js';
import { loadSkinMenu, validateRecommendations, resolveRecommendations, SKIN_MENU_CATEGORIES } from '../src/services/ai/skinMenu.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/yiyuan-share-zonas.json', import.meta.url)));
test('real device fixture maps nine zones without inventing unilateral eye scores', () => {
    const result = buildZoneMap(fixture);
    assert.equal(result.zones.length, 9);
    const forehead = result.zones.find(z => z.key === 'frente');
    assert.equal(forehead.status, 'watch');
    assert.equal(forehead.findings[0].score, 86);
    const eye = result.zones.find(z => z.key === 'ojo_izq');
    assert.equal(eye.findings.find(f => f.metric === 'dark_circle').score, null);
    assert.equal(eye.findings.find(f => f.metric === 'wrinkle_eyecorner').shared, true);
    assert.equal(result.global.find(f => f.metric === 'acne').score, 34);
    assert.ok(!result.zones.some(z => z.findings.some(f => f.metric === 'acne')));
});
test('partial, legacy and malformed categories do not fail or imply healthy readings', () => {
    for (const value of [null, {}, { analysis: null }, { analysis: { skin_type: { category: {} }, wrinkle: { category: [null] } } }]) assert.deepEqual(buildZoneMap(value), { zones: [], global: [] });
    assert.equal(buildZoneMap({ analysis: { skin_type: { category: [{ cls: 'nose', score: null }] } } }).zones[0].status, null);
});
test('worst level controls status, not regional score', () => {
    const raw = { analysis: { skin_type: { category: [{ cls: 'forehead', level: 'severely', score: 99 }] }, wrinkle: { category: [{ cls: 'forehead', level: 'none', score: 100 }] } } };
    assert.equal(buildZoneMap(raw).zones[0].status, 'focus');
});
test('progress thresholds, missing scores, zero and ordering', () => {
    const previous = { analyzedAt: '2026-09-01', scores: ['plus', 'minus', 'same', 'zero', 'missing'].map(metric => ({ metric, score: 50 })) };
    const current = { analyzedAt: '2026-09-08', scores: [{ metric: 'plus', score: 55 }, { metric: 'minus', score: 45 }, { metric: 'same', score: 54 }, { metric: 'zero', score: 0 }, { metric: 'missing', score: null }, { metric: 'new', score: 80 }] };
    const result = compareAnalyses(current, previous);
    assert.equal(result.days, 7);
    assert.deepEqual(result.metrics.map(m => [m.metric, m.trend]), [['plus', 'mejoró'], ['same', 'estable'], ['minus', 'empeoró'], ['zero', 'empeoró']]);
    assert.equal(compareAnalyses(previous, current), null);
    assert.equal(compareAnalyses(current, null), null);
});
test('history never compares an unlinked scan or another card', async () => {
    let queried = false;
    const db = { skinAnalysis: {
        findMany: async query => { assert.equal(query.where.cardId, 'card-a'); return [{ id: 'previous', analyzedAt: '2026-09-01' }]; },
        findFirst: async query => { queried = true; assert.equal(query.where.cardId, 'card-a'); return { analyzedAt: '2026-09-01', scores: [] }; },
    } };
    assert.equal((await loadSkinProgress(db, { cardId: null }, 'foreign')).invalid, true);
    const current = { cardId: 'card-a', analyzedAt: '2026-09-08', scores: [] };
    assert.equal((await loadSkinProgress(db, current, 'foreign')).invalid, true);
    assert.equal(queried, false);
    assert.equal((await loadSkinProgress(db, current)).progress.days, 7);
});
test('menu queries only active skin categories in stable order', async () => {
    await loadSkinMenu({ service: { findMany: async query => {
        assert.equal(query.where.isActive, true);
        assert.deepEqual(query.where.category.in, SKIN_MENU_CATEGORIES);
        assert.deepEqual(query.orderBy, [{ name: 'asc' }, { id: 'asc' }]);
        return [];
    } } });
});
test('recommendations require matching id AND exact name; legacy display resolves by exact name', () => {
    const menu = [{ id: 's1', name: 'Hidratación', price: '650' }];
    let warnings = 0;
    const recs = [{ serviceId: 's1', treatment: 'Hidratación' }, { serviceId: 's1', treatment: 'Inventado' }, { treatment: 'Hidratación' }];
    assert.equal(validateRecommendations(recs, menu, { warn: () => warnings++ }).length, 1);
    assert.equal(warnings, 2);
    assert.equal(resolveRecommendations([recs[2]], menu)[0].price, 650);
    assert.equal(resolveRecommendations([{ serviceId: 'deleted', treatment: 'Hidratación' }], menu)[0].serviceId, null);
    assert.equal(resolveRecommendations(recs, [])[0].price, null);
});
