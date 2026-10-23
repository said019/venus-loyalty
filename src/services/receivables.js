import {createHash} from 'node:crypto';
import {validateRange} from './card-settlements.js';
const prefix='receivable:';
export const isReceivableSale=id=>String(id).startsWith('receivable_');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function key(value){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(value))throw fail('Referencia inválida. Vuelve a abrir el formulario.');return value;}
function cents(value,zero=false){if(!/^\d+(\.\d{1,2})?$/.test(String(value??'')))throw fail('Indica un monto válido con hasta dos decimales.');const n=Math.round(Number(value)*100);if(n<(zero?0:1)||n>100000000)throw fail('Monto fuera de rango.');return n;}
function text(value,label,max){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw fail(`Revisa ${label}.`);return value.trim();}
const paid=account=>account.payments.filter(p=>!p.reversedAt).reduce((s,p)=>s+p.amountCents,0);
export function receivableView(account){const paidCents=paid(account);return {...account,paidCents,balanceCents:account.cancelledAt?0:account.totalCents-paidCents,status:account.cancelledAt?'cancelled':paidCents===account.totalCents?'paid':paidCents?'partial':'pending'};}
async function addPayment(tx,account,amountCents,method,requestKey,actor,now){
 if(!['efectivo','tarjeta_credito','tarjeta_debito','transferencia'].includes(method))throw fail('Selecciona el método de pago.');
 if(amountCents>account.totalCents-paid(account))throw fail('El abono supera el saldo pendiente. Actualiza la cuenta.',409);
 const saleId='receivable_'+requestKey;
 await tx.sale.create({data:{id:saleId,clientName:account.clientName,clientPhone:account.clientPhone||null,serviceName:`Abono · ${account.concept}`,serviceAmount:amountCents/100,subtotal:amountCents/100,total:amountCents/100,totalAmount:amountCents/100,paymentMethod:method,date:now}});
 account.payments.push({id:requestKey,saleId,amountCents,method,at:now.toISOString(),by:actor});
}
export async function createReceivable(db,body,actor,now=new Date()){
 const id=key(body.requestKey),totalCents=cents(body.total),initialCents=cents(body.initial||0,true);
 const clientName=text(body.clientName,'el nombre de la clienta',150),concept=text(body.concept,'el concepto',250);
 const clientPhone=typeof body.clientPhone==='string'?body.clientPhone.trim():'';
 if(clientPhone.length>30||initialCents>totalCents)throw fail('Revisa el teléfono y el abono inicial.');
 const signature=createHash('sha256').update(JSON.stringify([clientName,clientPhone,concept,totalCents,initialCents,body.method])).digest('hex');
 return transact(db,async tx=>{
  const previous=await tx.setting.findUnique({where:{key:prefix+id}});
  if(previous){if(previous.value.signature!==signature)throw fail('Esta referencia ya se utilizó con otros datos.',409);return receivableView(previous.value);}
  const account={id,clientName,clientPhone,concept,totalCents,createdAt:now.toISOString(),createdBy:actor,signature,revision:0,payments:[]};
  if(initialCents)await addPayment(tx,account,initialCents,body.method,id,actor,now);
  await tx.setting.create({data:{key:prefix+id,value:account}});
  return receivableView(account);
 });
}
async function transact(db,fn){try{return await db.$transaction(fn,{isolationLevel:'Serializable'});}catch(e){if(['P2034','P2002'].includes(e.code))throw fail('Otra operación actualizó esta cuenta. Reintenta para comprobar el registro.',409);throw e;}}
export async function changeReceivable(db,id,body,actor,now=new Date()){
 key(id);const requestKey=key(body.requestKey);
 if(!['pay','reverse','cancel'].includes(body.action))throw fail('Acción inválida.');
 return transact(db,async tx=>{
  const record=await tx.setting.findUnique({where:{key:prefix+id}});
  if(!record)throw fail('Cuenta no encontrada.',404);
  const account=record.value;
  if(body.action==='pay'){
   const old=account.payments.find(p=>p.id===requestKey);
   if(old){if(old.amountCents!==cents(body.amount)||old.method!==body.method)throw fail('La referencia ya tiene otro importe o método.',409);return receivableView(account);}
  }
  if(body.action==='reverse'&&account.payments.some(p=>p.id===body.paymentId&&p.reversedAt))return receivableView(account);
  if(body.action==='cancel'&&account.cancelledAt)return receivableView(account);
  if(account.cancelledAt)throw fail('La cuenta está cancelada.',409);
  if(body.revision!==account.revision)throw fail('El saldo cambió. Actualiza antes de registrar el movimiento.',409);
  if(body.action==='pay')await addPayment(tx,account,cents(body.amount),body.method,requestKey,actor,now);
  if(body.action==='reverse'){
   const payment=account.payments.find(p=>p.id===body.paymentId);
   if(!payment)throw fail('Abono no encontrado.',404);
   await tx.sale.delete({where:{id:payment.saleId}});
   payment.reversedAt=now.toISOString();payment.reversedBy=actor;
  }
  if(body.action==='cancel'){
   if(paid(account)>0)throw fail('Primero deshaz los abonos registrados antes de cancelar la cuenta.',409);
   account.cancelledAt=now.toISOString();account.cancelledBy=actor;
  }
  account.revision++;account.updatedAt=now.toISOString();
  await tx.setting.update({where:{key:prefix+id},data:{value:account}});
  return receivableView(account);
 });
}
export async function listReceivables(db,from,to){
 const range=validateRange(from,to);
 const rows=await db.setting.findMany({where:{key:{startsWith:prefix}},orderBy:{createdAt:'desc'}});
 const accounts=rows.map(r=>receivableView(r.value));
 const receivedCents=accounts.reduce((sum,account)=>sum+account.payments
  .filter(p=>!p.reversedAt&&new Date(p.at)>=range.gte&&new Date(p.at)<=range.lte)
  .reduce((total,p)=>total+p.amountCents,0),0);
 return {accounts,from,to,balanceCents:accounts.reduce((s,a)=>s+a.balanceCents,0),receivedCents,openCount:accounts.filter(a=>a.balanceCents>0).length};
}

