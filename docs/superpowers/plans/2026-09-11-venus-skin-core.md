# Venus Skin IA Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved independent OpenAI assessment core and an offline demonstration, without changing the live app, database or device.

**Architecture:** Pure context preparation and strict output validation surround an explicitly enabled OpenAI Responses adapter. An in-memory session owns generation versions and human review, keeping model output separate from approval. The caller will later supply authenticated ownership, consent and approved protocols; this module is not an HTTP authorization boundary.

**Tech Stack:** Existing Node 20+ ESM, native fetch/AbortController, node:test, existing sharp for bounded image decoding if needed. No new database, framework or provider dependency.

---

## Scope and file ownership

Approved specs: `../specs/2026-09-10-venus-skin-openai-design.md` and `../specs/2026-09-10-venus-skin-analysis-catalog.md`.

Work in this task's existing non-main branch. Preserve `public/admin 2.html` and all existing application files. This first module is independent of the older checkout's routes; reconciling the newer application base remains required before integration.

- `src/services/ai/skinAdvisor/catalog.js`: the 13 IDs A01–A13, patient-relative zones, permitted answer fields and version strings.
- `src/services/ai/skinAdvisor/context.js`: validate and minimize selected input, consent and image bytes; immutable snapshot and digest.
- `src/services/ai/skinAdvisor/contract.js`: strict JSON Schema, local shape and evidence/protocol-reference checks.
- `src/services/ai/skinAdvisor/prompt.js`: Spanish assessment instructions, catalog, uncertainty, data/instruction separation, no diagnoses or device actions.
- `src/services/ai/skinAdvisor/openaiProvider.js`: fixed OpenAI endpoint, explicit configuration, image+text payload, structured output, redacted failures, cancellation and no retry.
- `src/services/ai/skinAdvisor/session.js`: duplicate prevention, generation versioning, supersession, review and simulation guard.
- `src/services/ai/skinAdvisor/index.js`: public exports.
- `tests/skin-advisor.test.js`: deterministic tests with stubbed fetch/provider, no API/DB access.
- `tests/fixtures/skin-advisor.js`: fictitious context and image fixtures only.
- `scripts/demo-skin-advisor.mjs`: no-network example with an unmistakable simulation label.
- `docs/VENUS_SKIN_AI_CORE.md`: usage, tested boundaries and remaining integration work.

## Task 1: core and offline tests

- [x] Write failing tests importing the new index. Establish contracts with a minimal assertion:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, createOpenAIProvider } from '../src/services/ai/skinAdvisor/index.js';
test('the approved catalog contains exactly 13 areas', () => {
  assert.deepEqual(AREAS.map(area => area.id), Array.from({ length: 13 }, (_, i) => `A${String(i + 1).padStart(2, '0')}`));
});
test('real processing is opt-in', async () => {
  let calls = 0;
  const provider = createOpenAIProvider({ fetchImpl: async () => { calls++; } });
  await assert.rejects(() => provider.generate({}), { code: 'disabled' });
  assert.equal(calls, 0);
});
```

- [x] Run `node --test tests/skin-advisor.test.js`; first result must fail because the new module does not exist, not because production infrastructure is unavailable.
- [x] Implement the files above with these interfaces (helpers may remain private):

```js
// All inputs are application-internal, NOT trusted HTTP request bodies.
export { AREAS, ZONES, ANSWER_FIELDS } from './catalog.js';
export { prepareContext } from './context.js'; // async, returns validated snapshot
export { OUTPUT_SCHEMA, validateAssessment } from './contract.js';
export { createOpenAIProvider } from './openaiProvider.js'; // {generate(context,{signal})}
export { createAdvisorSession } from './session.js'; // {replaceInput,generate,approve,snapshot}
```

Input includes internal record reference/version; confirmed age, objective and whitelisted answers; selected image bytes with ownership, zone and capture metadata; specific OpenAI processing consent; explicitly approved protocol/service references. No unknowns become zeros or default skin types. Never fetch user image URLs. Exclude structured identity fields from outbound context and do not promise perfect PII removal from user-authored prose.

Output includes quality, observations with area/zone and source references, at most three priorities, at most five questions, missing information, educational/protocol-bound care draft, professional-review reasons and summary. Exact evidence and protocol IDs must exist in input. No model-supplied health score, confidence percentage, approval, age estimate, session count or device settings. Do not require a problem in every area. JSON validation is not a medical-content verifier.

Provider uses `https://api.openai.com/v1/responses`, explicit `enabled === true`, nonempty server key, model candidate `gpt-6-astra`, JSON Schema via `text.format`, images via data URLs. No tools or provider fallback. Successful completed output only; reject refusal, incomplete output, missing text, malformed JSON, invalid semantics, HTTP errors and timeout with generic codes. No prompts, images, keys or provider error bodies in exceptions/logs. Timeout no more than 60 seconds including response body, zero retries.

Session starts draft; generation moves to pending_review or needs_information, never approved. Replacing input invalidates old responses and approval, aborts the old attempt and preserves only version-scoped history. Duplicate calls during one generation do not make a second paid request. Approval requires an application-injected authorization check, actor reference and exact current version. Simulations cannot be approved. Errors and refusals produce explicit non-publishable states, never a stale report.

- [x] Cover missing consent/config/key, unknowns, privacy whitelist, valid/invalid images, wrong ownership, invalid fields/enums/lengths/counts, invented evidence/protocols, refusal/incomplete/HTTP/malformed output, timeout, no retries, duplicate requests, stale responses, input edits and human-review guards. Verify malicious text remains data and the provider has no tools; do not claim prompt-injection immunity.
- [x] Run `node --test tests/skin-advisor.test.js` to green; self-review all boundaries; commit only task-owned files. Core `53df6c4`, quality fixes `a9f73b1`, 25/25 tests.

## Task 2: documented offline demonstration

- [x] Implement a demo using the same public core and fictitious fixture, with a stub provider returning a validated sample. It must print `SIMULACIÓN — sin OpenAI, fotos reales ni validación clínica` and end in `pending_review`, not approved.
- [x] Run `node scripts/demo-skin-advisor.mjs`; assert the output contains the simulation label and no credentials, client identity or real image URL.
- [x] Document the exact working public calls from the completed module, how to run only these tests, opt-in real configuration, trusted upstream authorization responsibilities, versioning and limits. Clearly list UI/DB/native capture/production pilot as not implemented.

## Task 3: acceptance and handoff

- [x] Independent spec review of actual code and tests; fix concrete gaps before quality review.
- [x] Independent quality/security review; fix important findings and rerun targeted tests. Independent recheck approved after `a9f73b1`, 25/25 and demo green; no remaining important findings in this bounded review.
- [x] Run `git diff --check`, targeted tests and demo. Do not run the whole legacy suite or start the app against unknown production configuration.
- [x] Update approved spec status with first-core delivery evidence, leaving subsequent integration milestones distinct. Keep work in the feature branch, without push, merge or deployment.

Baseline note: the existing `tests/leadTime.test.js` yielded 8/9 before the new core was complete. Its future-day assertion uses an injected date while the existing utility reads today's date for that branch. Unrelated files were not changed; no merge/deployment readiness of the whole application is claimed.

Official API references verified before implementation: [vision](https://developers.openai.com/api/docs/guides/images-vision), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Model performance for skin assessment remains to be evaluated in an authorized pilot.
