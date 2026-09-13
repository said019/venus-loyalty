import {isDateKey} from './engine.js';
import {foods,recipes} from './data.js';
const knownRecipe=id=>recipes.find(r=>r.id===id);
const knownFood=id=>typeof id==='string'&&Object.hasOwn(foods,id);
const KEY='a-mi-ritmo.venus.owner.v1';
export const fresh=()=>({version:1,changes:{},pending:{},done:{},pantry:{},alternatives:[]});
export function decode(raw){
 if(!raw)return fresh();
 const data=JSON.parse(raw);
 if(!data||data.version!==1)throw Error('Formato guardado incompatible');
 const out=fresh();
 for(const field of ['changes','pending','done']){
  const input=data[field];if(!input||typeof input!=='object'||Array.isArray(input))continue;
  for(const [date,value] of Object.entries(input)){
   if(!isDateKey(date)||!value||typeof value!=='object'||Array.isArray(value))continue;
   const clean={};
   if(field==='changes')for(const [id,indices] of Object.entries(value)){
    const r=knownRecipe(id);if(!r||!indices||typeof indices!=='object'||Array.isArray(indices))continue;
    const swaps={};for(const [index,target] of Object.entries(indices))if(/^(0|[1-9]\d*)$/.test(index)&&r.ingredients[Number(index)]&&knownFood(target))swaps[index]=target;
    clean[id]=swaps;
   }
   if(field==='done')for(const [id,done] of Object.entries(value))if(knownRecipe(id)&&typeof done==='boolean')clean[id]=done;
   if(field==='pending')for(const p of Object.values(value)){
    if(p&&knownRecipe(p.recipeId)?.ingredients[p.index]&&Number.isInteger(p.index)&&knownFood(p.target)&&typeof p.reason==='string')clean[p.recipeId+':'+p.index]={recipeId:p.recipeId,index:p.index,target:p.target,reason:p.reason.slice(0,1500)};
   }
   out[field][date]=clean;
  }
 }
 if(data.pantry&&typeof data.pantry==='object'&&!Array.isArray(data.pantry))out.pantry=Object.fromEntries(Object.entries(data.pantry).filter(([key,value])=>key.startsWith('[')&&key.length<400&&typeof value==='boolean'));
 if(Array.isArray(data.alternatives))out.alternatives=data.alternatives.filter(x=>x&&knownRecipe(x.recipeId)?.ingredients[x.index]&&Number.isInteger(x.index)&&knownFood(x.target)).slice(0,100).map(({recipeId,index,target})=>({recipeId,index,target}));
 return out;
}
export function createStore(storage){
 let data=fresh(),warning='';
 try{data=decode(storage.getItem(KEY));}catch{warning='No pudimos recuperar los datos guardados. Esta sesión empieza sin registros.';}
 return {get data(){return data;},get warning(){return warning;},save(){try{storage.setItem(KEY,JSON.stringify(data));return true;}catch{warning='No se pudo guardar en este navegador. Los cambios solo duran esta sesión.';return false;}},clear(){try{storage.removeItem(KEY);data=fresh();warning='';return true;}catch{warning='No se pudo borrar el almacenamiento. Borra los datos de este sitio desde tu navegador.';return false;}}};
}
