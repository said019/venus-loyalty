import { inventoryError, milliMl, moveStock, requestKey } from './clinicInventory.js';

export function allocationVersion(allocations) {
  return allocations.map(a => a.id).sort().join(',');
}

// Corrections append signed entries: original receipts and their actors remain intact.
export async function redistributePurchaseRow(db, lineId, body, actor) {
  const key = requestKey(body.requestKey);
  const desired = { sale: Number(body.saleQuantity), clinic: Number(body.clinicQuantity) };
  if (!Object.values(desired).every(n => Number.isSafeInteger(n) && n >= 0 && n <= 100000)) {
    throw inventoryError('Indica cantidades enteras entre 0 y 100000.');
  }
  const auditKey = `purchase-correction:${key}`;
  try {
    return await db.$transaction(async tx => {
      const saved = await tx.setting.findUnique({ where: { key: auditKey } });
      if (saved) {
        if (saved.value.line.id !== lineId) throw inventoryError('Referencia inválida.', 409);
        return saved.value;
      }
      const line = await tx.purchaseInvoiceLine.findUnique({ where: { id: lineId }, include: { allocations: true } });
      if (!line) throw inventoryError('Producto no encontrado.', 404);
      if (body.allocationVersion !== allocationVersion(line.allocations)) throw inventoryError('La distribución cambió en otra sesión. Recarga antes de corregir.', 409);
      if (desired.sale + desired.clinic > line.quantity) throw inventoryError('La distribución supera las piezas compradas.');
      const current = { sale: 0, clinic: 0 };
      const groups = new Map();
      for (const a of line.allocations) {
        current[a.destination] += a.quantity;
        const groupKey = `${a.destination}:${a.targetId}:${a.bottleMilliMl || 0}`;
        const group = groups.get(groupKey) || { ...a, quantity: 0 };
        group.quantity += a.quantity;
        groups.set(groupKey, group);
      }
      let index = 0;
      for (const destination of ['sale', 'clinic']) {
        let remove = current[destination] - desired[destination];
        for (const group of groups.values()) {
          if (remove <= 0) break;
          if (group.destination !== destination || group.quantity <= 0) continue;
          const quantity = Math.min(remove, group.quantity);
          if (destination === 'sale') {
            const changed = await tx.product.updateMany({ where: { id: group.targetId, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } });
            if (changed.count !== 1) throw inventoryError('No hay suficientes piezas disponibles para retirar de venta. Revisa las ventas realizadas.', 409);
          } else {
            await moveStock(tx, group.targetId, -quantity * group.bottleMilliMl, { kind: 'correction', note: `Corrección de compra ${lineId}: retirar ${quantity} envases`, requestKey: `${key}_undo${index}`, createdBy: actor });
          }
          await tx.purchaseAllocation.create({ data: { lineId, requestKey: `${key}_undo${index++}`, quantity: -quantity, destination, targetId: group.targetId, targetName: group.targetName, bottleMilliMl: group.bottleMilliMl, createdBy: actor } });
          await tx.purchaseInvoiceLine.update({ where: { id: lineId }, data: { assignedQuantity: { decrement: quantity } } });
          remove -= quantity;
        }
      }
      const result = await assignPurchaseRow({ $transaction: fn => fn(tx) }, lineId, {
        ...body,
        saleQuantity: Math.max(0, desired.sale - current.sale),
        clinicQuantity: Math.max(0, desired.clinic - current.clinic)
      }, actor);
      result.line = await tx.purchaseInvoiceLine.findUnique({ where: { id: lineId }, include: { allocations: true } });
      await tx.setting.create({ data: { key: auditKey, value: JSON.parse(JSON.stringify(result)) } });
      return result;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (['P2002', 'P2034'].includes(error.code)) {
      const saved = await db.setting.findUnique({ where: { key: auditKey } });
      if (saved?.value?.line?.id === lineId) return saved.value;
      throw inventoryError('El inventario cambió en otra sesión. Recarga y vuelve a intentar.', 409);
    }
    throw error;
  }
}
export async function allocatePurchase(db, lineId, body, actor) {
  const key=requestKey(body.requestKey), quantity=Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity<1 || quantity>100000) throw inventoryError('Indica cuántas piezas completas quieres asignar.');
  if (!['sale','clinic'].includes(body.destination)) throw inventoryError('Selecciona venta o consultorio.');
  if (!body.targetId && (typeof body.name!=='string' || !body.name.trim() || body.name.trim().length>150)) throw inventoryError('Escribe el nombre del producto.');
  const volume=body.destination==='clinic' ? milliMl(body.bottleMl) : null;
  if (volume && (body.volumeConfirmed!==true || volume*quantity>1000000000)) throw inventoryError('Confirma los ml reales de cada envase; no se convierten gramos automáticamente.');
  let price;
  if(body.destination==='sale' && !body.targetId) {
    if(!/^\d+(\.\d{1,2})?$/.test(String(body.price ?? '')) || Number(body.price)<=0 || Number(body.price)>1000000) throw inventoryError('Indica el precio de venta del producto nuevo.');
    price=Number(body.price);
  }
  try {
    return await db.$transaction(async tx=>{
      const previous=await tx.purchaseAllocation.findUnique({where:{requestKey:key}});
      if(previous) {
        if(previous.lineId!==lineId) throw inventoryError('Referencia de asignación inválida.',409);
        return previous;
      }
      const line=await tx.purchaseInvoiceLine.findUnique({where:{id:lineId},include:{invoice:{select:{number:true}}}});
      if(!line) throw inventoryError('Concepto no encontrado.',404);
      const reserved=await tx.purchaseInvoiceLine.updateMany({where:{id:lineId,assignedQuantity:{lte:line.quantity-quantity}},data:{assignedQuantity:{increment:quantity}}});
      if(reserved.count!==1) throw inventoryError('No quedan tantas piezas por clasificar. Actualiza la factura.',409);
      let target;
      if(body.destination==='sale') {
        target=body.targetId ? await tx.product.findUnique({where:{id:body.targetId}}) : await tx.product.create({data:{name:body.name.trim(),price,cost:Math.round(line.netTotalCents/line.quantity)/100,stock:0,category:'skincare',presentation:line.description}});
        if(!target) throw inventoryError('Producto de venta no encontrado.',404);
        await tx.product.update({where:{id:target.id},data:{stock:{increment:quantity}}});
      } else {
        target=body.targetId ? await tx.clinicSupply.findUnique({where:{id:body.targetId}}) : await tx.clinicSupply.create({data:{name:body.name.trim(),bottleMilliMl:volume,stockMilliMl:0,minMilliMl:0}});
        if(!target) throw inventoryError('Producto del consultorio no encontrado.',404);
        await moveStock(tx,target.id,volume*quantity,{kind:'purchase',note:`Factura ${line.invoice.number} · ${quantity} envases de ${volume/1000} ml · ${line.description}`,requestKey:key,createdBy:actor});
      }
      return tx.purchaseAllocation.create({data:{lineId,requestKey:key,quantity,destination:body.destination,targetId:target.id,targetName:target.name,bottleMilliMl:volume,createdBy:actor}});
    });
  }catch(error){
    if(['P2002','P2034'].includes(error.code)){
      const saved=await db.purchaseAllocation.findUnique({where:{requestKey:key}});
      if(saved?.lineId===lineId)return saved;
      throw inventoryError('Otra persona actualizó la factura. Recarga antes de asignar.',409);
    }
    throw error;
  }
}

export async function savePurchasePrices(db, lineId, body) {
  function cents(value, positive=false) {
    if(value===null || value==='')return null;
    if(!/^\d+(\.\d{1,2})?$/.test(String(value ?? '')) || Number(value)>1000000 || (positive && Number(value)<=0))throw inventoryError('Escribe un precio válido con máximo dos decimales.');
    return Math.round(Number(value)*100);
  }
  const listUnitCents=cents(body.listPrice),retailUnitCents=cents(body.retailPrice,true);
  if(typeof body.note!=='string' || body.note.length>500)throw inventoryError('La nota debe tener máximo 500 caracteres.');
  const line=await db.purchaseInvoiceLine.findUnique({where:{id:lineId}});
  if(!line)throw inventoryError('Concepto no encontrado.',404);
  if(listUnitCents!==null && listUnitCents*line.quantity<line.netTotalCents)throw inventoryError('El precio antes del descuento no puede ser menor al costo pagado. Usa importes con IVA incluido.');
  return db.purchaseInvoiceLine.update({where:{id:lineId},data:{listUnitCents,retailUnitCents,purchaseNote:body.note.trim()}});
}

// Each edited row commits both destinations and its retail price together.
export async function assignPurchaseRow(db,lineId,body,actor){
 const key=requestKey(body.requestKey);
 const sale=Number(body.saleQuantity||0),clinic=Number(body.clinicQuantity||0);
 if(![sale,clinic].every(n=>Number.isInteger(n)&&n>=0&&n<=100000))throw inventoryError('Las piezas deben ser números enteros positivos.');
 const price=body.price===''||body.price==null?null:Number(body.price);
 if(price!==null&&(!/^\d+(\.\d{1,2})?$/.test(String(body.price))||price<=0||price>1000000))throw inventoryError('Indica un precio al público válido.');
 if(sale&&price===null)throw inventoryError('Falta el precio al público para las piezas de venta.');
 if(body.name!=null&&(typeof body.name!=='string'||body.name.trim().length>150))throw inventoryError('El nombre debe tener máximo 150 caracteres.');
 if(!sale&&!clinic&&price===null&&!body.name?.trim())throw inventoryError('Indica piezas, nombre o un precio para guardar.');
 return db.$transaction(async tx=>{
  const line=await tx.purchaseInvoiceLine.findUnique({where:{id:lineId}});
  if(!line)throw inventoryError('Producto no encontrado.',404);
  const adapter={$transaction:fn=>fn(tx),purchaseAllocation:tx.purchaseAllocation};
  const allocations=[];
  for(const [destination,quantity,targetId] of [['sale',sale,body.saleTargetId],['clinic',clinic,body.clinicTargetId]]){
   if(!quantity)continue;
   const allocation=await allocatePurchase(adapter,lineId,{requestKey:key+'_'+destination,quantity,destination,targetId,name:body.name,price:body.price,bottleMl:body.bottleMl,volumeConfirmed:body.volumeConfirmed},actor);
   allocations.push(allocation);
   if(destination==='sale')await tx.product.update({where:{id:allocation.targetId},data:{price}});
  }
  if(price!==null){
   await tx.purchaseInvoiceLine.update({where:{id:lineId},data:{retailUnitCents:Math.round(price*100)}});
   const linked=await tx.purchaseAllocation.findMany({where:{lineId,destination:'sale'},select:{targetId:true}});
   if(linked.length)await tx.product.updateMany({where:{id:{in:linked.map(a=>a.targetId)}},data:{price}});
  }
  if(body.name?.trim())await tx.purchaseInvoiceLine.update({where:{id:lineId},data:{description:body.name.trim()}});
  return {line:await tx.purchaseInvoiceLine.findUnique({where:{id:lineId}}),allocations};
 });
}
