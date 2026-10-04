import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const oldSource = read('scripts/fixtures/mexico-time.d70c2614.js');
const newSource = read('src/utils/mexico-time.js');
const clone = value => structuredClone(value);
const timeZones = ['UTC', 'America/Mexico_City', 'America/New_York', 'Pacific/Kiritimati'];
const instant = Date.parse('2026-05-20T16:00:00Z');

async function harness(source, { now = instant, delivery = 'success', failWrite = false, failConstructor = false } = {}) {
  const clock = { now };
  let constructors = 0;
  let rejectConstructor = failConstructor;
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
    static [Symbol.hasInstance](value) { return value instanceof Date; }
  }
  const observedIntl = Object.create(Intl);
  observedIntl.DateTimeFormat = new Proxy(Intl.DateTimeFormat, {
    construct(target, args) {
      constructors++;
      if (rejectConstructor) {
        rejectConstructor = false;
        throw new RangeError('synthetic constructor failure');
      }
      return Reflect.construct(target, args);
    },
  });
  const events = [];
  const context = vm.createContext({
    Date: ClockDate, Intl: observedIntl, Map, Set, Promise,
    console: { log() {}, warn: (...args) => events.push(['warn', ...args]), error: (...args) => events.push(['error', ...args]) },
    // No real timer, network, process environment, credentials or database is exposed.
    setTimeout: callback => { callback(); return 0; },
  });
  async function module(sourceCode, imports = {}) {
    const result = new vm.SourceTextModule(sourceCode, {
      context,
      importModuleDynamically: specifier => { throw new Error('Unexpected dynamic import: ' + specifier); },
    });
    await result.link(async specifier => {
      assert.ok(Object.hasOwn(imports, specifier), 'Unexpected import: ' + specifier);
      const value = imports[specifier];
      if (value instanceof vm.Module) return value;
      const stub = new vm.SyntheticModule(Object.keys(value), function () {
        for (const [key, item] of Object.entries(value)) this.setExport(key, item);
      }, { context });
      await stub.link(() => { throw new Error('Synthetic dependency cannot import'); });
      return stub;
    });
    await result.evaluate();
    return result;
  }
  const helper = await module(source);
  const lead = await module(read('src/utils/leadTime.js'), { './mexico-time.js': helper });
  const firestore = {
    collection: name => ({
      add: async data => {
        events.push(['create', name, clone(data)]);
        if (failWrite) throw new Error('synthetic write failure');
        return { id: 'synthetic-appointment' };
      },
    }),
  };
  const models = await module(read('src/models/index.js'), {
    '../db/compat.js': { firestore },
    '../utils/mexico-time.js': helper,
  });
  const config = { venus: { location: 'Synthetic studio' }, baseUrl: 'https://example.invalid', evolution: {} };
  const whatsapp = await module(read('src/services/whatsapp-v2.js'), {
    '../config/config.js': { config },
    './whatsapp-evolution.js': {
      getEvolutionClient: () => ({
        sendText: async (...args) => {
          events.push(['sendText', ...clone(args)]);
          if (delivery === 'throw') throw new Error('synthetic transport failure');
          return delivery === 'success' ? { key: { id: 'synthetic-receipt' }, status: 'PENDING' } : null;
        },
      }),
    },
    '../db/index.js': { prisma: {} },
    '../utils/mexico-time.js': helper,
  });
  const registrations = [];
  let pending = [];
  const scheduler = await module(read('src/scheduler/cron.js'), {
    'node-cron': { default: { schedule: (pattern, callback, options) => registrations.push({ pattern, callback, options }) } },
    '../models/index.js': { AppointmentModel: {
      getPendingReminders: async (...args) => { events.push(['pending', ...clone(args)]); return pending; },
      markReminderSent: async (...args) => { events.push(['marked', ...clone(args)]); },
    } },
    '../services/whatsapp-v2.js': { WhatsAppService: whatsapp.namespace.WhatsAppService },
    '../db/index.js': { prisma: {} },
    '../db/repositories.js': { NotificationsRepo: {} },
    '../config/config.js': { config },
    '../services/pollVotes.js': { reconcilePollVotes: () => { throw new Error('Unexpected poll reconciliation'); }, normalizePhone: s => s },
  });
  scheduler.namespace.startScheduler();
  return {
    helper: helper.namespace, lead: lead.namespace, create: models.namespace.AppointmentModel.create,
    whatsapp: whatsapp.namespace, clock, events,
    constructors: () => constructors,
    schedule: () => registrations.map(({ pattern, options }) => clone({ pattern, options })),
    async reminders(rows) {
      pending = rows;
      assert.equal(registrations[4].pattern, '0 * * * *');
      assert.equal(registrations[5].pattern, '0 * * * *');
      await registrations[4].callback(); // Actual 48h grouping, delivery and success markers.
      await registrations[5].callback(); // Actual 2h selection, messages and success markers.
    },
  };
}

