import { cardAmounts, expectedSettlement, isCard, settlementStatus } from '../../public/js/card-settlement-core.js';
const prefix = 'card_settlement:';
const error = (message, status = 400) => Object.assign(new Error(message), { status });
export function validateRange(from, to) {
  const valid = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  if (!valid(from) || !valid(to) || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 366) throw error('Elige un rango válido de hasta un año.');
  return { gte: new Date(`${from}T00:00:00-06:00`), lte: new Date(`${to}T23:59:59.999-06:00`) };
}
export async function listCardSettlements(db, from, to, now = new Date()) {
  const range = validateRange(from, to);
  const [sales, coffee, appointments] = await Promise.all([
    db.sale.findMany({ where: { date: range }, select: { id:true, appointmentId:true, clientName:true, serviceName:true, totalAmount:true, total:true, paymentMethod:true, date:true } }),
    db.coffeeSale.findMany({ where: { createdAt:range, status: { not: 'cancelled' } }, select: { id:true, folio:true, total:true, paymentMethod:true, createdAt:true } }),
    db.appointment.findMany({ where: { startDateTime:range, status:'completed', paymentMethod: { not:null } }, select: { id:true, clientName:true, serviceName:true, totalPaid:true, paymentMethod:true, startDateTime:true } })
  ]);
  // Sale is the payment ledger. Only use appointments when no Sale exists,
  // including when that Sale belongs to a different date range.
  const linked = appointments.length ? await db.sale.findMany({ where: { appointmentId:{in:appointments.map(a=>a.id)} }, select:{appointmentId:true} }) : [];
  const linkedIds = new Set(linked.map(s=>s.appointmentId));
  const rows = [
    ...sales.map(s=>({ key:`sale:${s.id}`, label:s.clientName || 'Venta', concept:s.serviceName || 'Venta directa', amount:s.totalAmount ?? s.total, method:s.paymentMethod, paidAt:s.date })),
    ...coffee.map(s=>({ key:`coffee:${s.id}`, label:s.folio, concept:'Venus The Coffee Bar', amount:s.total, method:s.paymentMethod, paidAt:s.createdAt })),
    ...appointments.filter(a=>!linkedIds.has(a.id)).map(a=>({ key:`appointment:${a.id}`, label:a.clientName, concept:a.serviceName, amount:a.totalPaid, method:a.paymentMethod, paidAt:a.startDateTime, estimatedPaymentDate:true }))
  ].filter(r=>isCard(r.method) && Number(r.amount)>0).map(r=>({ key:r.key, label:r.label, concept:r.concept,
    paidAt:new Date(r.paidAt).toISOString(), estimatedPaymentDate:!!r.estimatedPaymentDate,
    ...cardAmounts(r.amount), ...expectedSettlement(r.paidAt) }));
  const settings = rows.length ? await db.setting.findMany({ where:{key:{in:rows.map(r=>prefix+r.key)}} }) : [];
  const confirmations = new Map(settings.map(s=>[s.key,s.value]));
  return rows.map(r=>{
    const c=confirmations.get(prefix+r.key);
    const status=settlementStatus(r,c,now);
    return {...r,status,confirmedAt:status==='received'?c.confirmedAt:null,confirmedBy:status==='received'?c.confirmedBy:null};
  }).sort((a,b)=>a.expectedDate.localeCompare(b.expectedDate)||a.paidAt.localeCompare(b.paidAt));
}
export async function updateCardSettlements(db, body, actor, now = new Date()) {
  const {from,to,payments,action}=body || {};
  validateRange(from,to);
  if (!['confirm','reopen'].includes(action) || !Array.isArray(payments) || !payments.length || payments.length>500 || payments.some(p=>!p || typeof p.key!=='string' || !Number.isSafeInteger(p.grossCents) || typeof p.paidAt!=='string') || new Set(payments.map(p=>p.key)).size!==payments.length) throw error('Selecciona los cobros que quieres conciliar.');
  return db.$transaction(async tx=>{
    const rows=await listCardSettlements(tx,from,to,now);
    const byKey=new Map(rows.map(r=>[r.key,r]));
    for (const p of payments) {
      const r=byKey.get(p.key);
      if (!r || p.grossCents!==r.grossCents || p.paidAt!==r.paidAt) throw error('Los cobros cambiaron. Actualiza el panel antes de confirmar.',409);
    }
    for (const p of payments) {
      const r=byKey.get(p.key), key=prefix+p.key;
      const old=await tx.setting.findUnique({where:{key}});
      const received=r.status==='received';
      if ((action==='confirm' && received) || (action==='reopen' && !received)) continue;
      const value={grossCents:r.grossCents,feeCents:r.feeCents,netCents:r.netCents,paidAt:r.paidAt,
        expectedDate:r.expectedDate,confirmedAt:action==='confirm'?now.toISOString():null,
        confirmedBy:action==='confirm'?actor:null,
        history:[...(Array.isArray(old?.value?.history)?old.value.history:[]),{action,at:now.toISOString(),by:actor,grossCents:r.grossCents,netCents:r.netCents}]};
      await tx.setting.upsert({where:{key},create:{key,value},update:{value}});
    }
    return {updated:payments.length};
  }, {isolationLevel:'Serializable', timeout:20000});
}
