import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkinClientReport } from '../src/services/skinClientReport.js';

const url = name => `https://res.cloudinary.com/demo/image/upload/${name}.jpg`;

function fixture(mutate = () => {}) {
  const cards = [{ id: 'card-a', name: 'Daniela Pérez', phone: '5551234567' }, { id: 'card-b', name: '', phone: null }];
  const records = [{ id: 'rec-a', cardId: 'card-a' }, { id: 'rec-b', cardId: 'other' }];
  const input = { answers: { secret: 'answers' }, patient: { name: 'patient' }, photos: [
    { id: 'white', zone: 'face', orientation: 'frontal', lateralityResolved: true, capturedAt: '2026-10-21T11:00:00Z', capturedAtConfirmed: true, sourceTakenAt: '2026-10-21T11:00:00Z', sourceUrl: url('white') },
  ] };
  const approved = (at, extra = {}) => ({ actorId: 'staff', approvedAt: at, inputFingerprint: 'fp', correctedAssessment: null, reviewNotes: 'private notes', plan: [{ serviceId: 's1', name: 'Hidratación', price: 850, durationMinutes: 60, cadence: 'mensual', internalNote: 'costo interno' }], homeRoutine: { morning: 'Limpiar', night: 'Crema', extra: 'x' }, nextVisitWeek: '2026-11-09', zoneProgress: { frente: 'mejoro', nariz: 'peor' }, ...extra });
  const assessment = { summary: 'Piel equilibrada', observations: [{ zone: 'frente', areaId: 'A02', description: 'Brillo leve', score: 9 }], missingInformation: ['Rutina nocturna'] };
  const row = (id, status, approval, extra = {}) => ({ id, recordId: 'rec-a', status, input: structuredClone(input), assessment, provenance: { model: 'x' }, approval, retiredAt: null, createdAt: new Date('2026-08-01T00:00:00Z'), ...extra });
  const assessments = [
    row('v1', 'superseded', approved('2026-08-12T10:00:00.000Z')),
    row('v2', 'approved', approved('2026-10-21T10:00:00.000Z', { correctedAssessment: { ...assessment, summary: 'Corregido' } })),
    row('v3', 'approved', approved('2026-10-01T10:00:00.000Z'), { retiredAt: new Date('2026-10-02T00:00:00Z') }),
    row('v4', 'draft', null),
    row('vb', 'approved', approved('2026-10-05T10:00:00.000Z'), { recordId: 'rec-b' }),
  ];
  const photos = [
    { id: 'white', recordId: 'rec-a', url: url('white'), publicId: 'p1', description: 'Skin | modo=image', takenAt: new Date('2026-10-21T11:00:00Z') },
    { id: 'uv', recordId: 'rec-a', url: url('uv'), publicId: 'p2', description: 'Skin | modo=image_uv', takenAt: new Date('2026-10-21T11:03:00Z') },
    { id: 'old', recordId: 'rec-a', url: url('old'), publicId: 'p3', description: 'Skin | modo=image', takenAt: new Date('2026-10-20T11:00:00Z') },
    { id: 'nomode', recordId: 'rec-a', url: url('nomode'), publicId: 'p4', description: 'otra', takenAt: new Date('2026-10-21T11:01:00Z') },
  ];
  const sets = [
    { id: 's1', recordId: 'rec-a', sourcePhotoId: 'white', method: 'm', notice: 'n', images: [{ key: 'poros', url: url('maps-old'), publicId: 'x', candidateCount: 5 }], createdAt: new Date('2026-10-21T11:10:00Z') },
    { id: 's2', recordId: 'rec-a', sourcePhotoId: 'white', method: 'm', notice: 'n', images: [{ key: 'poros', url: url('maps-new'), publicId: 'y', candidateCount: 7 }], createdAt: new Date('2026-10-21T11:20:00Z') },
  ];
  const imported = [
    { id: 'imp1', cardId: 'card-a', clientPhone: null, analyzedAt: new Date('2026-09-15T00:00:00Z'), overallScore: 80, skinType: 'mixta', ageBiological: 30 },
    { id: 'imp2', cardId: null, clientPhone: '5551234567', analyzedAt: new Date('2026-01-15T00:00:00Z'), overallScore: 70, skinType: 'seca', ageBiological: 31 },
    { id: 'imp3', cardId: 'zzz', clientPhone: '999', analyzedAt: new Date('2026-09-16T00:00:00Z'), overallScore: 1, skinType: 'x', ageBiological: 1 },
  ];
  const match = (r, where = {}) => Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return v.some(w => match(r, w));
    if (v && typeof v === 'object' && !(v instanceof Date) && 'in' in v) return v.in.includes(r[k]);
    return r[k] === v;
  });
  const sort = (rows, orderBy) => {
    if (!orderBy) return rows;
    const [[k, dir]] = Object.entries(orderBy);
    return [...rows].sort((a, b) => (dir === 'desc' ? -1 : 1) * (new Date(a[k]) - new Date(b[k])));
  };
  const raw = { cards, records, assessments, photos, sets, row, approved, input };
  mutate(raw);
  const prisma = {
    card: { findUnique: async ({ where }) => structuredClone(cards.find(c => c.id === where.id) || null) },
    clientRecord: { findUnique: async ({ where }) => structuredClone(records.find(r => r.cardId === where.cardId) || null) },
    skinAdvisorAssessment: {
      findUnique: async ({ where }) => structuredClone(assessments.find(a => a.id === where.id) || null),
      findMany: async ({ where, orderBy }) => structuredClone(sort(assessments.filter(a => match(a, where)), orderBy)),
    },
    skinAnalysis: { findMany: async ({ where, orderBy }) => structuredClone(sort(imported.filter(a => match(a, where)), orderBy)) },
    clientPhoto: { findMany: async ({ where, orderBy }) => structuredClone(sort(photos.filter(p => match(p, where)), orderBy)) },
    skinLayerSet: { findMany: async ({ where, orderBy }) => structuredClone(sort(sets.filter(s => match(s, where)), orderBy)) },
  };
  return createSkinClientReport({ prisma });
}