function outcome(fn) {
  try { return { value: clone(fn()) }; }
  catch (error) { return { error: { name: error.name, message: error.message } }; }
}
async function asyncOutcome(fn) {
  try { return { value: clone(await fn()) }; }
  catch (error) { return { error: { name: error.name, message: error.message } }; }
}
async function inTimeZones(fn) {
  const before = process.env.TZ;
  try {
    for (const tz of timeZones) {
      process.env.TZ = tz;
      await fn(tz);
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}
const appointment = {
  id: 'synthetic-a', clientName: 'Persona + prueba', clientPhone: '5550000001',
  serviceName: 'Servicio <prueba>', startDateTime: '2026-05-22T10:00:00-06:00',
  endDateTime: '2026-05-22T11:00:00-06:00', status: 'scheduled',
};
const rows = [
  appointment,
  { ...appointment, id: 'synthetic-b', startDateTime: '2026-05-22T11:00:00-06:00' },
  { ...appointment, id: 'synthetic-cancelled', clientPhone: '5550000002', status: 'cancelled' },
];

test('frozen helper is the exact deployed d70c2614 source', () => {
  assert.equal(createHash('sha256').update(oldSource).digest('hex'),
    '15ae5ddab73f6c7718386248ea4e9630cc354fa05dd2a81a9c1795070d24c1b5');
});

test('civil dates, midnight, leap day and historic DST preserve values in four process zones', async () => {
  const values = [
    undefined, null, '', false, 0, '00:00', '24:00', '2024-02-29', '2026-05-20',
    '2026-01-01T05:59:59.999Z', '2026-01-01T06:00:00.000Z',
    '2022-04-03T07:59:59Z', '2022-04-03T08:00:00Z',
    '2022-10-30T06:59:59Z', '2022-10-30T08:00:00Z',
    '2030-12-31T23:59:59-06:00', new Date('2026-05-20T06:00:00Z'),
  ];
  await inTimeZones(async () => {
    const before = await harness(oldSource), after = await harness(newSource);
    for (const name of ['formatearFechaLegible', 'formatearHora', 'extractDateAndTime']) {
      for (const value of values) assert.deepEqual(outcome(() => after.helper[name](value)), outcome(() => before.helper[name](value)));
    }
  });
});

test('invalid inputs, object coercions and exceptions remain identical', async () => {
  for (const name of ['formatearFechaLegible', 'formatearHora', 'extractDateAndTime']) {
    const before = await harness(oldSource), after = await harness(newSource);
    const factories = [
      () => 'invalid', () => new Date(NaN), () => Infinity, () => 1n, () => Symbol('date'),
      () => ({ valueOf: () => instant }), () => ({ toString: () => '2026-05-20' }),
      () => ({ valueOf() { throw new TypeError('synthetic coercion failure'); } }),
    ];
    for (const make of factories) assert.deepEqual(outcome(() => after.helper[name](make())), outcome(() => before.helper[name](make())));
  }
});

test('today and dependent calendar helpers read the moving clock, never a cached date', async () => {
  await inTimeZones(async () => {
    const before = await harness(oldSource), after = await harness(newSource);
    for (const now of ['2026-01-01T05:59:59Z', '2026-01-01T06:00:00Z', '2026-05-01T05:59:59Z', '2026-05-01T06:00:00Z']) {
      before.clock.now = after.clock.now = Date.parse(now);
      for (const name of ['todayMexicoStr', 'mxYear', 'mxMonth', 'mxDay', 'startOfMonthMexicoISO']) {
        assert.deepEqual(outcome(() => after.helper[name]()), outcome(() => before.helper[name]()));
      }
    }
  });
});

test('real lead-time caller preserves evening/day boundaries and invalid/future decisions', async () => {
  await inTimeZones(async () => {
    const before = await harness(oldSource), after = await harness(newSource);
    for (const date of ['2026-05-19', '2026-05-20', '2026-05-21', 'bad']) {
      for (const time of ['10:59', '11:00', '17:59', '18:00', '18:01', 'bad']) {
        for (const now of [instant, instant + 60_000, instant - 60_000]) {
          const args = { date, time, now: new Date(now) };
          assert.deepEqual(clone(after.lead.validateLeadTime(args)), clone(before.lead.validateLeadTime(args)));
        }
      }
    }
  });
});

test('actual AppointmentModel.create preserves full writes, defaults and rejected writes', async () => {
  for (const failWrite of [false, true]) {
    const before = await harness(oldSource, { failWrite }), after = await harness(newSource, { failWrite });
    const inputs = [
      appointment, { ...appointment, date: '2026-05-22', time: '24:00' },
      { ...appointment, date: '2026-05-22', time: undefined },
      { ...appointment, startDateTime: 'invalid' }, { ...appointment, startDateTime: null },
    ];
    for (const input of inputs) assert.deepEqual(
      await asyncOutcome(() => after.create(input)), await asyncOutcome(() => before.create(input)));
    assert.deepEqual(after.events, before.events);
  }
});

test('actual 48h/2h scheduler paths preserve windows, messages, grouping, errors and writes', async () => {
  for (const delivery of ['success', 'no-receipt', 'throw']) {
    const before = await harness(oldSource, { delivery }), after = await harness(newSource, { delivery });
    assert.deepEqual(after.schedule(), before.schedule());
    assert.equal(after.schedule().length, 16);
    for (const input of [[], rows, [{ ...appointment, startDateTime: 'invalid' }]]) {
      await before.reminders(input);
      await after.reminders(input);
    }
    assert.deepEqual(after.events, before.events);
    const sent = after.events.filter(e => e[0] === 'sendText');
    assert.equal(sent.length, 3); // Grouped 48h + two active 2h; cancelled never sent.
    const marked = after.events.filter(e => e[0] === 'marked');
    assert.equal(marked.length, delivery === 'throw' ? 0 : 4);
  }
});

test('constructor failure stays lazy and retries rather than caching a failure', async () => {
  const before = await harness(oldSource, { failConstructor: true });
  const after = await harness(newSource, { failConstructor: true });
  assert.equal(after.constructors(), 0);
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.deepEqual(outcome(() => after.helper.todayMexicoStr()), outcome(() => before.helper.todayMexicoStr()));
  }
  assert.equal(after.constructors(), 2);
});

test('100 real validation/create/scheduler iterations retain at most four fixed formatters', async () => {
  const before = await harness(oldSource), after = await harness(newSource);
  for (let i = 0; i < 100; i++) {
    for (const h of [before, after]) {
      h.lead.validateLeadTime({ date: '2026-05-20', time: '18:00', now: new Date(instant) });
      await h.create(appointment);
      await h.reminders(rows);
    }
  }
  assert.deepEqual(after.events, before.events);
  assert.equal(before.constructors(), 700);
  assert.equal(after.constructors(), 4);
});
