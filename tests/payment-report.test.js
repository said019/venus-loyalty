import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentAppointments } from '../src/services/payment-report.js';
import fs from 'node:fs';
import vm from 'node:vm';
test('uses sale payment date and amount, excludes payments outside range, preserves legacy', async () => {
  let query;
  const sale = { id: 'sale', appointmentId: 'a', date: '2026-09-20T18:00:00Z', totalAmount: '200', paymentMethod: 'efectivo' };
  let n = 0;
  const db = { sale: { findMany: async q => { if (!n++) { query=q; return [sale]; } return [{appointmentId:'a'},{appointmentId:'b'}]; } },
    appointment: { findMany: async () => [{id:'a', startDateTime:'2026-08-01'}, {id:'b'}, {id:'legacy'}] } };
  const rows = await paymentAppointments(db, '2026-09-20T00:00:00-06:00', '2026-09-20T23:59:59.999-06:00');
  assert.deepEqual(rows.map(r => r.id), ['sale','legacy']);
  assert.equal(rows[0].paidAt, sale.date);
  assert.equal(rows[0].totalPaid, '200');
  assert.equal(query.where.date.lte.toISOString(), '2026-09-21T05:59:59.999Z');
});
const html=fs.readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');
function setup(fetch) {
  const nodes = { 'report-sales-day': { value:'2026-09-20' }, 'report-sales-tbody':{} };
  let renders=0;
  const c={document:{getElementById:id=>nodes[id]},fetchVentasRango:fetch,filtrarTablaReporte:()=>renders++};
  vm.createContext(c);
  vm.runInContext(html.slice(html.indexOf('    let pagosDiaData'),html.indexOf('    function filtrarTablaReporte()')),c);
  return {c,nodes,renders:()=>renders};
}
test('day picker requests selected day even outside loaded month',async()=>{
  let args;const s=setup(async(...a)=>{args=a;return []});await s.c.cargarDiaPagos();
  assert.deepEqual(args,['2026-09-20','2026-09-20']);assert.equal(s.renders(),1);
});
test('stale day request cannot overwrite latest date',async()=>{
  const pending=[];const s=setup(()=>new Promise(r=>pending.push(r)));
  const first=s.c.cargarDiaPagos();s.nodes['report-sales-day'].value='2026-09-21';
  const second=s.c.cargarDiaPagos();pending[1]([{id:'new'}]);await second;pending[0]([{id:'old'}]);await first;
  assert.equal(vm.runInContext('pagosDiaData[0].id',s.c),'new');assert.equal(s.renders(),1);
});
test('failed date query shows error rather than empty results',async()=>{
  const s=setup(async()=>{throw Error('offline')});await s.c.cargarDiaPagos();
  assert.match(s.nodes['report-sales-tbody'].innerHTML,/No se pudieron/);assert.equal(s.renders(),0);
});
test('payment day uses Mexico timezone',()=>{
  const c={Intl,Date};vm.createContext(c);
  vm.runInContext(html.slice(html.indexOf('    function claveDiaLocal'),html.indexOf('    function normTexto')),c);
  assert.equal(c.claveDiaLocal('2026-09-21T02:00:00Z'),'2026-09-20');
});
