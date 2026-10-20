import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const database = process.env.CLINIC_TEST_DATABASE_URL;

test('clinic inventory API with isolated PostgreSQL', { skip: !database }, async t => {
  const u = new URL(database);
  assert(['127.0.0.1','localhost'].includes(u.hostname),'Integration tests only run on a local database');
  process.env.DATABASE_URL = database;
  process.env.ADMIN_JWT_SECRET = 'local-inventory-tests-only';
  const [{default:express},{default:cookieParser},{default:jwt},{default:router},{prisma}] = await Promise.all([import('express'),import('cookie-parser'),import('jsonwebtoken'),import('../src/routes/clinicInventory.js'),import('../src/db/index.js')]);
  const app = express(); app.use(express.json(),cookieParser()); app.use('/api/clinic-inventory',router);
  const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}/api/clinic-inventory`;
  const token=role=>jwt.sign({uid:'test',email:'inventory-test',role},process.env.ADMIN_JWT_SECRET);
  const call=async(path='',method='GET',body,role='admin')=>{
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',cookie:role?`adm=${token(role)}`:''},body:body?JSON.stringify(body):undefined});
    return {status:r.status,...await r.json()};
  };
  let supply,other,appointment,retail;
  try {
    await t.test('authorization prevents public and marketing access',async()=>{
      assert.equal((await call('','GET',null,null)).status,401);
      assert.equal((await call('','GET',null,'marketing')).status,403);
      assert.equal((await call('','POST',{},'recepcion')).status,403);
    });
    await t.test('create initial ml and retry without duplicating product',async()=>{
      const body={name:'Test gel',bottleMl:'250',stockMl:'250',minMl:'25',requestKey:randomUUID()};
      const r=await call('','POST',body);assert.equal(r.success,true);supply=r.data;
      assert.equal(supply.stockMilliMl,250000);
      assert.equal((await call('','POST',body)).data.id,supply.id);
      other=(await call('','POST',{...body,name:'Test serum',stockMl:'1',requestKey:randomUUID()})).data;
      appointment=await prisma.appointment.create({data:{clientName:'Inventory test',clientPhone:'test',serviceName:'Test service',date:'2026-10-20',time:'10:00',startDateTime:new Date(),endDateTime:new Date(),status:'completed'}});
    });
    let saved;
    await t.test('fractional usage and duplicate requests deduct exactly once',async()=>{
      const body={revision:0,requestKey:randomUUID(),items:[{supplyId:supply.id,ml:'3.5'}]};
      const results=await Promise.all([call('/usage/'+appointment.id,'PUT',body),call('/usage/'+appointment.id,'PUT',body)]);
      assert(results.every(r=>r.success));saved=results[0].data;
      assert.equal((await prisma.clinicSupply.findUnique({where:{id:supply.id}})).stockMilliMl,246500);
      assert.equal(await prisma.clinicStockMovement.count({where:{appointmentId:appointment.id}}),1);
    });
    await t.test('correction returns only the difference and requires admin',async()=>{
      const body={revision:saved.revision,requestKey:randomUUID(),items:[{supplyId:supply.id,ml:'2'}],note:'Correct dose'};
      assert.equal((await call('/usage/'+appointment.id,'PUT',body,'recepcion')).status,403);
      const r=await call('/usage/'+appointment.id,'PUT',body);assert(r.success);saved=r.data;
      assert.equal((await prisma.clinicSupply.findUnique({where:{id:supply.id}})).stockMilliMl,248000);
      assert.equal((await call('/usage/'+appointment.id,'PUT',{...body,requestKey:randomUUID()})).status,409);
    });
    await t.test('insufficient second product rolls back whole usage and stock',async()=>{
      const r=await call('/usage/'+appointment.id,'PUT',{revision:saved.revision,requestKey:randomUUID(),items:[{supplyId:supply.id,ml:5},{supplyId:other.id,ml:2}]});
      assert.equal(r.status,409);
      assert.equal((await prisma.clinicSupply.findUnique({where:{id:supply.id}})).stockMilliMl,248000);
      assert.equal((await prisma.clinicUsage.findUnique({where:{appointmentId:appointment.id}})).revision,saved.revision);
    });
    await t.test('retail transfer atomically converts units to ml, retries once',async()=>{
      retail=await prisma.product.create({data:{name:'Test retail gel',price:100,stock:2}});
      const body={kind:'transfer',bottles:1,sourceProductId:retail.id,note:'Open bottle',requestKey:randomUUID()};
      assert((await call('/'+supply.id+'/stock','POST',body)).success);
      assert((await call('/'+supply.id+'/stock','POST',body)).success);
      assert.equal((await prisma.product.findUnique({where:{id:retail.id}})).stock,1);
      assert.equal((await prisma.clinicSupply.findUnique({where:{id:supply.id}})).stockMilliMl,498000);
      assert.equal((await call('/'+supply.id+'/stock','POST',{...body,bottles:2,requestKey:randomUUID()})).status,409);
      assert.equal((await prisma.clinicSupply.findUnique({where:{id:supply.id}})).stockMilliMl,498000);
    });
    await t.test('no-products correction restores stock and preserves movements',async()=>{
      const r=await call('/usage/'+appointment.id,'PUT',{revision:saved.revision,requestKey:randomUUID(),items:[],noProducts:true,note:'Wrong treatment'});
      assert(r.success);
      assert.equal((await prisma.clinicSupply.findUnique({where:{id:supply.id}})).stockMilliMl,500000);
      assert.equal(await prisma.clinicStockMovement.count({where:{appointmentId:appointment.id}}),3);
      assert(!(await call('/pending')).data.some(a=>a.id===appointment.id));
    });
    await t.test('simultaneous services cannot overdraw the same product',async()=>{
      const a=await prisma.appointment.create({data:{clientName:'Concurrency test',clientPhone:'test',serviceName:'Test service',date:'2026-10-20',time:'11:00',startDateTime:new Date(),endDateTime:new Date(),status:'completed'}});
      const b=await prisma.appointment.create({data:{clientName:'Concurrency test',clientPhone:'test',serviceName:'Test service',date:'2026-10-20',time:'12:00',startDateTime:new Date(),endDateTime:new Date(),status:'completed'}});
      try {
        const results=await Promise.all([a,b].map(ap=>call('/usage/'+ap.id,'PUT',{revision:0,requestKey:randomUUID(),items:[{supplyId:other.id,ml:'0.75'}]})));
        assert.equal(results.filter(r=>r.success).length,1);
        assert.equal((await prisma.clinicSupply.findUnique({where:{id:other.id}})).stockMilliMl,250);
      }finally{
        await prisma.clinicUsage.deleteMany({where:{appointmentId:{in:[a.id,b.id]}}});
        await prisma.appointment.deleteMany({where:{id:{in:[a.id,b.id]}}});
      }
    });
  }finally{
    const ids=[supply?.id,other?.id].filter(Boolean);
    await prisma.clinicStockMovement.deleteMany({where:{supplyId:{in:ids}}});
    await prisma.clinicSupply.deleteMany({where:{id:{in:ids}}});
    if(appointment){await prisma.clinicUsage.deleteMany({where:{appointmentId:appointment.id}});await prisma.appointment.delete({where:{id:appointment.id}});}
    if(retail)await prisma.product.delete({where:{id:retail.id}});
    await new Promise(resolve=>server.close(resolve));await prisma.$disconnect();
  }
});
