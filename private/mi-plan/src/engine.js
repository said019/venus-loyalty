const own = (object, key) => object != null && Object.prototype.hasOwnProperty.call(object, key);
const foodFor = (foods, id) => typeof id === 'string' && own(foods, id) ? foods[id] : undefined;
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const inGrams = food => ['g', 'gramo', 'gramos'].includes(food?.unit?.trim().toLowerCase());
const uncertainGrams = food => inGrams(food) &&
  (!food.prep || food.prep.trim().toLowerCase() === 'unknown' || food.prep.toLowerCase().includes('pesaje no especificado'));

// Lo que hay que decir junto a un peso para que se pueda pesar bien: la carne
// en gramos se prescribe cocida y en el súper se compra cruda.
export function weightState(food) {
  if (!inGrams(food)) return '';
  if (uncertainGrams(food)) return 'sin saber si es crudo o cocido';
  return /cocid/i.test(food.prep) ? 'peso ya cocido' : '';
}

export function proposeSwap(ingredient, targetId, foods) {
  const result = (status, reason, extra = {}) => ({ status, reason, foodId:targetId, ...extra });
  const source = foodFor(foods, ingredient?.foodId);
  const target = foodFor(foods, targetId);
  if (!source || !target) return result('blocked', 'Alimento no reconocido en el catálogo.');
  if (ingredient.hold) return result('pending', ingredient.hold);
  if (!positive(ingredient?.quantity) || !positive(source.portion) || !positive(target.portion)) {
    return result('blocked', 'Se necesita una cantidad y una porción válidas.');
  }
  if (!source.unit || !target.unit || ingredient.unit !== source.unit) {
    return result('blocked', 'La unidad no coincide con la porción documentada.');
  }
  if (!source.group || source.group !== target.group) {
    return result('pending', 'Los alimentos pertenecen a grupos distintos; consulta a tu nutrióloga.');
  }
  if (uncertainGrams(source) || uncertainGrams(target)) {
    return result('pending', 'Falta confirmar si el peso corresponde al alimento crudo o cocido.');
  }
  const equivalents = ingredient.quantity / source.portion;
  const quantity = equivalents * target.portion;
  if (!positive(equivalents) || !positive(quantity)) return result('blocked', 'La cantidad queda fuera de un rango válido.');
  return result('valid', 'Mismo grupo y porciones documentadas.', {quantity, unit:target.unit, equivalents});
}

// Aporte promedio por equivalente de cada subgrupo (SMAE, anexo UNAM, tabla de
// subgrupos): energía (kcal), proteína, grasa e hidratos de carbono (g).
export const GROUP_NUTRIENTS = {
  'vegetable': {kcal:25, protein:2, fat:0, carbs:4},
  'fruit': {kcal:60, protein:0, fat:0, carbs:15},
  'cereal': {kcal:70, protein:2, fat:0, carbs:15},
  'fat-cereal': {kcal:115, protein:2, fat:5, carbs:15},
  'protein-very-low': {kcal:40, protein:7, fat:1, carbs:0},
  'protein-low': {kcal:55, protein:7, fat:3, carbs:0},
  'protein-moderate': {kcal:75, protein:7, fat:5, carbs:0},
  'skim-milk': {kcal:95, protein:9, fat:2, carbs:12},
  'fat': {kcal:45, protein:0, fat:5, carbs:0},
};

// Cantidad en la unidad de la tabla → equivalentes → aporte del subgrupo.
export function nutrientsOf(food, quantity) {
  const perEquivalent = GROUP_NUTRIENTS[food?.group];
  if (!perEquivalent || !positive(quantity) || !positive(food.portion)) return null;
  const equivalents = quantity / food.portion;
  return {equivalents, kcal:perEquivalent.kcal * equivalents, protein:perEquivalent.protein * equivalents,
    fat:perEquivalent.fat * equivalents, carbs:perEquivalent.carbs * equivalents};
}

