# Skin Owner Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the independently testable owner-only authorization boundary of the approved integration.

**Architecture:** An injected current-account lookup creates the session's `authorizeReview` callback. A separate adapter extracts only `uid` from already authenticated request context. No database connection, environment loading, routes or provider calls at import time.

**Tech Stack:** Existing ESM JavaScript and node:test.

## Coverage boundary

This plan covers authorization only. The approved larger integration still requires base reconciliation, persistent versioned attempts, authenticated routes, consent/photo access, review UI and private delivery. This helper is not a complete HTTP authentication or transaction boundary. Continue those as separate integration increments; do not claim the website's permission changed.

## Task 1: Owner-only review policy

Files: create `src/services/ai/skinAdvisor/ownerAuthorization.js`, `tests/skin-owner-authorization.test.js`; add export to `src/services/ai/skinAdvisor/index.js`.

- [x] Write failing tests for owner, other admin, missing config, role revocation, removed account, lookup failure, forged actor role, body identity ignored, invalid IDs and mutation during lookup.

Initial executable test:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerReviewAuthorizer, reviewerFromAuthenticatedRequest } from '../src/services/ai/skinAdvisor/ownerAuthorization.js';
test('only current owner admin passes', async () => {
  const check = createOwnerReviewAuthorizer({ approverId: 'owner', findAdminById: async id => ({ id, role: 'admin' }) });
  assert.equal(await check({ id: 'owner' }), true);
  assert.equal(await check({ id: 'other', role: 'admin' }), false);
  assert.deepEqual(reviewerFromAuthenticatedRequest({ admin: { uid: 'owner' }, body: { actor: { id: 'other' } } }), { id: 'owner' });
});
```

- [x] Run `node --test tests/skin-owner-authorization.test.js`; expect missing-module failure.
- [x] Implement the minimal policy below and export both functions from the barrel.

```js
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value;

export function reviewerFromAuthenticatedRequest(req) {
  const id = req?.admin?.uid;
  return validId(id) ? Object.freeze({ id }) : null;
}

export function createOwnerReviewAuthorizer({ approverId, findAdminById } = {}) {
  if (typeof findAdminById !== 'function') throw new TypeError('findAdminById is required.');
  const configured = validId(approverId);
  return async actor => {
    const id = actor?.id;
    if (!configured || !validId(id) || id !== approverId) return false;
    try {
      const account = await findAdminById(id);
      return account?.id === id && account.role === 'admin';
    } catch {
      return false;
    }
  };
}
```

- [x] Add all matrix tests plus a real `createAdvisorSession` integration test with fixture input/output and a non-network provider. Verify other admin denied, owner approved, audit actor ID correct, and current role rechecked for each approval. Fixture use must be explicit in the test; no real photo or network.
- [x] Run `node --test tests/skin-owner-authorization.test.js tests/skin-advisor.test.js tests/skin-gallery.test.js`; expect all passing. Run `git diff --check`.
- [x] Document trusted `adminAuth` prerequisite, exact ID configuration, current DB lookup on each action, fail-closed semantics, no global auth changes, and that production approval transaction must still perform final authorization/version checks.
- [x] Commit only scoped source/tests/docs after self-review. Request spec review then quality review; fix findings before marking complete.

## Resultado

Implementación en `15d192f`; revisión de especificación y calidad aprobadas. 38/38 pruebas enfocadas pasan; demostración offline sigue pendiente de revisión y no publicable. No hubo llamadas reales, migraciones ni despliegue. La integración completa sigue pendiente.
