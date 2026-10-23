import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');
test('report summary deducts card fee once without changing the payment',()=>{
 const start=html.indexOf('    function ingresoNetoReporte(');
 const context={normalizarMetodoPago:m=>String(m).includes('tarjeta')?'tarjeta':m};
 vm.runInNewContext(html.slice(start,html.indexOf('    function renderExcelReport',start)),context);
 const payment={totalPaid:2600,paymentMethod:'tarjeta_credito'};
 assert.equal(context.ingresoNetoReporte(payment),2470);
 assert.equal(payment.totalPaid,2600);
 assert.equal(context.ingresoNetoReporte({totalPaid:2600,paymentMethod:'efectivo'}),2600);
 assert.equal(context.ingresoNetoReporte({totalPaid:2600,paymentMethod:'transferencia'}),2600);
 assert.equal(context.ingresoNetoReporte(payment),2470);
 assert.equal((html.match(/const amount = ingresoNetoReporte\(v\);/g)||[]).length,2);
});
