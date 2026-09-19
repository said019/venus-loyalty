import test from 'node:test';
import assert from 'node:assert/strict';
import {foods,recipes,menuForDate} from '../private/mi-plan/src/data.js';
import {shoppingList,effectiveIngredients,proposeSwap,formatQuantity,formatAmount,weightState} from '../private/mi-plan/src/engine.js';
import {mealCandidates} from '../src/services/ai/personalPlan.js';
test('full week totals add documented grams without raw/cooked conversion',()=>{
 const entries=Array.from({length:7},(_,i)=>`2026-09-${14+i}`).flatMap(d=>menuForDate(d).map(recipe=>({recipe})));
 const rows=shoppingList(entries,foods);
 assert.equal(rows.find(r=>r.foodId==='chicken').quantity,180);
 assert.equal(rows.find(r=>r.foodId==='beef').quantity,450);
 assert.equal(rows.find(r=>r.foodId==='chicken').unit,'gramos');
});
test('recipe warning does not block a documented cereal exchange, including Claude candidates',()=>{
 const recipe=recipes.find(r=>r.id==='c0');assert.ok(recipe.warning);
 const items=effectiveIngredients(recipe,{0:'rice'},foods);
 assert.equal(items[0].foodId,'rice');assert.equal(items[0].quantity,2/3);
 assert.ok(mealCandidates('c0',0).candidates.some(c=>c.food.id==='rice'));
 assert.equal(shoppingList([{recipe,changes:{0:'rice'}}],foods).find(r=>r.foodId==='rice').quantity,2/3);
});
test('uncertain weights and mismatched groups remain unapplied',()=>{
 const recipe=recipes.find(r=>r.id==='d0');
 const index=recipe.ingredients.findIndex(i=>i.foodId==='chicken');
 // El PDF no dice crudo ni cocido; el 17-sep-2026 se decidió cocido, como el
 // anexo UNAM del SMAE ("Pechuga de pollo o pavo, atún en agua — 30 gr cocido").
 // Con ese dato el cambio se aplica. Antes quedaba pendiente.
 assert.equal(proposeSwap(recipe.ingredients[index],'tuna',foods).status,'valid');
 // Grupos distintos siguen sin aplicarse.
 assert.equal(proposeSwap(recipe.ingredients[index],'apple',foods).status,'pending');
 assert.equal(effectiveIngredients(recipe,{[index]:'apple'},foods)[index].foodId,'chicken');
 // Y la regla de peso ambiguo sigue viva: gramos sin saber si es crudo o
 // cocido no se aplican, aunque el grupo coincida.
 const dudoso={...foods,ghost:{id:'ghost',name:'Prueba',group:foods.chicken.group,portion:30,unit:'gramos',prep:'unknown',page:null}};
 assert.equal(proposeSwap(recipe.ingredients[index],'ghost',dudoso).status,'pending');
});
test('cooked state is traceable and shown next to every cooked weight',()=>{
 // Todo peso en gramos marcado cocido dice de dónde sale ese dato (el plan no lo dice).
 for(const f of Object.values(foods))if(weightState(f)==='peso ya cocido')assert.ok(f.prepFrom,`${f.id} sin origen del estado`);
 assert.equal(weightState(foods.beef),'peso ya cocido');
 assert.equal(weightState(foods.tuna),'');
 assert.equal(weightState({unit:'gramos',prep:'unknown'}),'sin saber si es crudo o cocido');
 // Carne del plan → carne SMAE, ambas cocidas: misma base, cambio válido 1:1.
 const c0=recipes.find(r=>r.id==='c0');
 const swap=proposeSwap(c0.ingredients[2],'salmon',foods);
 assert.equal(swap.status,'valid');assert.equal(swap.quantity,90);
});
test('corrected reference portions: whole-grain sliced bread 1:1, no powdered milk',()=>{
 const a0=recipes.find(r=>r.id==='a0');
 const pan=proposeSwap(a0.ingredients[0],'box-bread',foods);
 assert.equal(pan.status,'valid');assert.equal(pan.quantity,2);assert.equal(pan.unit,'rebanada');
 assert.equal(foods['milk-powder'],undefined);
 assert.match(foods.popcorn.name,/sin aceite/);
});
test('c1 shredded beef is held (subgroup in doubt) without blocking the rest of the recipe',()=>{
 const c1=recipes.find(r=>r.id==='c1');
 const r=proposeSwap(c1.ingredients[2],'egg',foods);
 assert.equal(r.status,'pending');assert.match(r.reason,/dos subgrupos/);
 assert.equal(effectiveIngredients(c1,{2:'egg'},foods)[2].foodId,'shredded-beef');
 assert.equal(proposeSwap(c1.ingredients[0],'tortilla',foods).status,'valid');
 assert.equal(mealCandidates('c1',2).candidates.length,0);
});
test('quantities never show floating-point residue',()=>{
 assert.equal(formatQuantity(6*(1/6)),'1');
 assert.equal(formatQuantity(1/6+1/6+1/6+1/6+1/6+1/6),'1');
 assert.equal(formatQuantity(1.2000000000000002),'1,2');
 assert.equal(formatQuantity(2/3),'2/3');
 assert.equal(formatAmount(0.1875,'taza'),'3 cucharada');
 assert.equal(formatAmount(2/3,'taza'),'2/3 taza');
 const week=Array.from({length:7},(_,i)=>`2026-09-${14+i}`).flatMap(d=>menuForDate(d).map(recipe=>({recipe})));
 for(const row of shoppingList(week,foods))if(row.quantity!=null)assert.doesNotMatch(formatQuantity(row.quantity),/\d{4,}/,row.name);
});
