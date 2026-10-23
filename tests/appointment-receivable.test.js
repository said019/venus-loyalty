import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {deferAppointmentBalance,appointmentReceivableKey,changeReceivable} from '../src/services/receivables.js';
import {paymentAppointments} from '../src/services/payment-report.js';
test('correct a paid appointment: atomic balance, audit, retry and subsequent collection', {skip:!process.env.CLINIC_TEST_DATABASE_URL},async()=>{
 const url=process.env.CLINIC_TEST_DATABASE_URL;assert(['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const db=new PrismaClient({datasources:{db:{url}}});const id=randomUUID(),saleId=randomUUID(),payId=randomUUID();
 const when=new Date('2026-10-23T18:00:00Z');
 try{
  const a=await db.appointment.create({data:{id,clientName:'TEST pendiente',clientPhone:'0000000000',serviceName:'Facial',date:'2026-10-23',time:'12:00',startDateTime:when,endDateTime:new Date(+when+3600000),status:'completed',totalPaid:2340,paymentMethod:'transferencia',discount:50,creditApplied:100,productsSold:[{name:'Crema',quantity:1,price:650}]}});
  await db.sale.create({data:{id:saleId,appointmentId:id,subtotal:2390,total:2340,totalAmount:2340,serviceAmount:1600,productsAmount:740,paymentMethod:'transferencia',date:when}});
  const body={requestKey:randomUUID(),version:a.updatedAt.toISOString(),received:'1000'};
  await assert.rejects(deferAppointmentBalance(db,id,{...body,received:'2340'},'test'),/menor/);
  await assert.rejects(deferAppointmentBalance(db,id,{...body,received:'-1'},'test'),/válido/);
  await assert.rejects(deferAppointmentBalance(db,id,{...body,version:'2000-01-01'},'test'),/cambió/);
  let account=await deferAppointmentBalance(db,id,body,'test');assert.equal(account.balanceCents,134000);
  assert.equal((await deferAppointmentBalance(db,id,body,'test')).id,account.id);
  await assert.rejects(deferAppointmentBalance(db,id,{...body,requestKey:randomUUID()},'test'),/vinculada/);
  const corrected=await db.appointment.findUnique({where:{id}});assert.equal(Number(corrected.totalPaid),1000);assert.equal(Number(corrected.creditApplied),100);assert.equal(Number(corrected.discount),50);assert.deepEqual(corrected.productsSold,a.productsSold);assert.equal(corrected.status,'completed');
  const sale=await db.sale.findUnique({where:{id:saleId}});assert.equal(Number(sale.totalAmount),1000);assert.equal(sale.date.toISOString(),when.toISOString());
  assert.equal(account.correction.before.appointment.totalPaid,'2340');assert.equal(account.correction.by,'test');
  const report=(await paymentAppointments(db,'2026-10-23T00:00:00Z','2026-10-23T23:59:59Z')).filter(r=>r.appointmentId===id);assert.equal(report.length,1);assert.equal(Number(report[0].totalPaid),1000);
  const pay={action:'pay',requestKey:payId,amount:'1340',method:'efectivo',revision:0};account=await changeReceivable(db,account.id,pay,'test');assert.equal(account.balanceCents,0);
  await changeReceivable(db,account.id,pay,'test');assert.equal(await db.sale.count({where:{id:'receivable_'+payId}}),1);
  assert.equal(Number((await db.sale.findUnique({where:{id:'receivable_'+payId}})).total)+Number(sale.total),2340);
 }finally{await db.setting.deleteMany({where:{key:appointmentReceivableKey(id)}});await db.sale.deleteMany({where:{id:{in:[saleId,'receivable_'+payId]}}});await db.appointment.deleteMany({where:{id}});await db.$disconnect();}
});
