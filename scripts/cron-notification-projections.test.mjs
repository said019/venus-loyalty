import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const source = read('src/scheduler/cron.js');
const fixture = JSON.parse(read('scripts/fixtures/notification-projections.54f5fb5c.json'));
const fields = {
  card: ['birthday', 'id', 'name', 'phone'],
  product: ['id', 'minStock', 'name', 'stock'],
  giftCard: ['code', 'expiresAt', 'id', 'recipientName', 'serviceName'],
};
const modelNames = { card: 'Card', product: 'Product', giftCard: 'GiftCard' };
const hash = value => createHash('sha256').update(value).digest('hex');
const copy = value => structuredClone(value);
const now = Date.parse('2026-10-04T12:00:00Z');
const day = 86_400_000;

function originalSource() {
  let restored = source;
  // Exact former function bodies, recorded before editing. Everything outside
  // these three functions remains the real scheduler, including hourly order.
  for (const value of Object.values(fixture.fragments)) {
    const start = restored.indexOf(value.start);
    const end = value.end ? restored.indexOf(value.end, start) : restored.length;
    assert.ok(start >= 0 && end > start);
    restored = restored.slice(0, start) + value.source + restored.slice(end);
  }
  return restored;
}
function data() {
  const card = (id, birthday, extra = {}) => ({
    id, birthday, name: id, phone: 'synthetic-' + id, status: 'active',
    email: id + '@example.invalid', latestMessage: 'unused fixture field',
    stamps: 3, walletPassUrl: 'https://example.invalid/pass', ...extra,
  });
  const product = (id, stock, minStock) => ({
    id, name: id, stock, minStock, description: 'unused fixture field',
    category: 'fixture', price: '100.00', cost: '50.00',
  });
  const gift = (id, expiresAt, extra = {}) => ({
    id, code: id, serviceName: 'Service ' + id, recipientName: null,
    status: 'pending', expiresAt: new Date(expiresAt),
    purchaserPhone: 'synthetic-phone', message: 'unused fixture field',
    amount: '100.00', remainingAmount: '100.00', ...extra,
  });
  return {
    card: [card('in-seven', '10-11'), card('today', '10-04'), card('no-birthday', null),
      card('yesterday', '10-03'), card('in-eight', '10-12'),
      card('inactive', '10-04', { status: 'inactive' }), card('malformed-date', 'invalid')],
    product: [product('default-five', 3, 0), product('at-min', 5, 5), product('empty', 0, 5),
      product('negative', -1, 5), product('above-min', 6, 5)],
    giftCard: [gift('upper', now + 7 * day), gift('lower', now),
      gift('too-late', now + 7 * day + 1), gift('expired', now - 1),
      gift('not-pending', now + day, { status: 'used' })],
    event: [],
  };
}
async function harness(code, { rows = data(), instant = now, existing = [], failAt = null } = {}) {
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
  }
  const trace = [], selections = [], accesses = Object.fromEntries(Object.keys(fields).map(k => [k, new Set()]));
  const notifications = new Set(existing);
  const marker = new Error('synthetic database failure');
  const fail = stage => { if (failAt === stage) throw marker; };
  const filter = (model, input, args) => input.filter(row => {
    if (model === 'card') return row.status === args.where.status;
    if (model === 'giftCard') return row.status === args.where.status &&
      row.expiresAt >= args.where.expiresAt.gte && row.expiresAt <= args.where.expiresAt.lte;
    return true;
  });
  const prisma = Object.fromEntries(['card', 'product', 'giftCard', 'event'].map(model => [model, {
    async findMany(args) {
      const parameters = copy(args ?? {});
      selections.push({ model, args: copy(parameters) });
      delete parameters.select; // The sole intentional query difference.
      trace.push(['query', model, parameters]);
      fail(model + '.findMany');
      const matched = filter(model, rows[model], args ?? {});
      trace.push(['returnedIds', model, matched.map(row => row.id)]);
      return matched.map(row => {
        const projected = args?.select
          ? Object.fromEntries(Object.keys(args.select).map(key => [key, row[key]]))
          : { ...row };
        if (!fields[model]) return projected;
        return new Proxy(projected, {
          get(target, key) {
            if (typeof key === 'string') {
              accesses[model].add(key);
              if (args?.select) assert.ok(Object.hasOwn(args.select, key),
                'Consumer read a field missing from select: ' + model + '.' + key);
            }
            return target[key];
          },
        });
      });
    },
  }]));
  prisma.notification = { async findFirst(args) {
    trace.push(['notification.findFirst', copy(args)]);
    fail(args.where.type + '.findFirst');
    return notifications.has(args.where.type) ? { id: 'synthetic-existing' } : null;
  } };
  const registrations = [];
  const context = vm.createContext({
    Date: ClockDate, Intl, Map, Set, Promise,
    console: {
      log: (...args) => trace.push(['log', ...args]),
      warn: (...args) => trace.push(['warn', ...args]),
      error: (label, error) => trace.push(['error', label, error.name, error.message, error === marker]),
    },
  });
  const dependencies = {
    'node-cron': { default: { schedule: (pattern, callback, options) => registrations.push({ pattern, callback, options }) } },
    '../models/index.js': { AppointmentModel: {} },
    '../services/whatsapp-v2.js': { WhatsAppService: new Proxy({}, { get() { throw new Error('Messaging is forbidden in this fixture'); } }) },
    '../db/index.js': { prisma },
    '../db/repositories.js': { NotificationsRepo: { async create(value) {
      trace.push(['notification.create', copy(value)]);
      fail(value.type + '.create');
      notifications.add(value.type);
      return { id: 'synthetic-created' };
    } } },
    '../config/config.js': { config: {} },
    '../services/pollVotes.js': { reconcilePollVotes() { throw new Error('Unexpected poll'); }, normalizePhone: s => s },
  };
  const mod = new vm.SourceTextModule(code, {
    context, importModuleDynamically: name => { throw new Error('Unexpected dynamic import: ' + name); },
  });
  await mod.link(async name => {
    assert.ok(Object.hasOwn(dependencies, name), 'Unexpected dependency ' + name);
    const values = dependencies[name];
    const stub = new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
    await stub.link(() => { throw new Error('Unexpected synthetic dependency'); });
    return stub;
  });
  await mod.evaluate();
  mod.namespace.startScheduler();
  trace.length = 0;
  assert.equal(registrations.length, 16);
  assert.equal(registrations[9].pattern, '0 * * * *');
  return { trace, selections, accesses, run: () => registrations[9].callback() };
}
async function compare(options, repeats = 1) {
  const before = await harness(originalSource(), options);
  const after = await harness(source, options);
  for (let n = 0; n < repeats; n++) {
    await before.run();
    await after.run();
  }
  assert.deepEqual(after.trace, before.trace);
  return { before, after };
}

