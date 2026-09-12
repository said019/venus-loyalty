// Run with --experimental-vm-modules. Only synthetic dependencies are linked;
// neither the application, a real database nor a messaging client is imported.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');

async function main() {
  process.env.TZ = 'UTC';
  const source = readFileSync(resolve(__dirname, '../src/scheduler/cron.js'), 'utf8');
  const registrations = [], reads = [], writes = [], sends = [], errors = [];
  const handlers = {}; let driveConfigured = false; const uploads = [];
  const model = name => new Proxy({}, { get: (_, method) => async args => {
    if (['findMany', 'findUnique', 'findFirst', 'count'].includes(method)) {
      reads.push({ name, method, args });
      if (handlers[`${name}.${method}`]) return handlers[`${name}.${method}`](args);
      return method === 'findMany' ? [] : method === 'count' ? 0 : null;
    }
    writes.push({ name, method, args }); return {};
  } });
  const prisma = new Proxy({}, { get: (_, name) => model(name) });
  const appointmentModel = {
    getPendingReminders: async () => [],
    getPendingConfirmationAlert: async () => [],
    getPendingAutoCancelation: async () => [],
    markReminderSent: async (...args) => writes.push(args),
  };
  const whatsapp = new Proxy({}, { get: (_, method) => async (...args) => {
    sends.push({ method, args }); return { success: true };
  } });
  const context = vm.createContext({ Date, Intl, Map, Set, Promise,
    console: { log() {}, warn: (...a) => errors.push(a), error: (...a) => errors.push(a) },
    setTimeout: callback => { callback(); return 0; }, process: { env: {} } });
  const modules = {
    'node-cron': { default: { schedule: (pattern, callback, options) => registrations.push({ pattern, callback, options }) } },
    '../models/index.js': { AppointmentModel: appointmentModel },
    '../services/whatsapp-v2.js': { WhatsAppService: whatsapp },
    '../db/index.js': { prisma },
    '../db/repositories.js': { NotificationsRepo: { create: async data => writes.push(data) }, ChallengesRepo: { evaluateWindows: async () => [] } },
    '../config/config.js': { config: { baseUrl: 'https://example.invalid', evolution: {} } },
    '../services/pollVotes.js': { reconcilePollVotes: async () => ({ changes: [] }), normalizePhone: s => s, decodePollUpdate: () => null, voteTimestampMs: () => 0 },
    '../services/whatsapp-evolution.js': { getEvolutionClient: () => ({ findRecentMessages: async () => [] }) },
    '../services/driveService.js': { isDriveConfigured: () => driveConfigured,
      ensureClientFolder: async () => 'synthetic-folder', uploadBuffer: async args => {
        uploads.push(args); return { id: 'synthetic-drive-file', webViewLink: 'https://example.invalid/document' };
      } },
    '../services/expedientePdf.js': { buildIntakePdf: async () => Buffer.from('synthetic-pdf'), buildConsentPdf: async () => Buffer.from('synthetic-consent') },
  };
  const linked = new Map();
  async function link(specifier) {
    assert.ok(modules[specifier], `Unexpected external import: ${specifier}`);
    if (!linked.has(specifier)) {
      const values = modules[specifier];
      const mod = new vm.SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { context });
      linked.set(specifier, mod); await mod.link(() => {}); await mod.evaluate();
    }
    return linked.get(specifier);
  }
  const mod = new vm.SourceTextModule(source, { context, importModuleDynamically: link });
  await mod.link(link); await mod.evaluate(); mod.namespace.startScheduler();
  const expected = ['0 16 * * *', '*/3 * * * *', '*/30 * * * *', '0 15-23 * * *',
    '0 * * * *', '0 * * * *', '*/10 * * * *', '*/10 * * * *', '*/10 * * * *',
    '0 * * * *', '*/30 * * * *', '0 0 * * *', '0 6 * * *', '0 7 * * 1', '0 10 * * *', '0 6 * * *'];
  assert.deepEqual(registrations.map(r => r.pattern), expected);
  for (let i = 0; i < 16; i++) assert.deepEqual(JSON.parse(JSON.stringify(registrations[i].options || {})),
    i >= 11 ? { timezone: 'America/Mexico_City' } : {});
  // Existing owner decisions: these callbacks must return before any query/send.
  for (const i of [8, 14]) await registrations[i].callback();
  assert.equal(reads.length + writes.length + sends.length + errors.length, 0);
  // Execute every actual callback with an empty synthetic fixture.
  for (const r of registrations) await r.callback();
  assert.deepEqual(errors, []); assert.equal(sends.length, 0); assert.equal(writes.length, 0);
  assert.ok(reads.length > 0);

  // Configured Drive retains pending signed form upload and both metadata writes.
  driveConfigured = true;
  handlers['intakeForm.findMany'] = () => [{ id: 'form-1', record: { id: 'record-1', cardId: 'card-1' }, signedAt: '2026-09-06T15:00:00Z' }];
  handlers['card.findUnique'] = () => ({ id: 'card-1', name: 'Synthetic', phone: '0000000000' });
  await registrations[10].callback();
  assert.equal(uploads.length, 1); assert.equal(uploads[0].folderId, 'synthetic-folder');
  assert.equal(uploads[0].mimeType, 'application/pdf');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].name, 'intakeForm'); assert.equal(writes[0].args.data.driveUploadPending, false);
  assert.equal(writes[0].args.data.pdfDriveFileId, 'synthetic-drive-file');
  assert.equal(writes[1].name, 'clientDocument'); assert.equal(writes[1].args.data.recordId, 'record-1');
  assert.equal(sends.length, 0); assert.deepEqual(errors, []);
  delete handlers['intakeForm.findMany']; delete handlers['card.findUnique'];
  writes.length = 0;

  // Confirmation callback retains its send-then-mark order for a single appointment.
  handlers['appointment.findMany'] = () => [{ id: 'appointment-1', clientPhone: '0000000000' }];
  await registrations[3].callback();
  assert.equal(sends.length, 1); assert.equal(sends[0].method, 'sendReminder24h');
  assert.equal(writes.length, 1); assert.equal(writes[0].name, 'appointment');
  assert.equal(writes[0].args.where.id, 'appointment-1'); assert.ok(writes[0].args.data.sent24hAt);
  assert.deepEqual(errors, []);
  delete handlers['appointment.findMany'];

  // A vote received before the last DB re-check must prevent an alert/cancellation.
  sends.length = 0; writes.length = 0;
  appointmentModel.getPendingConfirmationAlert = async () => [{ id: 'confirmed-1' }];
  appointmentModel.getPendingAutoCancelation = async () => [{ id: 'confirmed-1' }];
  handlers['appointment.findUnique'] = () => ({ status: 'confirmed' });
  await registrations[6].callback(); await registrations[7].callback();
  assert.equal(sends.length, 0); assert.equal(writes.length, 0); assert.deepEqual(errors, []);
  handlers['appointment.findUnique'] = () => { throw Error('synthetic database unavailable'); };
  await registrations[7].callback();
  assert.equal(sends.length, 0); assert.equal(writes.length, 0); assert.deepEqual(errors, []);
  delete handlers['appointment.findUnique'];

  const RealDate = Date; let now = RealDate.parse('2026-09-07T03:59:17Z');
  global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  const RealFormatter = Intl.DateTimeFormat; let constructors = 0;
  Intl.DateTimeFormat = new Proxy(RealFormatter, {
    construct(t, args) { constructors++; return Reflect.construct(t, args); },
    apply(t, self, args) { constructors++; return Reflect.apply(t, self, args); },
  });
  const cronPath = resolve(process.argv[2] || 'node_modules/node-cron');
  const recordBaseline = process.argv.includes('--record-baseline');
  const cron = require(cronPath), tasks = [], hash = createHash('sha256'), dailyHash = createHash('sha256'), mismatches = [];
  const cpuStart = process.cpuUsage(); let peak = process.memoryUsage().rss, cases = 0;
  function fieldMatches(field, value) {
    return field.split(',').some(part => part === '*' || (part.startsWith('*/') ? value % Number(part.slice(2)) === 0
      : part.includes('-') ? value >= Number(part.split('-')[0]) && value <= Number(part.split('-')[1]) : Number(part) === value));
  }
  function referenceNext(pattern, timezone, at) {
    const fields = pattern.split(' '), offset = timezone ? 6 * 3600000 : 0;
    for (let t = Math.floor(at / 60000) * 60000 + 60000; t <= at + 8 * 86400000; t += 60000) {
      const date = new RealDate(t - offset);
      const values = [date.getUTCMinutes(), date.getUTCHours(), date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCDay()];
      if (fields.every((field, i) => fieldMatches(field, values[i]))) return new RealDate(t).toISOString();
    }
    throw Error('No reference match');
  }
  try {
    for (const r of registrations) tasks.push(cron.schedule(r.pattern, () => { throw Error('Real timer must not execute business work'); }, r.options));
    for (const date of ['2026-09-07T05:59:17Z', '2026-09-07T13:00:00Z', '2026-12-31T23:59:59Z', '2027-01-01T06:00:00Z', '2028-02-29T05:59:59Z', '2026-09-06T23:59:59Z']) {
      now = RealDate.parse(date);
      for (const [i, task] of tasks.entries()) {
        const actual = task.getNextRun().toISOString(), expectedNext = referenceNext(expected[i], registrations[i].options?.timezone, now);
        if (recordBaseline && actual !== expectedNext) mismatches.push({ task: i, at: date, actual, expected: expectedNext });
        else assert.equal(actual, expectedNext, `${i} at ${date}`);
        cases++;
      }
    }
    for (let round = 0; round < 60; round++) {
      now = RealDate.parse('2026-09-07T03:59:17Z') + round * 3600000;
      for (const [i, task] of tasks.entries()) {
        const next = task.getNextRun().toISOString() + '\n'; hash.update(next);
        if (i !== 13) dailyHash.update(next);
      }
      peak = Math.max(peak, process.memoryUsage().rss);
      if (peak > 768 * 1048576) throw Error('Synthetic memory safety limit');
    }
    const cpu = process.cpuUsage(cpuStart);
    console.log(JSON.stringify({ node: process.version, version: require(resolve(cronPath, 'package.json')).version,
      tasks: tasks.length, emptyCallbacksPassed: 16, disabledGuardsPassed: 2, positiveDrivePassed: true, positiveConfirmationPassed: true, cancellationGuardsPassed: 3, calendarCases: cases, queries: 960,
      scheduleHash: hash.digest('hex'), nonWeeklyScheduleHash: dailyHash.digest('hex'), calendarMismatches: mismatches,
      formatterConstructions: constructors, peakRssMiB: peak / 1048576, cpuMs: (cpu.user + cpu.system) / 1000 }));
  } finally { for (const task of tasks) await task.destroy(); global.Date = RealDate; Intl.DateTimeFormat = RealFormatter; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
