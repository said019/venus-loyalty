import test from 'node:test';
import assert from 'node:assert/strict';
import {foods,recipes,menuForDate} from '../private/mi-plan/src/data.js';
import {shoppingList,effectiveIngredients,proposeSwap} from '../private/mi-plan/src/engine.js';
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
 assert.equal(proposeSwap(recipe.ingredients[index],'tuna',foods).status,'pending');
 assert.equal(effectiveIngredients(recipe,{[index]:'tuna'},foods)[index].foodId,'chicken');
});