test('list merges Venus and imported reports, newest first, hiding retired and drafts', async () => {
  const svc = fixture();
  const list = await svc.listForCard('card-a');
  assert.deepEqual(list.map(i => i.kind), ['venus', 'imported', 'venus', 'imported']);
  assert.deepEqual(list.map(i => i.id), ['v2', 'imp1', 'v1', 'imp2']);
  assert.equal(list[0].href, '/mi-piel.html?card=card-a&v=v2');
  assert.equal(list[1].href, '/skin-report.html?view=imp1');
  assert.equal(list[1].overallScore, 80);
  assert.equal(await svc.listForCard('nope'), null);
  assert.equal(await svc.listForCard('bad id!'), null);
  assert.deepEqual(await svc.listForCard('card-b'), []);
});

test('detail enforces card ownership and approval', async () => {
  const svc = fixture();
  assert.equal(await svc.getForCard('card-b', 'v2'), null);
  assert.equal(await svc.getForCard('card-a', 'vb'), null);
  assert.equal(await svc.getForCard('card-a', 'v3'), null);
  assert.equal(await svc.getForCard('card-a', 'v4'), null);
  assert.equal(await svc.getForCard('card-a', 'missing'), null);
  assert.equal(await svc.getForCard('card-a', '../x'), null);
  assert.notEqual(await svc.getForCard('card-a', 'v2'), null);
});

test('detail never leaks private fields and keeps counts out', async () => {
  const d = await fixture().getForCard('card-a', 'v2');
  const json = JSON.stringify(d);
  for (const word of ['answers', 'reviewNotes', 'publicId', 'candidateCount', 'provenance', 'patient', 'inputFingerprint', 'actorId', 'score', 'private notes', 'internalNote', 'costo interno']) {
    assert.ok(!json.includes(word), word);
  }
});

test('detail adds complementary captures within ten minutes and the latest map set', async () => {
  const d = await fixture().getForCard('card-a', 'v2');
  assert.deepEqual(d.photos.map(p => p.id), ['white', 'uv']);
  assert.deepEqual(d.photos.map(p => [p.mode, p.analyzed]), [['image', true], ['image_uv', false]]);
  assert.equal(d.photos[0].takenAt, '2026-10-21T11:00:00.000Z');
  assert.equal(d.layers.white[0].url, url('maps-new'));
  assert.deepEqual(Object.keys(d.layers.white[0]).sort(), ['key', 'url']);
  assert.equal(d.layers.uv, undefined);
});

test('previous is the latest earlier approved report even if superseded', async () => {
  const svc = fixture();
  const d = await svc.getForCard('card-a', 'v2');
  assert.equal(d.previous.id, 'v1');
  assert.deepEqual(Object.keys(d.previous).sort(), ['approvedAt', 'id', 'layers', 'photos', 'zoneProgress']);
  assert.equal((await svc.getForCard('card-a', 'v1')).previous, null);
});

test('clientName is the first name and plan fields pass through', async () => {
  const d = await fixture().getForCard('card-a', 'v2');
  assert.equal(d.clientName, 'Daniela');
  assert.equal(d.summary, 'Corregido');
  assert.deepEqual(d.observations, [{ zone: 'frente', areaId: 'A02', description: 'Brillo leve' }]);
  assert.deepEqual(d.pendingToConfirm, ['Rutina nocturna']);
  assert.deepEqual(d.plan, [{ serviceId: 's1', name: 'Hidratación', price: 850, durationMinutes: 60, cadence: 'mensual' }]);
  assert.deepEqual(d.homeRoutine, { morning: 'Limpiar', night: 'Crema' });
  assert.equal(d.nextVisitWeek, '2026-11-09');
  assert.deepEqual(d.zoneProgress, { frente: 'mejoro' });
  assert.equal(d.approvedAt, '2026-10-21T10:00:00.000Z');
});

