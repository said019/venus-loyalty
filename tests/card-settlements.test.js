import test from 'node:test';
import assert from 'node:assert/strict';
import {cardAmounts,expectedSettlement,isCard,settlementStatus} from '../public/js/card-settlement-core.js';
import {listCardSettlements,updateCardSettlements,validateRange} from '../src/services/card-settlements.js';

test('650 card charge subtracts exactly 5% without changing gross',()=>assert.deepEqual(cardAmounts(650),{grossCents:65000,feeCents:3250,netCents:61750}));
test('fee rounds to cents, rejects negative and nonnumeric',()=>{assert.deepEqual(cardAmounts('10.10'),{grossCents:1010,feeCents:51,netCents:959});for(const n of [-1,'x',Infinity])assert.throws(()=>cardAmounts(n));});
for(const [paid,expected] of [['2026-10-05','2026-10-06'],['2026-10-06','2026-10-07'],['2026-10-07','2026-10-08'],['2026-10-08','2026-10-09'],['2026-10-09','2026-10-12'],['2026-10-10','2026-10-12'],['2026-10-11','2026-10-12'],['2026-12-31','2027-01-01']])test(`${paid} settles ${expected} at noon Mexico`,()=>assert.deepEqual(expectedSettlement(`${paid}T18:00:00Z`),{expectedDate:expected,expectedAt:`${expected}T12:00:00-06:00`}));
test('late Sunday UTC is still Sunday Mexico; no premature Tuesday settlement',()=>assert.equal(expectedSettlement('2026-10-12T03:00:00Z').expectedDate,'2026-10-12'));
test('all card variants recognized but cash and transfer are excluded',()=>{for(const m of ['tarjeta','tarjeta_credito','tarjeta_debito','CARD'])assert.ok(isCard(m));for(const m of ['efectivo','transferencia',null])assert.ok(!isCard(m));});
test('passing noon never auto-confirms receipt; changed payment invalidates confirmation',()=>{
 const p={grossCents:65000,paidAt:'2026-10-05T20:00:00Z',expectedAt:'2026-10-06T12:00:00-06:00'};
 assert.equal(settlementStatus(p,null,'2026-10-06T17:59:00Z'),'pending');
 assert.equal(settlementStatus(p,null,'2026-10-06T18:00:00Z'),'verify');
 assert.equal(settlementStatus(p,{...p,confirmedAt:'2026-10-06T18:01:00Z'}),'received');
 assert.notEqual(settlementStatus(p,{...p,grossCents:60000,confirmedAt:'x'}),'received');
});
function fixture(){
 const sales=[{id:'s1',appointmentId:'a1',clientName:'Ana',totalAmount:650,paymentMethod:'tarjeta',date:new Date('2026-10-05T20:00:00Z')},
 {id:'deposit',total:100,paymentMethod:'tarjeta_debito',date:new Date('2026-10-05T21:00:00Z')},
 {id:'cash',total:500,paymentMethod:'efectivo',date:new Date('2026-10-05T21:00:00Z')}];
 const store=new Map(),queries=[];
 const db={sale:{findMany:async args=>{queries.push(args);return args.where.date?sales:[{appointmentId:'a1'},{appointmentId:'paidOutsideRange'}];}},
 coffeeSale:{findMany:async args=>{assert.equal(args.where.status.not,'cancelled');return [{id:'c1',folio:'C001',total:50,paymentMethod:'card',createdAt:new Date('2026-10-05T20:00:00Z')}];}},
 appointment:{findMany:async()=>[{id:'a1',totalPaid:650,paymentMethod:'tarjeta',startDateTime:new Date('2026-10-05')},{id:'paidOutsideRange',totalPaid:20,paymentMethod:'tarjeta',startDateTime:new Date('2026-10-05')},{id:'legacy',totalPaid:200,paymentMethod:'tarjeta',startDateTime:new Date('2026-10-05T18:00:00Z')}]},
 setting:{findMany:async()=>[...store].map(([key,value])=>({key,value})),findUnique:async({where})=>store.has(where.key)?{value:store.get(where.key)}:null,upsert:async({where,create,update})=>store.set(where.key,store.has(where.key)?update.value:create.value)},
 $transaction:async(fn,opts)=>{assert.equal(opts.isolationLevel,'Serializable');return fn(db);}};
 return {db,sales,store,queries};
}
const from='2026-10-01',to='2026-10-31';
test('ledger includes deposits and coffee, excludes cash and duplicated appointments',async()=>{
 const f=fixture(),rows=await listCardSettlements(f.db,from,to);
 assert.deepEqual(rows.map(r=>r.key).sort(),['sale:s1','sale:deposit','coffee:c1','appointment:legacy'].sort());
 assert.equal(rows.find(r=>r.key==='appointment:legacy').estimatedPaymentDate,true);
 assert.equal(rows.reduce((s,r)=>s+r.netCents,0),95000);
});
test('confirmation persists, is idempotent, and reopen preserves audit',async()=>{
 const f=fixture(),[row]=await listCardSettlements(f.db,from,to);
 const body={from,to,action:'confirm',payments:[row]};
 await updateCardSettlements(f.db,body,'owner');await updateCardSettlements(f.db,body,'owner');
 let c=[...f.store.values()][0];assert.equal(c.history.length,1);assert.equal(c.confirmedBy,'owner');
 assert.equal((await listCardSettlements(f.db,from,to)).find(r=>r.key===row.key).status,'received');
 await updateCardSettlements(f.db,{...body,action:'reopen'},'owner');c=[...f.store.values()][0];
 assert.equal(c.confirmedAt,null);assert.equal(c.history.length,2);assert.equal(c.history[1].action,'reopen');
});
test('stale amounts and missing payments cannot be confirmed',async()=>{
 const f=fixture(),rows=await listCardSettlements(f.db,from,to),row=rows.find(r=>r.key==='sale:s1');f.sales[0].totalAmount=700;
 await assert.rejects(updateCardSettlements(f.db,{from,to,action:'confirm',payments:[row]},'owner'),e=>e.status===409);
 assert.equal(f.store.size,0);
 await assert.rejects(updateCardSettlements(f.db,{from,to,action:'confirm',payments:[{...row,key:'missing'}]},'owner'),e=>e.status===409);
});
test('validates date bounds and duplicate requests',async()=>{
 for(const [a,b]of[['2026-02-30',to],[to,from],['2024-01-01',to],['',to]])assert.throws(()=>validateRange(a,b));
 const f=fixture(),[row]=await listCardSettlements(f.db,from,to);
 await assert.rejects(updateCardSettlements(f.db,{from,to,action:'confirm',payments:[row,row]},'owner'));
 assert.equal(f.store.size,0);
});

