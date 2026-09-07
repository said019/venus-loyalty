import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { google as previous } from 'googleapis';
import { google as scoped } from '../src/services/googleApis.js';

test('scoped SDK uses identical authentication constructors and OAuth URLs', () => {
  for (const name of ['OAuth2', 'GoogleAuth', 'JWT']) assert.equal(scoped.auth[name], previous.auth[name]);
  const clients = [previous, scoped].map(g => new g.auth.OAuth2('test-id', 'test-secret', 'http://localhost/callback'));
  for (const client of clients) client.setCredentials({ access_token: 'synthetic', expiry_date: 9999999999999 });
  const options = { access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/drive'], state: 'synthetic-state' };
  assert.equal(clients[0].generateAuthUrl(options), clients[1].generateAuthUrl(options));
  assert.deepEqual(clients[0].credentials, clients[1].credentials);
  let refreshes = 0;
  clients[1].on('tokens', () => refreshes++);
  clients[1].emit('tokens', { access_token: 'refreshed-synthetic' });
  assert.equal(refreshes, 1);
  assert.deepEqual(new scoped.auth.GoogleAuth({ scopes: options.scope }).scopes,
    new previous.auth.GoogleAuth({ scopes: options.scope }).scopes);
});

async function requests(g) {
  const calls = [];
  const auth = { request: async options => {
    calls.push({ url: String(options.url), method: options.method, params: options.params,
      data: options.data, headers: options.headers, timeout: options.timeout });
    return { status: 200, data: { id: 'synthetic-id', files: [] } };
  } };
  const cal = g.calendar({ version: 'v3', auth, timeout: 4321 });
  await cal.events.list({ calendarId: 'synthetic@example.test', timeMin: '2026-01-01T00:00:00Z', singleEvents: true });
  await cal.events.insert({ calendarId: 'synthetic@example.test', sendUpdates: 'all', requestBody: { summary: 'Synthetic', start: { dateTime: '2026-01-01T10:00:00Z' }, end: { dateTime: '2026-01-01T11:00:00Z' } } });
  await cal.events.patch({ calendarId: 'synthetic@example.test', eventId: 'synthetic-event', requestBody: { summary: 'Updated synthetic' } });
  await cal.events.delete({ calendarId: 'synthetic@example.test', eventId: 'synthetic-event' });
  await g.calendar('v3').calendarList.list({ auth });
  const drive = g.drive({ version: 'v3', auth });
  await drive.files.list({ q: "'synthetic-folder' in parents and trashed=false", fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true });
  await drive.files.create({ requestBody: { name: 'Synthetic folder', mimeType: 'application/vnd.google-apps.folder', parents: ['synthetic-root'] }, fields: 'id', supportsAllDrives: true });
  await g.oauth2({ version: 'v2', auth }).userinfo.get();
  const wallet = g.walletobjects({ version: 'v1', auth });
  await wallet.loyaltyobject.get({ resourceId: 'synthetic.object' });
  await wallet.loyaltyobject.insert({ requestBody: { id: 'synthetic.object', classId: 'synthetic.class', state: 'ACTIVE' } });
  await wallet.loyaltyobject.patch({ resourceId: 'synthetic.object', requestBody: { state: 'ACTIVE' } });
  await new Promise((resolve, reject) => drive.files.list({ pageSize: 1 }, (error, result) => {
    if (error) return reject(error);
    assert.equal(result.status, 200); resolve();
  }));
  return calls;
}

test('12 intercepted Calendar, Drive, OAuth and Wallet requests preserve contracts', async () => {
  // The fake authentication transport intercepts every request before any network I/O.
  const a = await requests(previous), b = await requests(scoped);
  assert.equal(b.length, 12);
  assert.deepEqual(b, a);
});

test('scoped SDK preserves API validation and version rejection', async () => {
  for (const g of [previous, scoped]) {
    assert.throws(() => g.calendar('unsupported-version'));
    await assert.rejects(g.calendar('v3').events.get({}), /Missing required parameters/);
  }
});

test('fresh process does not load unrelated API catalogue', () => {
  const source = `import {createRequire} from 'node:module';
    import './src/services/googleApis.js';
    const require=createRequire(import.meta.url);
    console.log(JSON.stringify(Object.keys(require.cache).filter(p=>p.includes('/googleapis/build/src/apis/')).map(p=>p.split('/apis/')[1].split('/')[0])));`;
  const loaded = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8' }));
  assert.deepEqual([...new Set(loaded)].sort(), ['calendar', 'drive', 'oauth2', 'walletobjects']);
});

test('all six production integration modules use the scoped SDK', async () => {
  for (const name of ['calendar', 'googleCalendarService', 'googleCalendarOAuth', 'adminGoogleCalendar', 'googleWallet', 'driveService']) {
    const source = await readFile(new URL(`../src/services/${name}.js`, import.meta.url), 'utf8');
    assert.ok(source.includes("import { google } from './googleApis.js';"));
    assert.ok(!source.includes("from 'googleapis'"));
  }
});
