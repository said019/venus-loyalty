import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../private/mi-plan/',import.meta.url));
const OWNER_ID='adm_1763511804130';
const OWNER_EMAIL='saidromero19@gmail.com';
const assets=new Map([['/','index.html'],['/index.html','index.html'],...['app.js','data.js','engine.js','storage.js','style.css'].map(f=>['/src/'+f,'src/'+f])]);
export function createPersonalPlanRouter({resolveSession,findAdmin,askAI,expectedOrigin='https://venuscosmetologia.com.mx'}){
 const router=express.Router();
 let activeAI=false,windowStart=0,requests=0;
 router.use((_req,res,next)=>{
  res.set({'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",'Permissions-Policy':'camera=(), microphone=(), geolocation=()'});
  // Override the legacy global credentialed CORS policy for this private namespace.
  res.removeHeader('Access-Control-Allow-Origin');res.removeHeader('Access-Control-Allow-Credentials');next();
 });
 router.get('/entrar',(_req,res)=>res.sendFile(path.join(root,'login.html')));
 router.get('/login.js',(_req,res)=>res.sendFile(path.join(root,'login.js')));
 router.get('/login.css',(_req,res)=>res.sendFile(path.join(root,'src/style.css')));
 router.use(async(req,res,next)=>{
  let session;try{session=await resolveSession(req);}catch{session=null;}
  if(!session){if(req.path==='/'||req.path==='/index.html')return res.redirect(302,'/mi-plan/entrar');return res.status(401).json({error:'auth_required'});}
  if(session.uid!==OWNER_ID||session.email!==OWNER_EMAIL||session.role!=='admin')return res.status(403).send('Este espacio es privado. Usa la cuenta propietaria de Venus.');
  try{const admin=await findAdmin(OWNER_ID);if(!admin||admin.id!==OWNER_ID||admin.email!==OWNER_EMAIL||admin.role!=='admin')return res.status(403).send('Acceso no autorizado.');}
  catch{return res.status(503).send('No se pudo verificar el acceso. Inténtalo de nuevo.');}
  next();
 });
 router.get('/session',(_req,res)=>res.json({ok:true}));
 router.post('/suggest',async(req,res)=>{
  if(req.headers.origin!==expectedOrigin)return res.status(403).json({error:'origin_required'});
  const {recipeId,index,question,consent}=req.body||{};
  if(consent!==true||typeof recipeId!=='string'||recipeId.length>10||!Number.isInteger(index)||index<0||index>30||typeof question!=='string'||!question.trim()||question.length>400)return res.status(400).json({error:'invalid_request'});
  if(!askAI)return res.status(503).json({error:'ai_unavailable'});
  const now=Date.now();if(now-windowStart>3600000){windowStart=now;requests=0;}
  if(activeAI||requests>=20)return res.status(429).json({error:'try_later'});
  activeAI=true;requests++;
  try{return res.json(await askAI({recipeId,index,question:question.trim()}));}
  catch(e){return res.status(e.message==='INVALID_SELECTION'?400:503).json({error:'suggestion_unavailable'});}
  finally{activeAI=false;}
 });
 router.use((req,res)=>{const file=assets.get(req.path);if(!file||!['GET','HEAD'].includes(req.method))return res.status(404).end();return res.sendFile(path.join(root,file));});
 return router;
}
