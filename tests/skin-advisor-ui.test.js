import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { skinAdvisorConfig } from '../src/services/ai/skinAdvisor/config.js';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('OpenAI activation is explicit and requires a selected model and private key', () => {
  assert.equal(skinAdvisorConfig().enabled, false);
  assert.equal(skinAdvisorConfig({ OPENAI_API_KEY: 'test-only' }).configured, false);
  assert.equal(skinAdvisorConfig({ SKIN_ADVISOR_ENABLED: 'TRUE', SKIN_ADVISOR_MODEL: 'chosen', OPENAI_API_KEY: 'test-only' }).enabled, false);
  const config = skinAdvisorConfig({ SKIN_ADVISOR_ENABLED: 'true', SKIN_ADVISOR_MODEL: 'chosen', OPENAI_API_KEY: 'test-only', SKIN_ADVISOR_APPROVER_ID: 'owner' });
  assert.equal(config.enabled, true); assert.equal(config.configured, true);
  assert.equal(config.approverId, 'owner'); assert.deepEqual(config.protocols, []);
  assert.match(config.consentText, /OpenAI/);
});

test('private UI has no secret, HTML interpolation, external model call or unsupported optional operators', () => {
  const script = read('public/skin-advisor.js');
  assert.doesNotThrow(() => new vm.Script(script));
  assert.doesNotMatch(script, /innerHTML|eval\(|\?\.|\?\?|OPENAI_API_KEY|api\.openai\.com/);
  assert.match(script, /whiteLightOriginalConfirmed/);
  assert.match(script, /capturedAtConfirmed/);
  assert.match(script, /config\.canApprove/);
  assert.match(script, /row\.provenance\.simulation/);
  assert.match(script, /credentials: 'same-origin'/);
});

test('entry point preserves prior record safety and route mounts before large global parser', () => {
  const admin = read('public/admin.html');
  assert.match(admin, /skinAction\.classList\.add\('hidden'\)/);
  assert.match(admin, /skin-advisor\.html\?recordId=/);
  const server = read('server.js');
  assert.ok(server.indexOf("app.use('/api/skin-advisor'") < server.indexOf('app.use(express.json())'));
  assert.match(server, /authenticate: adminAuth/);
  assert.match(server, /SKIN_ADVISOR_ORIGIN \|\| ''/);
  assert.match(read('public/skin-advisor.html'), /id="approval-form" hidden/);
});
