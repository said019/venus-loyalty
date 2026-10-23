import test from 'node:test';
import assert from 'node:assert/strict';
import { assignedCompletionOnly, assignedRequestAllowed } from '../lib/assigned-completion.js';
import { saveUsage } from '../src/services/clinicInventory.js';
const uid = 'adm_1780514118062';
test('account capability is narrow and other reception accounts are unchanged', () => {
  assert(assignedCompletionOnly({ uid }));
  assert(!assignedCompletionOnly({ uid: 'other', role: 'recepcion' }));
  assert(assignedRequestAllowed('PUT', '/api/clinic-inventory/usage/appointment'));
  assert(assignedRequestAllowed('GET', '/api/assigned-appointments'));
  for (const [method, path] of [['POST','/api/appointments/a/payment'],['PATCH','/api/appointments/a'],['PATCH','/api/appointments/a/status'],['POST','/api/clinic-inventory'],['GET','/api/clinic-inventory/usages'],['GET','/api/appointments']]) assert(!assignedRequestAllowed(method,path));
});
function fixture(assignedAdminId = uid, status = 'confirmed', stock = 10000) {
  let state = { appointment: { id:'a', assignedAdminId, status, clientName:'Test', serviceName:'Test' }, usage:null, stock, moves:0 };
  return {
    get state() { return state; },
    clinicUsage: { findUnique: async () => state.usage },
    async $transaction(fn) {
      const draft = structuredClone(state);
      const tx = {
        appointment: {
          updateMany: async ({where,data}) => {
            if (draft.appointment.assignedAdminId !== where.assignedAdminId || !where.status.in.includes(draft.appointment.status)) return {count:0};
            Object.assign(draft.appointment,data); return {count:1};
          },
          findUnique: async () => draft.appointment
        },
        clinicUsage: { findUnique: async () => draft.usage, create: async ({data}) => (draft.usage = {...data,revision:0}) },
        clinicSupply: {
          findMany: async () => [{id:'s',name:'Supply'}],
          updateMany: async ({data}) => { const delta=data.stockMilliMl.increment; if(draft.stock+delta<0)return {count:0};draft.stock+=delta;return {count:1}; },
          findUnique: async () => ({id:'s',stockMilliMl:draft.stock})
        },
        clinicStockMovement: { create: async () => { draft.moves++; } }
      };
      const result = await fn(tx); state = draft; return result;
    }
  };
}
const body = {requestKey:'test-request-0001',items:[{supplyId:'s',ml:'3'}]};
test('assigned completion records usage atomically and retries do not double deduct', async () => {
  const db=fixture();
  await saveUsage(db,'a',body,'fer',false,uid);
  await saveUsage(db,'a',body,'fer',false,uid);
  assert.equal(db.state.appointment.status,'completed');
  assert.equal(db.state.stock,7000); assert.equal(db.state.moves,1);
});
test('other assignments, cancelled appointments and insufficient inventory cannot complete', async () => {
  for (const db of [fixture('other'),fixture(uid,'cancelled'),fixture(uid,'confirmed',1000)]) {
    const before=structuredClone(db.state);
    await assert.rejects(saveUsage(db,'a',body,'fer',false,uid));
    assert.deepEqual(db.state,before);
  }
});
