import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVELOPER_PROMPT, PROMPT_VERSION } from '../src/services/ai/skinAdvisor/prompt.js';
import { SKIN_ANALYSIS_SYSTEM_PROMPT } from '../src/services/ai/skinPrompt.js';
import fs from 'node:fs';

test('import narrative uses the live menu, exact ids and a separately cached catalog', () => {
  assert.match(SKIN_ANALYSIS_SYSTEM_PROMPT, /serviceId/);
  assert.match(SKIN_ANALYSIS_SYSTEM_PROMPT, /SOLO los servicios/);
  assert.doesNotMatch(SKIN_ANALYSIS_SYSTEM_PROMPT, /HIFU|Dermapen|Limpieza Profunda/);
  const source = fs.readFileSync(new URL('../src/services/ai/claudeNarrative.js', import.meta.url), 'utf8');
  assert.match(source, /JSON.stringify\(menu\)/);
  assert.equal((source.match(/cache_control:/g) || []).length, 2);
  assert.match(source, /validateRecommendations\(parsed.recommendations, menu\)/);
});

test('live prompt explains strict zone coverage and protocol prerequisites', () => {
  assert.equal(PROMPT_VERSION, 'venus-skin-prompt-v3');
  assert.match(DEVELOPER_PROMPT, /exactly one entry for each distinct zone/);
  assert.match(DEVELOPER_PROMPT, /copied verbatim/);
  assert.match(DEVELOPER_PROMPT, /do not invent visible findings/);
});
