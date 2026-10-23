import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('available summary excludes pending deposits until confirmed, and supports reversal',()=>{
 const elements={};const context={window:{},document:{getElementById:id=>id==='card-settlements'?null:(elements[id]||={textContent:''})}};
 const source=readFileSync(new URL('../public/js/card-settlements.js',import.meta.url),'utf8').replace(/^import .*;\n/,'').replace(/export /g,'');
 vm.createContext(context);vm.runInContext(source,context);
 vm.runInContext("range={from:'2026-10-01',to:'2026-10-31'};loaded=true;rows=[{status:'received',netCents:926962},{status:'pending',netCents:247000}];setSalesSummary(17178,14930)",context);
 assert.equal(elements['report-total-ingresos'].textContent,'$26,447.62');
 assert.equal(elements['report-bank-pending'].textContent,'$2,470.00');
 vm.runInContext("rows[1].status='received';availableSummary()",context);
 assert.equal(elements['report-total-ingresos'].textContent,'$28,917.62');
 assert.equal(elements['report-bank-pending'].textContent,'$0.00');
 vm.runInContext("rows[1].status='pending';availableSummary()",context);
 assert.equal(elements['report-total-ingresos'].textContent,'$26,447.62');
 vm.runInContext('loaded=false;availableSummary()',context);
 assert.equal(elements['report-total-ingresos'].textContent,'—');
});
