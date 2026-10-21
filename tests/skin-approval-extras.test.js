import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApprovalExtras } from '../src/services/ai/skinAdvisor/approvalExtras.js';
const services = [{ id: 's1', name: 'Hidratación profunda', price: 850, durationMinutes: 60 }];
const zones = ['forehead', 'nose'];
test('plan snapshots the service and price as a number', () => {
  const out = normalizeApprovalExtras({ plan: [{ serviceId: 's1', cadence: 'cada_3_semanas' }] }, { services, zones });
  assert.deepEqual(out.plan, [{ serviceId: 's1', name: 'Hidratación profunda', price: 850, durationMinutes: 60, cadence: 'cada_3_semanas' }]);
  assert.equal(out.homeRoutine, null); assert.equal(out.nextVisitWeek, null); assert.deepEqual(out.zoneProgress, {});
});
test('rejects unknown services, bad cadence, long text, bad dates and foreign zones', () => {
  for (const extras of [
    { plan: [{ serviceId: 'nope', cadence: 'mensual' }] },
    { plan: [{ serviceId: 's1', cadence: 'diaria' }] },
    { plan: Array(7).fill({ serviceId: 's1', cadence: 'mensual' }) },
    { plan: [{ serviceId: 's1', cadence: 'mensual', extra: 1 }] },
    { homeRoutine: { morning: 'x'.repeat(601), night: '' } },
    { homeRoutine: { morning: 'a', night: 'b', extra: 'c' } },
    { nextVisitWeek: '2026-13-01' },
    { nextVisitWeek: '2026-02-30' },
    { nextVisitWeek: '11/11/2026' },
    { zoneProgress: { chin: 'mejoro' } },
    { zoneProgress: { nose: 'peor' } },
  ]) assert.throws(() => normalizeApprovalExtras(extras, { services, zones }), /invalid_review/);
});
test('accepts a full set and trims text', () => {
  const out = normalizeApprovalExtras({ homeRoutine: { morning: ' Limpiador \n', night: 'Crema' }, nextVisitWeek: '2026-11-09', zoneProgress: { nose: 'se_mantiene' } }, { services, zones });
  assert.deepEqual(out.homeRoutine, { morning: 'Limpiador', night: 'Crema' });
  assert.equal(out.nextVisitWeek, '2026-11-09');
});
test('empty routine becomes null and Decimal-like prices convert', () => {
  const out = normalizeApprovalExtras({ homeRoutine: { morning: ' ', night: '' }, plan: [{ serviceId: 's1', cadence: 'unica' }] }, { services: [{ ...services[0], price: { toString: () => '850.00' } }], zones });
  assert.equal(out.homeRoutine, null);
  assert.equal(out.plan[0].price, 850);
});
