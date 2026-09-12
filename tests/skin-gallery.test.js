import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/skin-gallery.js', import.meta.url), 'utf8');
const context = { window: {}, URL };
vm.runInNewContext(source, context);
const gallery = context.window.VenusSkinGallery;

test('modalities retain manufacturer provenance and unknown modes are not invented', () => {
    for (const type of ['normal', 'positive', 'negative', 'uv', 'woods']) assert.equal(gallery.classify(type), 'capture');
    for (const type of ['blue', 'brown', 'red', 'face_atriums', 'face_eyes']) assert.equal(gallery.classify(type), 'map');
    assert.equal(gallery.classify('aging_simu'), 'simulation');
    assert.equal(gallery.classify('unrecognized'), 'unknown');
});
test('all 21 report entries survive including repeated simulation types', () => {
    const input = Array.from({ length: 21 }, (_, i) => ({ imageType: i < 10 ? 'normal' : 'aging_simu', originalUrl: `https://example.com/${i}.jpg`, labelEs: `Imagen ${i}` }));
    const before = JSON.stringify(input);
    const result = gallery.normalize(input);
    assert.equal(result.length, 21);
    assert.equal(result.filter(x => x.group === 'simulation').length, 11);
    assert.equal(JSON.stringify(input), before);
    assert.equal(result[20].url, 'https://example.com/20.jpg');
});
test('unsafe and missing URLs are retained as unavailable entries, not loaded', () => {
    for (const url of ['javascript:alert(1)', 'data:image/svg+xml,x', 'http://example.com/a', 'https://user:secret@example.com/a', '//example.com/a', null]) {
        assert.equal(gallery.normalize([{ originalUrl: url }])[0].url, null);
    }
});
test('empty and malformed records have safe text defaults', () => {
    assert.equal(gallery.normalize(null).length, 0);
    const item = gallery.normalize([null])[0];
    assert.equal(item.label, 'Imagen sin etiqueta');
    assert.equal(item.group, 'unknown');
});
test('simulations and maps do not claim real clinical measurements', () => {
    assert.match(gallery.description('simulation'), /No es una fotografía.*predicción validada/);
    assert.match(gallery.description('map'), /no son mediciones nuevas/);
    assert.match(gallery.description('capture'), /no confirma que Venus pueda generar/);
});
test('gallery uses DOM text instead of HTML interpolation and no provider calls', () => {
    assert.doesNotMatch(source, /innerHTML|eval\(|fetch\(|XMLHttpRequest|\?\.|\?\?/);
    assert.match(source, /referrerPolicy = 'no-referrer'/);
});
test('report integration places images before narrative and loads component first', () => {
    for (const page of ['skin-analysis.html', 'skin-report.html']) {
        const html = readFileSync(new URL('../public/' + page, import.meta.url), 'utf8');
        assert.ok(html.indexOf('id="d-gallery"') < html.indexOf('id="d-ai-block"'));
        const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1].split('?')[0]);
        assert.ok(scripts.includes('/skin-gallery.js') && scripts.includes('/skin-analysis.js'));
        assert.ok(scripts.indexOf('/skin-gallery.js') < scripts.indexOf('/skin-analysis.js'));
        assert.equal((html.match(/id="d-gallery"/g) || []).length, 1);
    }
});