test('nested whitelist: unknown plan keys, non-numeric prices and bad progress never reach the payload', async () => {
  const svc = fixture(({ assessments }) => {
    assessments[1].approval.plan = [{ serviceId: 's1', name: 'A', price: '850', durationMinutes: 60, cadence: 'mensual', secret: 1 }, 'basura', null];
    assessments[1].approval.homeRoutine = 'texto';
    assessments[1].approval.nextVisitWeek = 6;
    assessments[1].approval.zoneProgress = ['x'];
    assessments[1].assessment = { ...assessments[1].assessment, summary: 42 };
    assessments[1].approval.correctedAssessment = null;
  });
  const d = await svc.getForCard('card-a', 'v2');
  assert.deepEqual(d.plan, [{ serviceId: 's1', name: 'A', price: null, durationMinutes: 60, cadence: 'mensual' }]);
  assert.equal(d.homeRoutine, null);
  assert.equal(d.nextVisitWeek, null);
  assert.equal(d.zoneProgress, null);
  assert.equal(d.summary, '');
  assert.ok(!JSON.stringify(d).includes('secret'));
});

test('complementary captures are capped at 24 and the ten minute window is inclusive', async () => {
  const svc = fixture(({ photos }) => {
    for (let i = 0; i < 40; i++) photos.push({ id: 'extra' + i, recordId: 'rec-a', url: url('e' + i), description: 'Skin | modo=image_uv', takenAt: new Date('2026-10-21T11:01:00Z') });
    photos.push({ id: 'edge-in', recordId: 'rec-a', url: url('in'), description: 'Skin | modo=image_uv', takenAt: new Date(Date.parse('2026-10-21T11:00:00Z') + 600000) });
    photos.push({ id: 'edge-out', recordId: 'rec-a', url: url('out'), description: 'Skin | modo=image_uv', takenAt: new Date(Date.parse('2026-10-21T11:00:00Z') + 600001) });
  });
  const d = await svc.getForCard('card-a', 'v2');
  assert.equal(d.photos.length, 24);
  const edge = fixture(({ photos }) => {
    photos.length = 0;
    photos.push({ id: 'edge-in', recordId: 'rec-a', url: url('in'), description: 'modo=image_uv', takenAt: new Date(Date.parse('2026-10-21T11:00:00Z') + 600000) });
    photos.push({ id: 'edge-out', recordId: 'rec-a', url: url('out'), description: 'modo=image_uv', takenAt: new Date(Date.parse('2026-10-21T11:00:00Z') + 600001) });
  });
  const ids = (await edge.getForCard('card-a', 'v2')).photos.map(p => p.id);
  assert.ok(ids.includes('edge-in'));
  assert.ok(!ids.includes('edge-out'));
});

test('a card with only imported reports lists those rows; an empty name gives an empty clientName', async () => {
  const svc = fixture(({ records, cards }) => { records.length = 0; cards[0].name = ''; });
  const list = await svc.listForCard('card-a');
  assert.deepEqual(list.map(i => i.id), ['imp1', 'imp2']);
  assert.equal(await svc.getForCard('card-a', 'v2'), null);
  const named = fixture(({ cards }) => { cards[0].name = ''; });
  assert.equal((await named.getForCard('card-a', 'v2')).clientName, '');
});

test('previous carries its own photos, layers and filtered zone progress', async () => {
  const svc = fixture(({ photos, sets, assessments }) => {
    assessments[0].input.photos[0].id = 'oldwhite';
    assessments[0].input.photos[0].sourceUrl = url('oldwhite');
    assessments[0].input.photos[0].sourceTakenAt = '2026-08-12T09:00:00Z';
    photos.push({ id: 'oldwhite', recordId: 'rec-a', url: url('oldwhite'), description: 'modo=image', takenAt: new Date('2026-08-12T09:00:00Z') });
    sets.push({ id: 's3', recordId: 'rec-a', sourcePhotoId: 'oldwhite', method: 'm', notice: 'n', images: [{ key: 'poros', url: url('maps-prev'), publicId: 'z', candidateCount: 3 }], createdAt: new Date('2026-08-12T09:10:00Z') });
  });
  const d = await svc.getForCard('card-a', 'v2');
  assert.deepEqual(d.previous.photos.map(p => p.id), ['oldwhite']);
  assert.equal(d.previous.layers.oldwhite[0].url, url('maps-prev'));
  assert.deepEqual(d.previous.zoneProgress, { frente: 'mejoro' });
});

test('analyzed photos without a source URL are omitted', async () => {
  const svc = fixture(({ assessments }) => { delete assessments[1].input.photos[0].sourceUrl; });
  const d = await svc.getForCard('card-a', 'v2');
  assert.ok(!d.photos.some(p => p.id === 'white' && p.analyzed));
});

test('a draft or retired row is never visible even if it has an approval object', async () => {
  const svc = fixture(({ assessments }) => { assessments[3].approval = { approvedAt: '2026-10-22T00:00:00Z' }; });
  assert.equal(await svc.getForCard('card-a', 'v4'), null);
  assert.ok(!(await svc.listForCard('card-a')).some(i => i.id === 'v4'));
});