test('three frozen functions reconstruct the byte-exact deployed scheduler; other functions unchanged', () => {
  assert.equal(fixture.baseSHA, '54f5fb5c86c850288e6d865ff6259556d6c3448b');
  assert.equal(fixture.wholeSourceSHA256, 'f160cab371860648f12693769cb88aa8cf65564008eb304d6e45feaa0ee4dc17');
  for (const value of Object.values(fixture.fragments)) assert.equal(hash(value.source), value.sha256);
  assert.equal(hash(originalSource()), fixture.wholeSourceSHA256);
});

test('selects contain every observed consumer field and only real scalar Prisma fields', async () => {
  const { before, after } = await compare();
  const schema = read('prisma/schema.prisma');
  for (const [model, expected] of Object.entries(fields)) {
    assert.deepEqual([...before.accesses[model]].sort(), expected);
    assert.deepEqual([...after.accesses[model]].sort(), expected);
    const query = after.selections.find(entry => entry.model === model).args;
    assert.deepEqual(Object.keys(query.select).sort(), expected);
    assert.ok(Object.values(query.select).every(value => value === true));
    assert.equal(query.take, undefined);
    assert.equal(query.orderBy, undefined);
    const block = schema.split('model ' + modelNames[model] + ' {')[1].split('\n}')[0];
    for (const field of expected) assert.match(block,
      new RegExp('^\\s*' + field + '\\s+(String|Int|DateTime|Decimal)\\??(?:\\s|$)', 'm'));
  }
  // The unrelated completed-card query still selects exactly what it did before.
  assert.deepEqual(after.selections.find(r => r.model === 'event'), before.selections.find(r => r.model === 'event'));
});

