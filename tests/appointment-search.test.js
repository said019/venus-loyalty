import test from 'node:test';
import assert from 'node:assert/strict';
import { searchAppointments } from '../src/services/appointment-search.js';

const now = new Date('2026-09-20T18:00:00Z');
function fixture(futureCount = 25, pastCount = 25) {
  const future = Array.from({ length: futureCount }, (_, i) => ({ id: `future-${i}` }));
  const past = Array.from({ length: pastCount }, (_, i) => ({ id: `past-${i}` }));
  const calls = [];
  const rows = where => where.startDateTime.gte ? future : past;
  return { calls, repo: {
    count: async ({ where }) => rows(where).length,
    findMany: async args => { calls.push(args); return rows(args.where).slice(args.skip, args.skip + args.take); }
  } };
}
test('todas pagina próximas primero y luego pasadas sin duplicar', async () => {
  const { repo } = fixture();
  const pages = [];
  for (const offset of [0, 20, 40]) pages.push(await searchAppointments(repo, { q: 'Andrea', offset }, now));
  const ids = pages.flatMap(p => p.data.map(a => a.id));
  assert.equal(ids.length, 50);
  assert.equal(new Set(ids).size, 50);
  assert.equal(ids[25], 'past-0');
  assert.equal(pages[2].hasMore, false);
});
test('filtro de pasadas ordena de más reciente a más antigua', async () => {
  const { repo, calls } = fixture();
  const result = await searchAppointments(repo, { q: 'Andrea', scope: 'past' }, now);
  assert.equal(result.total, 25);
  assert.equal(calls[0].orderBy[0].startDateTime, 'desc');
  assert.equal(calls[0].where.startDateTime.lt, now);
});
test('nombre se busca por palabras y teléfono sin separadores', async () => {
  const { repo, calls } = fixture();
  await searchAppointments(repo, { q: 'Ana López', scope: 'upcoming' }, now);
  assert.equal(calls[0].where.OR[0].AND[1].clientName.contains, 'López');
  await searchAppointments(repo, { q: '427 123 4567', scope: 'upcoming' }, now);
  assert.equal(calls[1].where.OR[1].clientPhone.contains, '4271234567');
});
test('búsqueda vacía no consulta ni devuelve todo el historial', async () => {
  const result = await searchAppointments({}, { q: ' ' }, now);
  assert.equal(result.total, 0);
  assert.deepEqual(result.data, []);
});