test('direct coffee ticket exposes item details and discount without changing settlement amount',async()=>{
 const f=fixture();f.sales.splice(0,f.sales.length,{id:'coffee-direct',clientName:'Venta directa',totalAmount:142,discountAmount:8,paymentMethod:'tarjeta_credito',date:new Date('2026-10-03T21:53:08.269Z'),productsSold:[{productId:'coffee:a',name:'Costa Violeta',qty:1,price:92,subtotal:92},{productId:'coffee:b',name:'Tisana de frutos rojos Frío',qty:1,price:58,subtotal:58}]});
 const row=(await listCardSettlements(f.db,from,to)).find(r=>r.key==='sale:coffee-direct');
 assert.equal(row.concept,'Venta de cafetería');assert.equal(row.items.length,2);
 assert.equal(row.items[0].name,'Costa Violeta');assert.equal(row.items[1].unitPriceCents,5800);
 assert.equal(row.discountCents,800);assert.equal(row.grossCents,14200);assert.equal(row.feeCents,710);assert.equal(row.netCents,13490);
});
test('legacy products remain visible when productsSold is empty',async()=>{
 const f=fixture();f.sales[0].productsSold=[];f.sales[0].products=[{name:'Crema',quantity:2,unitPrice:325}];
 const row=(await listCardSettlements(f.db,from,to)).find(r=>r.key==='sale:s1');
 assert.equal(row.items[0].quantity,2);assert.equal(row.items[0].totalCents,65000);
});