test('hourly order, qualifying rows, stock fallback and inclusive gift bounds are preserved', async () => {
  const previous = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const { after } = await compare();
    assert.deepEqual(after.trace.filter(e => e[0] === 'query').map(e => e[1]), ['card', 'event', 'product', 'giftCard']);
    const created = after.trace.filter(e => e[0] === 'notification.create').map(e => e[1]);
    assert.equal(created.length, 3);
    assert.match(created[0].message, /^in-seven \(en 7 días\), today \(en 0 días\)$/);
    assert.equal(created[1].message, 'default-five (3 unidades), at-min (5 unidades)');
    assert.equal(created[2].message, 'upper - Service upper (7 días), lower - Service lower (0 días)');
    const reversed = data();
    for (const values of Object.values(reversed)) values.reverse();
    await compare({ rows: reversed });
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test('empty fixtures make the same four reads and no notification lookup or write', async () => {
  const { after } = await compare({ rows: { card: [], product: [], giftCard: [], event: [] } });
  assert.equal(after.selections.length, 4);
  assert.equal(after.trace.some(e => e[0].startsWith('notification.')), false);
});

test('existing and newly created daily notifications preserve deduplication and row reads', async () => {
  const once = await compare({ existing: ['cumpleaños', 'stock', 'giftcard'] });
  assert.equal(once.after.trace.some(e => e[0] === 'notification.create'), false);
  const twice = await compare({}, 2);
  assert.equal(twice.after.trace.filter(e => e[0] === 'notification.create').length, 3);
  assert.equal(twice.after.selections.length, 8); // No skipped work or hidden new query.
});

test('read, dedupe lookup and notification write errors retain catches and later-job sequence', async () => {
  for (const failAt of ['card.findMany', 'product.findMany', 'giftCard.findMany',
    'cumpleaños.findFirst', 'stock.findFirst', 'giftcard.findFirst',
    'cumpleaños.create', 'stock.create', 'giftcard.create']) {
    const { after } = await compare({ failAt });
    const errors = after.trace.filter(e => e[0] === 'error');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].at(-1), true); // Original thrown error reaches the same catch.
    assert.deepEqual(after.trace.filter(e => e[0] === 'query').map(e => e[1]), ['card', 'event', 'product', 'giftCard']);
  }
});

test('malformed birthday retains its caught error instead of changing subsequent jobs', async () => {
  const rows = data();
  rows.card = [{ ...rows.card[0], birthday: 42 }];
  const { after } = await compare({ rows });
  assert.equal(after.trace.filter(e => e[0] === 'error').length, 1);
  assert.equal(after.trace.some(e => e[0] === 'notification.create' && e[1].type === 'cumpleaños'), false);
  assert.equal(after.trace.filter(e => e[0] === 'notification.create').length, 2);
});

test('existing calendar and deduplication boundaries remain equivalent across four process zones', async () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/Mexico_City', 'America/New_York', 'Pacific/Kiritimati']) {
      process.env.TZ = zone;
      for (const value of ['2022-04-03T07:59:59Z', '2022-04-03T08:00:00Z',
        '2026-10-04T05:59:59Z', '2026-10-04T06:00:00Z', '2026-12-31T23:59:59Z', '2027-01-01T00:00:00Z']) {
        await compare({ instant: Date.parse(value) });
      }
    }
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});
