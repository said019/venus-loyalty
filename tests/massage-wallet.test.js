import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../lib/google.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('export async function updateLoyaltyObject'),source.indexOf('export async function googleWalletDiagnostics')).replaceAll('export ','');
function setup(){
 let signed,updated;
 const c=vm.createContext({console:{log(){},error(){}},process:{env:{GOOGLE_ISSUER_ID:'issuer',BASE_URL:'https://venus.test'}},LOYALTY_CLASS_ID:'class',normalizeBaseUrl:x=>x,loadServiceAccount:()=>({client_email:'test',private_key:'test'}),getWalletAccessToken:async()=> 'test',jwt:{sign:p=>{signed=p;return 'token'}},fetch:async(u,o)=>{updated=JSON.parse(o.body);return {status:200,ok:true,json:async()=>({})}}});
 vm.runInContext(functions,c);
 return {c,signed:()=>signed.payload.loyaltyObjects[0],updated:()=>updated};
}
for(const massage of [true,false]) test(`wallet creation and update preserve ${massage?'massage':'loyalty'} identity`,async()=>{
 const t=setup(), id=massage?'client-massage':'client';
 t.c.buildGoogleSaveUrl({cardId:id,name:'Ana',stamps:4,max:massage?10:8});
 await t.c.updateLoyaltyObject(id,'Ana',4,massage?10:8);
 for(const obj of [t.signed(),t.updated()]){
  assert.equal(obj.id,`issuer.${id}`);
  assert.equal(obj.loyaltyPoints.label,massage?'SESIONES DE MASAJE':'SELLOS');
  assert.equal(obj.accountName,massage?'Masajes · Ana':'Ana');
  assert.equal(obj.linksModuleData.uris[0].uri,'https://venus.test/card/client');
  assert.match(obj.imageModulesData[0].mainImage.sourceUri.uri,massage?/massage-strip-4/:/stamp-strip-4/);
 }
});
