import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');
test('Caja includes a payment for an older appointment once and keeps appointment actions',async()=>{
 const nodes={}, urls=[]; let history;
 const payment={id:'sale100',appointmentId:'appt10',date:'2026-10-10',time:'09:30',paidAt:'2026-10-13T23:46:30.284Z',status:'completed',totalPaid:'100',paymentMethod:'efectivo',clientName:'Alondra',serviceName:'Depilación Bigote'};
 const c=vm.createContext({Date,Intl,console,encodeURIComponent,cajaFechaActual:'2026-10-13',getFechaMexico:()=> '2026-10-13',document:{getElementById:id=>nodes[id]??= {}},
 apiFetch:async url=>{urls.push(url);return {ok:true,json:async()=>({success:true,data:url.includes('dateField=payment')?[payment]:url.startsWith('/api/transactions')?[{appointmentId:'appt10',totalAmount:100}]:[]})}},
 renderCitasPendientesCobro(){}, renderHistorialCaja(rows){history=rows},showNotification(){assert.fail('Unexpected loading error')}});
 vm.runInContext(html.slice(html.indexOf('    async function cargarCaja()'),html.indexOf('    function cargarCajaPorFecha(')),c);
 await c.cargarCaja();
 assert.equal(history.length,1);
 assert.equal(history[0].id,'appt10');
 assert.equal(history[0].hora,'17:46');
 assert.equal(history[0].monto,100);
 assert.equal(nodes['caja-total-general'].textContent,'$100.00');
 const query=new URL(urls[0],'https://example.test').searchParams;
 assert.equal(query.get('dateField'),'payment');
 assert.equal(query.get('from'),'2026-10-13T00:00:00-06:00');
 assert.equal(query.get('to'),'2026-10-13T23:59:59.999-06:00');
});
