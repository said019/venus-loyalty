import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVELOPER_PROMPT, PROMPT_VERSION } from '../src/services/ai/skinAdvisor/prompt.js';

test('live prompt explains strict zone coverage and protocol prerequisites', () => {
  assert.equal(PROMPT_VERSION, 'venus-skin-prompt-v2');
  assert.match(DEVELOPER_PROMPT, /exactly one entry for each distinct zone/);
  assert.match(DEVELOPER_PROMPT, /copied verbatim/);
  assert.match(DEVELOPER_PROMPT, /do not invent visible findings/);
});
