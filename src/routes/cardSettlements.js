import express from 'express';
import { prisma } from '../db/index.js';
import { adminAuth, requireRole } from '../../lib/auth.js';
import { listCardSettlements, updateCardSettlements } from '../services/card-settlements.js';
const router=express.Router();
router.use(adminAuth,requireRole('admin'));
router.get('/',async(req,res)=>{
  try { res.json({success:true,data:await listCardSettlements(prisma,req.query.from,req.query.to)}); }
  catch(e){console.error('[CARD SETTLEMENTS]',e.message);res.status(e.status||500).json({success:false,error:e.status?e.message:'No se pudieron cargar los depósitos.'});}
});
router.post('/',async(req,res)=>{
  try {res.json({success:true,...await updateCardSettlements(prisma,req.body,req.admin.email||req.admin.uid)});}
  catch(e){const conflict=e.code==='P2034';console.error('[CARD SETTLEMENTS]',e.message);res.status(e.status||(conflict?409:500)).json({success:false,error:conflict?'Otro usuario actualizó estos cobros. Actualiza e intenta de nuevo.':e.status?e.message:'No se pudo guardar la confirmación.'});}
});
export default router;
