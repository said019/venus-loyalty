import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('../public/' + file, import.meta.url), 'utf8');

test('both skin report views use the official Venus asset instead of a monogram', () => {
    for (const file of ['skin-report.html', 'skin-analysis.html']) {
        const html = read(file);
        assert.match(html, /class="brand-logo" src="\/assets\/logo\.png"/);
        assert.doesNotMatch(html, /class="brand-mark">VS/);
    }
});

test('photo gallery links to existing reports and import is distinct from photo upload', () => {
    const html = read('admin.html');
    const gallery = html.slice(html.indexOf('<section id="exp-sec-fotos"'), html.indexOf('id="exp-photos-grid"'));
    assert.match(gallery, /Reportes Venus Skin/);
    assert.match(gallery, /data-exp-sec=skin/);
    assert.match(html, /Importar reporte del aparato/);
    assert.match(html, /sin mediciones del analizador/);
});