// Claude puede proponer cualquier alimento del catálogo, de cualquier grupo, con
// su propia cantidad. La app no le cree a ciegas: calcula el aporte de lo
// original y de lo propuesto con la tabla del SMAE y descarta lo que rompa la
// regla de su familia (ver checkAIProposal). Corre igual en servidor y navegador.
export const AI_KCAL_RANGE = [0.5, 1.5];
export const AI_MAIN_RANGE = [0.75, 1.33];
// Familias del SMAE y el nutrimento que define su equivalente: los de origen
// animal se intercambian por proteína; cereales con y sin grasa, por hidratos.
const FAMILY = {
  'protein-very-low':{group:'aoa', nutrient:'protein', label:'proteína'},
  'protein-low':{group:'aoa', nutrient:'protein', label:'proteína'},
  'protein-moderate':{group:'aoa', nutrient:'protein', label:'proteína'},
  'cereal':{group:'cereal', nutrient:'carbs', label:'cantidad de hidratos'},
  'fat-cereal':{group:'cereal', nutrient:'carbs', label:'cantidad de hidratos'},
  'fruit':{group:'fruit', nutrient:'carbs', label:'cantidad de hidratos'},
  'vegetable':{group:'vegetable', nutrient:'kcal', label:'energía'},
  'skim-milk':{group:'milk', nutrient:'protein', label:'proteína'},
  'fat':{group:'fat', nutrient:'fat', label:'grasa'},
};
const ratioOf = (after, before) => before > 0 ? after / before : (after > 0 ? Infinity : 1);
export function checkAIProposal(ingredient, targetId, quantity, foods) {
  const source = foodFor(foods, ingredient?.foodId);
  const target = foodFor(foods, targetId);
  if (!source || !target) return {ok:false, reason:'Alimento no reconocido en el catálogo.'};
  if (ingredient.unit !== source.unit) return {ok:false, reason:'Tu receta lo mide distinto que la tabla; no hay con qué comparar.'};
  const before = nutrientsOf(source, ingredient.quantity);
  if (!before) return {ok:false, reason:'Este ingrediente no tiene cantidad o aporte documentado; no hay con qué comparar.'};
  if (!positive(quantity) || quantity > 10000) return {ok:false, reason:'Cantidad fuera de rango.'};
  const after = nutrientsOf(target, quantity);
  if (!after) return {ok:false, reason:'Ese alimento no tiene aporte documentado en la tabla.'};
  // Misma familia: se conservan los equivalentes (proteína entre carnes, hidratos
  // entre cereales); la grasa y las calorías pueden variar y se muestran. 90 g de
  // deshebrada por 169 g de pollo iguala calorías pero casi duplica la proteína.
  // Familias distintas: no hay equivalente, así que se exige energía parecida.
  const family = FAMILY[source.group];
  const sameFamily = Boolean(family) && family.group === FAMILY[target.group]?.group;
  if (sameFamily) {
    const main = ratioOf(after[family.nutrient], before[family.nutrient]);
    if (!(main >= AI_MAIN_RANGE[0] && main <= AI_MAIN_RANGE[1])) {
      return {ok:false, reason:`Cambia demasiado la ${family.label} respecto del original.`, before, after};
    }
  } else {
    const ratio = after.kcal / before.kcal;
    if (!(ratio >= AI_KCAL_RANGE[0] && ratio <= AI_KCAL_RANGE[1])) {
      return {ok:false, reason:'La cantidad propuesta se aleja demasiado de las calorías del original.', before, after};
    }
  }
  return {ok:true, before, after, sameGroup:source.group === target.group, sameFamily};
}

export function effectiveIngredients(recipe, changes = {}, foods = {}) {
  return (Array.isArray(recipe?.ingredients) ? recipe.ingredients : []).map((ingredient, index) => {
    const original = {...ingredient};
    if (recipe.blockSwaps || !own(changes, index)) return original;
    const change = changes[index];
    if (change && typeof change === 'object') {
      // Cambio con cantidad propuesta por Claude: se vuelve a comprobar aquí.
      if (!checkAIProposal(ingredient, change.target, change.quantity, foods).ok) return original;
      const food = foodFor(foods, change.target);
      return {...original, foodId:change.target, quantity:change.quantity, unit:food.unit,
        prep:food.prep, source:original, swapped:true, byAI:true};
    }
    const swap = proposeSwap(ingredient, change, foods);
    if (swap.status !== 'valid') return original;
    return {...original, foodId:swap.foodId, quantity:swap.quantity, unit:swap.unit,
      prep:foodFor(foods, swap.foodId).prep, source:original, swapped:true};
  });
}

export function shoppingList(entries = [], foods = {}) {
  const items = new Map();
  let unknownCount = 0;
  for (const entry of entries) {
    for (const ingredient of effectiveIngredients(entry.recipe, entry.changes, foods)) {
      const food = foodFor(foods, ingredient.foodId);
      const unit = ingredient.unit ?? food?.unit ?? '';
      const prep = ingredient.prep ?? food?.prep ?? 'unknown';
      const optional = Boolean(ingredient.optional);
      const quantity = positive(ingredient.quantity) ? ingredient.quantity : null;
      const baseKey = JSON.stringify([ingredient.foodId, unit, prep, optional]);
      const key = quantity === null ? `${baseKey}:unquantified:${unknownCount++}` : baseKey;
      if (items.has(key)) items.get(key).quantity += quantity;
      else items.set(key, {key, foodId:ingredient.foodId, name:food?.name ?? ingredient.name ?? 'Alimento no reconocido', quantity, unit, prep, optional});
    }
  }
  return [...items.values()];
}

export function formatQuantity(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'Cantidad no especificada';
  // Seis sextos de aguacate suman 0.9999999999999999: se redondea antes de
  // separar el entero para no mostrar residuos de punto flotante.
  const clean = Math.round(value * 1e6) / 1e6;
  const whole = Math.floor(clean);
  const fraction = clean - whole;
  if (fraction < 1e-9) return String(whole);
  for (const denominator of [2,3,4,6,8,12]) {
    const numerator = Math.round(fraction * denominator);
    if (numerator > 0 && numerator < denominator && Math.abs(fraction - numerator / denominator) < 1e-6) {
      return `${whole ? `${whole} ` : ''}${numerator}/${denominator}`;
    }
  }
  return String(Math.round(clean * 100) / 100).replace('.', ',');
}

// Menos de ¼ de taza no se mide con taza: se pasa a cucharadas (1 taza = 16
// cucharadas, volumen a volumen; no cambia la cantidad).
export function formatAmount(value, unit = '') {
  if (unit === 'taza' && typeof value === 'number' && value > 0 && value < 0.25) {
    return `${formatQuantity(value * 16)} cucharada`;
  }
  return `${formatQuantity(value)}${unit ? ` ${unit}` : ''}`;
}

export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function dateKey(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '';
  return `${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