export const appointmentReceivableKey = id => 'receivable:appt_' + createHash('sha256').update(String(id)).digest('hex');
// Correct only cash actually received; keep the appointment, products and stock intact.
export async function deferAppointmentBalance(db, appointmentId, body, actor, now=new Date()) {
 const receivedCents=cents(body.received,true),requestKey=key(body.requestKey);
 const recordKey=appointmentReceivableKey(appointmentId);
 return transact(db,async tx=>{
  const existing=await tx.setting.findUnique({where:{key:recordKey}});
  if(existing){
   if(existing.value.correction.requestKey===requestKey && existing.value.correction.receivedCents===receivedCents)return receivableView(existing.value);
   throw fail('Esta cita ya tiene una cuenta vinculada. Consulta Pagos pendientes.',409);
  }
  const appointment=await tx.appointment.findUnique({where:{id:appointmentId}});
  if(!appointment)throw fail('Cita no encontrada.',404);
  if(appointment.status!=='completed'||appointment.totalPaid==null)throw fail('La cita debe tener un cobro registrado.',409);
  if(!body.version||new Date(appointment.updatedAt).toISOString()!==body.version)throw fail('El cobro cambió. Cierra y vuelve a abrir la cita.',409);
  const originalCents=Math.round(Number(appointment.totalPaid)*100);
  if(receivedCents>=originalCents)throw fail('Lo recibido debe ser menor al cobro registrado.');
  const sales=await tx.sale.findMany({where:{appointmentId},orderBy:{date:'desc'}});
  // Multiple payment records must be reconciled explicitly, never guessed.
  if(sales.length>1)throw fail('La cita tiene varios registros de cobro. Revisa el historial antes de corregirla.',409);
  if(sales.length && Math.round(Number(sales[0].totalAmount??sales[0].total)*100)!==originalCents)throw fail('Los importes del cobro no coinciden. Actualiza y revisa el historial.',409);
  const account={id:recordKey.slice(prefix.length),clientName:appointment.clientName,clientPhone:appointment.clientPhone,
   concept:`Saldo de cita · ${appointment.serviceName} · ${appointment.date}`,totalCents:originalCents-receivedCents,
   createdAt:now.toISOString(),createdBy:actor,revision:0,payments:[],appointmentId,
   correction:{requestKey,originalCents,receivedCents,at:now.toISOString(),by:actor,
    before:JSON.parse(JSON.stringify({appointment,sales}))}};
  await tx.appointment.update({where:{id:appointmentId},data:{totalPaid:receivedCents/100}});
  if(sales.length)await tx.sale.update({where:{id:sales[0].id},data:{total:receivedCents/100,totalAmount:receivedCents/100}});
  await tx.setting.create({data:{key:recordKey,value:account}});
  return receivableView(account);
 });
}
