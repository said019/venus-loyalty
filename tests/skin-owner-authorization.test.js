import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAdvisorSession,
  createOwnerReviewAuthorizer,
  reviewerFromAuthenticatedRequest,
} from '../src/services/ai/skinAdvisor/index.js';
import { makeAssessment, makeInput } from './fixtures/skin-advisor.js';

const invalidIds = [undefined, null, '', ' ', ' owner', 'owner ', '\towner', 42, {}, [], new String('owner'), 'x'.repeat(129)];

test('reviewer identity comes only from authenticated admin UID and is frozen', () => {
  const request = { admin: { uid: 'owner', role: 'forged' }, body: { id: 'other', uid: 'other', role: 'admin' } };
  const reviewer = reviewerFromAuthenticatedRequest(request);
  assert.deepEqual(reviewer, { id: 'owner' });
  assert.ok(Object.isFrozen(reviewer));
  request.admin.uid = 'other';
  assert.equal(reviewer.id, 'owner');
  for (const req of [undefined, null, {}, { body: { uid: 'owner' } }, { admin: { id: 'owner' } }, { user: { uid: 'owner' } }]) {
    assert.equal(reviewerFromAuthenticatedRequest(req), null);
  }
  for (const uid of invalidIds) assert.equal(reviewerFromAuthenticatedRequest({ admin: { uid } }), null);
  assert.deepEqual(reviewerFromAuthenticatedRequest({ admin: { uid: 'x'.repeat(128) } }), { id: 'x'.repeat(128) });
});

test('account lookup is required', () => {
  for (const findAdminById of [undefined, null, {}, true]) {
    assert.throws(() => createOwnerReviewAuthorizer({ approverId: 'owner', findAdminById }), TypeError);
  }
  assert.throws(() => createOwnerReviewAuthorizer(), TypeError);
});

test('only configured owner is eligible; invalid IDs and other admins never reach lookup', async () => {
  const calls = [];
  const findAdminById = async (id) => { calls.push(id); return { id, role: 'admin' }; };
  const authorize = createOwnerReviewAuthorizer({ approverId: 'owner', findAdminById });
  for (const id of [...invalidIds, 'other-admin']) assert.equal(await authorize({ id, role: 'admin' }), false);
  for (const actor of [undefined, null, {}]) assert.equal(await authorize(actor), false);
  for (const approverId of invalidIds) {
    assert.equal(await createOwnerReviewAuthorizer({ approverId, findAdminById })({ id: 'owner' }), false);
  }
  assert.deepEqual(calls, []);
  assert.equal(await authorize({ id: 'owner', role: 'not-admin', email: 'ignored' }), true);
  assert.deepEqual(calls, ['owner']);
});

test('current owner account is checked on every call and fails closed on revocation, removal, mismatch or error', async () => {
  let account = { id: 'owner', role: 'admin' };
  let calls = 0;
  const authorize = createOwnerReviewAuthorizer({ approverId: 'owner', findAdminById: async () => {
    calls += 1;
    if (account instanceof Error) throw account;
    return account;
  } });
  assert.equal(await authorize({ id: 'owner' }), true);
  for (const value of [null, undefined, {}, { id: 'owner', role: 'staff' }, { id: 'owner', role: 'Admin' }, { id: 'other', role: 'admin' }, new Error('lookup unavailable')]) {
    account = value;
    assert.equal(await authorize({ id: 'owner', role: 'admin' }), false);
  }
  assert.equal(calls, 8);
});

test('configuration and actor IDs are captured before asynchronous lookup', async () => {
  let resolveLookup;
  const options = { approverId: 'owner', findAdminById: (id) => {
    assert.equal(id, 'owner');
    return new Promise((resolve) => { resolveLookup = resolve; });
  } };
  const authorize = createOwnerReviewAuthorizer(options);
  options.approverId = 'other';
  const actor = { id: 'owner' };
  const pending = authorize(actor);
  actor.id = 'other';
  resolveLookup({ id: 'owner', role: 'admin' });
  assert.equal(await pending, true);
});

test('real session denies another admin and records owner approval with an offline fixture provider', async () => {
  const session = createAdvisorSession({
    // Test-only provider: never contacts a network or bypasses simulation protection.
    provider: { metadata: { provider: 'test-fixture' }, generate: async (context) => makeAssessment(context) },
    authorizeReview: createOwnerReviewAuthorizer({
      approverId: 'owner',
      findAdminById: async (id) => ({ id, role: 'admin' }),
    }),
  });
  await session.replaceInput(await makeInput());
  const pending = await session.generate();
  await assert.rejects(() => session.approve({ inputVersion: pending.inputVersion, actor: reviewerFromAuthenticatedRequest({ admin: { uid: 'other-admin' } }) }), { code: 'not_authorized' });
  assert.equal(session.snapshot().status, 'pending_review');
  const approved = await session.approve({ inputVersion: pending.inputVersion, actor: reviewerFromAuthenticatedRequest({ admin: { uid: 'owner' } }) });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approval.actorId, 'owner');
  assert.equal(approved.history.at(-1).approval.actorId, 'owner');
});
