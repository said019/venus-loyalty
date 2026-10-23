import express from 'express';
import { prisma } from '../db/index.js';
import { adminAuth, requireRole } from '../../lib/auth.js';
import { allocatePurchase, savePurchasePrices, assignPurchaseRow, redistributePurchaseRow } from '../services/purchaseInvoices.js';
const router=express.Router();
router.use(adminAuth,requireRole('admin'));
router.get('/',async(req,res)=>{
 try{
  const data=await prisma.purchaseInvoice.findMany({orderBy:{createdAt:'desc'},select:{id:true,number:true,supplier:true,issuedOn:true,subtotalCents:true,discountCents:true,taxCents:true,totalCents:true,lines:{orderBy:{lineNumber:'asc'},include:{allocations:{orderBy:{createdAt:'asc'}}}}}});
  res.json({success:true,data});
 }catch(e){console.error('[Invoices]',e.message);res.status(500).json({success:false,error:'No se pudieron cargar las facturas.'});}
});
router.get('/:id/pdf',async(req,res)=>{
 try{
  const invoice=await prisma.purchaseInvoice.findUnique({where:{id:req.params.id},select:{sourcePdf:true}});
  if(!invoice)return res.status(404).send('Factura no encontrada');
  res.set({'Content-Type':'application/pdf','Content-Disposition':'inline; filename="factura.pdf"','Cache-Control':'private, no-store'}).send(Buffer.from(invoice.sourcePdf));
 }catch(e){res.status(500).send('No se pudo abrir la factura');}
});
router.post('/lines/:id/allocate',async(req,res)=>{
 try{res.json({success:true,data:await allocatePurchase(prisma,req.params.id,req.body,req.admin.email || req.admin.uid)});}
 catch(e){console.error('[Invoices]',e.message);res.status(e.inventory?e.status:500).json({success:false,error:e.inventory?e.message:'No se pudo guardar la asignación. Intenta de nuevo.'});}
});
router.put('/lines/:id/prices',async(req,res)=>{
 try{res.json({success:true,data:await savePurchasePrices(prisma,req.params.id,req.body)});}
 catch(e){res.status(e.inventory?e.status:500).json({success:false,error:e.inventory?e.message:'No se pudieron guardar los precios.'});}
});
router.post('/lines/:id/assign-row',async(req,res)=>{
 try{res.json({success:true,data:await assignPurchaseRow(prisma,req.params.id,req.body,req.admin.email || req.admin.uid)});}
 catch(e){res.status(e.inventory?e.status:500).json({success:false,error:e.inventory?e.message:'No se guardó esta fila. Intenta de nuevo.'});}
});
export default router;
router.post('/lines/:id/redistribute',async(req,res)=>{
 try{res.json({success:true,data:await redistributePurchaseRow(prisma,req.params.id,req.body,req.admin.email || req.admin.uid)});}
 catch(e){res.status(e.inventory?e.status:500).json({success:false,error:e.inventory?e.message:'No se guardó la distribución. Intenta de nuevo.'});}
});
