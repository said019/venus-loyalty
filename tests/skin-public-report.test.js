import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadRoutes(findUnique) {
    const routes = new Map();
    const router = Object.fromEntries(['get', 'post', 'delete'].map(method => [method,
        (path, ...handlers) => routes.set(`${method} ${path}`, handlers),
    ]));
    const adminAuth = (_req, res) => res.status(401).json({ error: 'auth_required' });
    const source = fs.readFileSync(new URL('../src/routes/skinAnalysis.js', import.meta.url), 'utf8')
        .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
        .replace('export default router;', '');
    vm.runInNewContext(source, {
        express: { Router: () => router }, adminAuth, prisma: { skinAnalysis: { findUnique } }, console,
    });
    return { routes, adminAuth };
}
function response() {
    return {
        statusCode: 200, headers: {}, body: null,
        status(code) { this.statusCode = code; return this; },
        set(key, value) { this.headers[key] = value; return this; },
        json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; },
    };
}

test('el enlace público carga solo su reporte y no devuelve datos de la tarjeta', async () => {
    let query;
    const { routes } = loadRoutes(async options => {
        query = options;
        return {
            clientName: 'Nombre del análisis', card: { name: 'Nombre de la clienta' }, overallScore: 74,
            scores: [{ labelEs: 'Hidratación', score: 35 }], images: [{ originalUrl: 'https://m.yiyuan.ai/test.jpg' }],
            aiRecommendations: { headline: 'Tu piel', summary: 'Resumen', homeCare: ['Rutina'], model: 'interno', rawResponse: 'privado' },
        };
    });
    const res = response();
    await routes.get('get /public/:id')[0]({ params: { id: 'solo-este-reporte' } }, res);
    assert.equal(query.where.id, 'solo-este-reporte');
    for (const key of ['id', 'cardId', 'clientPhone', 'yiyuanShareId', 'rawData', 'yiyuanAnalysisId']) assert.equal(query.select[key], undefined);
    assert.deepEqual(Object.keys(query.select.card.select), ['name']);
    assert.deepEqual(Object.keys(query.select.images.select).sort(), ['imageType', 'labelEs', 'originalUrl']);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.clientName, 'Nombre de la clienta');
    assert.equal(res.body.data.card, undefined);
    assert.equal(res.body.data.aiRecommendations.model, undefined);
    assert.equal(res.body.data.aiRecommendations.rawResponse, undefined);
    assert.equal(res.body.data.images.length, 1);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    assert.ok(res.headers['X-Robots-Tag'].includes('noindex'));
});

test('un enlace inexistente responde 404 sin buscar otro análisis', async () => {
    let calls = 0;
    const { routes } = loadRoutes(async () => { calls++; return null; });
    const res = response();
    await routes.get('get /public/:id')[0]({ params: { id: 'missing' } }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
    assert.equal(calls, 1);
});

test('lectura administrativa, listado y cambios siguen exigiendo sesión', async () => {
    const { routes, adminAuth } = loadRoutes(async () => { throw new Error('No debe consultar la BD sin sesión'); });
    for (const route of ['get /:id', 'get /', 'get /by-card/:cardId', 'post /import', 'post /:id/regenerate-narrative', 'delete /:id']) {
        assert.equal(routes.get(route)[0], adminAuth, `${route} debe exigir sesión`);
        const res = response();
        await routes.get(route)[0]({}, res);
        assert.equal(res.statusCode, 401);
    }
    assert.equal(routes.has('post /public/:id'), false);
    assert.equal(routes.has('delete /public/:id'), false);
});
