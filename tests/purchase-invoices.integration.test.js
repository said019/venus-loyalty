import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {allocatePurchase,savePurchasePrices} from '../src/services/purchaseInvoices.js';
const database=process.env.CLINIC_TEST_DATABASE_URL;
test('invoice allocation is manual, precise and atomic',{skip:!database},async t=>{
 assert(['127.0.0.1','localhost'].includes(new URL(database).hostname));process.env.DATABASE_URL=database;
 const {PrismaClient}=await import('@prisma/client');const db=new PrismaClient();
 const id=randomUUID();let product,supply;
 const invoice=await db.purchaseInvoice.create({data:{id,number:'TEST',supplier:'Test supplier',issuedOn:'2026-10-20',subtotalCents:10000,discountCents:0,taxCents:1600,totalCents:11600,sourceFilename:'test.pdf',sourceHash:id,sourcePdf:Buffer.from('test'),lines:{create:{lineNumber:1,sku:'TEST',description:'Test cream in grams',quantity:3,netTotalCents:11600,volumeNote:'Confirm volume'}}},include:{lines:true}});
 const line=invoice.lines[0];
 try{
  await t.test('pricing preserves invoice cost and stock, validates amounts and allows clearing proposals',async()=>{
   const result=await savePurchasePrices(db,line.id,{listPrice:'100',retailPrice:'90',note:'Compra en expo'});
   assert.equal(result.listUnitCents,10000);assert.equal(result.retailUnitCents,9000);
   assert.equal(result.netTotalCents,11600);assert.equal(result.assignedQuantity,0);
   for(const body of [{listPrice:'1',retailPrice:'90',note:''},{listPrice:'100',retailPrice:'-1',note:''},{listPrice:'100',retailPrice:'1.234',note:''}])await assert.rejects(()=>savePurchasePrices(db,line.id,body));
   const cleared=await savePurchasePrices(db,line.id,{listPrice:'',retailPrice:'',note:''});
   assert.equal(cleared.listUnitCents,null);assert.equal(cleared.retailUnitCents,null);
  });
  await t.test('missing destination, price or ml confirmation never changes stock',async()=>{
   for(const body of [{destination:''},{destination:'sale',name:'Test cream',price:''},{destination:'clinic',name:'Test cream',bottleMl:50,volumeConfirmed:false}]){
    await assert.rejects(()=>allocatePurchase(db,line.id,{requestKey:randomUUID(),quantity:1,...body},'test'));
   }
   assert.equal((await db.purchaseInvoiceLine.findUnique({where:{id:line.id}})).assignedQuantity,0);
  });
  await t.test('repeated assignment creates one retail product and one stock entry',async()=>{
   const body={requestKey:randomUUID(),quantity:1,destination:'sale',name:'Test cream',price:'190'};
   const results=await Promise.all([allocatePurchase(db,line.id,body,'test'),allocatePurchase(db,line.id,body,'test')]);
   assert.equal(results[0].id,results[1].id);product=results[0].targetId;
   assert.equal((await db.product.findUnique({where:{id:product}})).stock,1);
  });
  await t.test('same invoice line splits into clinic ml without charging anything',async()=>{
   const result=await allocatePurchase(db,line.id,{requestKey:randomUUID(),quantity:1,destination:'clinic',name:'Test cream',bottleMl:'49.5',volumeConfirmed:true},'test');supply=result.targetId;
   assert.equal((await db.clinicSupply.findUnique({where:{id:supply}})).stockMilliMl,49500);
   assert.equal((await db.purchaseInvoiceLine.findUnique({where:{id:line.id}})).assignedQuantity,2);
  });
  await t.test('invalid target rolls back reservation and concurrent requests cannot overassign',async()=>{
   await assert.rejects(()=>allocatePurchase(db,line.id,{requestKey:randomUUID(),quantity:1,destination:'sale',targetId:'missing'},'test'));
   assert.equal((await db.purchaseInvoiceLine.findUnique({where:{id:line.id}})).assignedQuantity,2);
   const results=await Promise.allSettled([1,2].map(()=>allocatePurchase(db,line.id,{requestKey:randomUUID(),quantity:1,destination:'sale',targetId:product},'test')));
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   assert.equal((await db.product.findUnique({where:{id:product}})).stock,2);
   assert.equal((await db.purchaseInvoiceLine.findUnique({where:{id:line.id}})).assignedQuantity,3);
  });
 }finally{
  await db.purchaseAllocation.deleteMany({where:{lineId:line.id}});await db.purchaseInvoiceLine.delete({where:{id:line.id}});await db.purchaseInvoice.delete({where:{id}});
  if(product)await db.product.delete({where:{id:product}});
  if(supply){await db.clinicStockMovement.deleteMany({where:{supplyId:supply}});await db.clinicSupply.delete({where:{id:supply}});}
  await db.$disconnect();
 }
});
