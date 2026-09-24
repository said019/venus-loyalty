import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareContext } from '../src/services/ai/skinAdvisor/context.js';
import { createOllamaProvider } from '../src/services/ai/skinAdvisor/ollamaProvider.js';
import { createOpenAIProvider } from '../src/services/ai/skinAdvisor/openaiProvider.js';
import { makeInput, makeAssessment } from './fixtures/skin-advisor.js';
import { skinAdvisorConfig } from '../src/services/ai/skinAdvisor/config.js';

test('Ollama uses its own key and consent version', () => {
  const config = skinAdvisorConfig({ SKIN_ADVISOR_PROVIDER: 'ollama', SKIN_ADVISOR_MODEL: 'qwen3.5:397b', OPENAI_API_KEY: 'not-ollama' });
  assert.equal(config.configured, false);
  assert.equal(config.consentVersion, 'venus-ollama-photos-v1');
  assert.match(config.consentText, /Ollama Cloud/);
});

const context = async () => prepareContext(await makeInput({ activation: { provider: 'ollama' }, consent: { provider: 'ollama' } }));
test('Ollama sends minimized images and validates the same report contract', async () => {
  const ctx = await context();
  const provider = createOllamaProvider({ enabled: true, apiKey: 'test', fetch: async (url, options) => {
    assert.equal(url, 'https://ollama.com/api/chat');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    assert.equal(body.messages[1].images[0], ctx.photos[0].dataBase64);
    assert.ok(!options.body.includes(ctx.record.id));
    return new Response(JSON.stringify({ done: true, message: { content: JSON.stringify(makeAssessment(ctx)) } }));
  } });
  assert.equal((await provider.generate(ctx)).professionalReview.required, true);
});
test('providers reject consent for the other provider before sending', async () => {
  const unexpected = async () => { assert.fail('must not send'); };
  const ctx = await context();
  await assert.rejects(createOpenAIProvider({ enabled: true, apiKey: 'test', fetch: unexpected }).generate(ctx), { code: 'consent_required' });
  const openai = await prepareContext(await makeInput());
  await assert.rejects(createOllamaProvider({ enabled: true, apiKey: 'test', fetch: unexpected }).generate(openai), { code: 'consent_required' });
});
test('Ollama has a hard timeout without automatic retry', async () => {
  const ctx = await context(); let calls = 0;
  const provider = createOllamaProvider({ enabled: true, apiKey: 'test', timeoutMs: 10, fetch: () => { calls++; return new Promise(() => {}); } });
  await assert.rejects(provider.generate(ctx), { code: 'timeout' });
  assert.equal(calls, 1);
});
test('Ollama accepts a single JSON fence but rejects invalid or extra narrative output', async () => {
  const ctx = await context();
  let content = '```json\n' + JSON.stringify(makeAssessment(ctx)) + '\n```';
  const provider = createOllamaProvider({ enabled: true, apiKey: 'test', fetch: async () => new Response(JSON.stringify({ done: true, message: { content } })) });
  assert.equal((await provider.generate(ctx)).professionalReview.required, true);
  content = '{}';
  await assert.rejects(provider.generate(ctx), { code: 'invalid_assessment' });
  content = 'Here is a report: ' + JSON.stringify(makeAssessment(ctx));
  await assert.rejects(provider.generate(ctx), { code: 'malformed_response' });
});
