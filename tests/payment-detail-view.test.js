import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context={window:{}};
vm.runInNewContext(readFileSync(new URL('../public/js/payment-detail-view.js',import.meta.url),'utf8'),context);
const render=context.window.paymentDetailView.render;
test('legacy quantity displays correctly and explains missing service amount',()=>{
 const html=render({clientName:'Clienta',totalPaid:'2600',productsSold:[{name:'Bio Oxi',quantity:1,price:550,subtotal:550},{name:'Gel',quantity:1,price:750,subtotal:750},{name:'Crema',qty:1,price:600,subtotal:600}]});
 assert(!html.includes('undefined'));assert(!html.includes('NaN'));
 assert.match(html,/700\.00/);assert.match(html,/1,900\.00/);assert.match(html,/2,600\.00/);
 assert.match(html,/se calcula por diferencia/);assert.match(html,/Fecha de pago no registrada/);
});
test('explicit zero service is preserved; discounts and credit are shown separately',()=>{
 const html=render({serviceAmount:0,totalPaid:50,discount:10,creditApplied:40,productsSold:[{name:'x',qty:2,price:50,subtotal:100}]});
 assert(!html.includes('se calcula por diferencia'));assert.match(html,/Apartado aplicado/);assert.match(html,/Descuento/);
});
test('missing amounts never become NaN or false zero; names are escaped',()=>{
 const html=render({clientName:'<img src=x>',productsSold:[{name:'<script>',price:null}]});
 assert(!html.includes('<img'));assert(!html.includes('<script>'));assert(!html.includes('NaN'));
 assert.match(html,/No registrado/);assert(!html.includes('se calcula por diferencia'));
});
