import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Ejecuta el handler real sin inicializar la BD ni los servicios de IA.
function proxyHandler(fetch) {
    const routes = new Map();
    const router = {
        get: (path, ...handlers) => routes.set(path, handlers.at(-1)),
        post() {}, delete() {},
    };
    const source = fs.readFileSync(new URL('../src/routes/skinAnalysis.js', import.meta.url), 'utf8')
        .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
        .replace('export default router;', '');
    vm.runInNewContext(source, {
        express: { Router: () => router }, adminAuth() {}, fetch, URL, Buffer, console,
    });
    return routes.get('/image-proxy');
}

function response() {
    return {
        statusCode: 200, headers: {}, body: null,
        status(code) { this.statusCode = code; return this; },
        set(key, value) { this.headers[key] = value; return this; },
        send(body) { this.body = body; return this; },
    };
}

for (const host of ['m.yiyuan.ai', 'zm.yiyuan.ai', 'yiyuan.ai']) {
    test(`el proxy entrega los bytes de imagen de ${host}`, async () => {
        const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
        let requested;
        const handler = proxyHandler(async url => {
            requested = url;
            return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg' } });
        });
        const url = `https://${host}/test/capture.jpg`;
        const res = response();
        await handler({ query: { url } }, res);
        assert.equal(requested, url);
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['Content-Type'], 'image/jpeg');
        assert.deepEqual(res.body, bytes);
    });
}

test('el proxy sigue rechazando dominios ajenos y parecidos', async () => {
    let requests = 0;
    const handler = proxyHandler(async () => { requests++; });
    for (const url of ['https://example.com/a.jpg', 'https://m.yiyuan.ai.example.com/a.jpg', 'https://m.yiyuan.ai@example.com/a.jpg']) {
        const res = response();
        await handler({ query: { url } }, res);
        assert.equal(res.statusCode, 403);
    }
    assert.equal(requests, 0);
});

test('el proxy conserva el error cuando la captura no existe', async () => {
    const handler = proxyHandler(async () => new Response('', { status: 404 }));
    const res = response();
    await handler({ query: { url: 'https://m.yiyuan.ai/test/missing.jpg' } }, res);
    assert.equal(res.statusCode, 404);
});
