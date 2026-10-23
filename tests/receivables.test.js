import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {createReceivable,changeReceivable,listReceivables} from '../src/services/receivables.js';

test('receivables: partial payments, retries, reversals and period totals', {skip:!process.env.CLINIC_TEST_DATABASE_URL}, async()=>{
 const db=new PrismaClient({datasources:{db:{url:process.env.CLINIC_TEST_DATABASE_URL}}});
 const id=randomUUID(), payment=randomUUID(), unpaid=randomUUID();
 const body={requestKey:id,clientName:'TEST Receivable',concept:'Facial',total:'800',initial:'300',method:'efectivo'};
 const first=new Date('2026-10-22T18:00:00Z'), second=new Date('2026-10-23T18:00:00Z');
 try{
  let a=await createReceivable(db,body,'test',first);
  assert.equal(a.balanceCents,50000);assert.equal(a.paidCents,30000);
  await createReceivable(db,body,'test',first);
  assert.equal(await db.sale.count({where:{id:'receivable_'+id}}),1);
  await assert.rejects(changeReceivable(db,id,{action:'pay',requestKey:randomUUID(),amount:'501',method:'efectivo',revision:0},'test',second),/supera/);
  const pay={action:'pay',requestKey:payment,amount:'500',method:'tarjeta_debito',revision:0};
  a=await changeReceivable(db,id,pay,'test',second);assert.equal(a.status,'paid');
  a=await changeReceivable(db,id,pay,'test',second);assert.equal(a.paidCents,80000);
  assert.equal(await db.sale.count({where:{id:{in:['receivable_'+id,'receivable_'+payment]}}}),2);
  const listed=await listReceivables(db,'2026-10-23','2026-10-23');
  assert.ok(listed.receivedCents>=50000);
  await assert.rejects(changeReceivable(db,id,{action:'cancel',requestKey:randomUUID(),revision:1},'test'),/Primero/);
  a=await changeReceivable(db,id,{action:'reverse',requestKey:randomUUID(),paymentId:payment,revision:1},'test');
  assert.equal(a.balanceCents,50000);assert.equal(await db.sale.count({where:{id:'receivable_'+payment}}),0);
  await assert.rejects(changeReceivable(db,id,{action:'pay',requestKey:randomUUID(),amount:'100',method:'efectivo',revision:1},'test'),/cambió/);
  a=await createReceivable(db,{...body,requestKey:unpaid,initial:0},'test');
  assert.equal(a.balanceCents,80000);assert.equal(await db.sale.count({where:{id:'receivable_'+unpaid}}),0);
  a=await changeReceivable(db,unpaid,{action:'cancel',requestKey:randomUUID(),revision:0},'test');assert.equal(a.balanceCents,0);
 }finally{
  await db.sale.deleteMany({where:{id:{in:['receivable_'+id,'receivable_'+payment,'receivable_'+unpaid]}}});
  await db.setting.deleteMany({where:{key:{in:['receivable:'+id,'receivable:'+unpaid]}}});
  await db.$disconnect();
 }
});
