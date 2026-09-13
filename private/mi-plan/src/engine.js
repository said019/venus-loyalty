const own = (object, key) => object != null && Object.prototype.hasOwnProperty.call(object, key);
const foodFor = (foods, id) => typeof id === 'string' && own(foods, id) ? foods[id] : undefined;
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const uncertainGrams = food => ['g', 'gramo', 'gramos'].includes(food.unit?.trim().toLowerCase()) &&
  (!food.prep || food.prep.trim().toLowerCase() === 'unknown' || food.prep.toLowerCase().includes('pesaje no especificado'));

export function proposeSwap(ingredient, targetId, foods) {
  const result = (status, reason, extra = {}) => ({ status, reason, foodId:targetId, ...extra });
  const source = foodFor(foods, ingredient?.foodId);
  const target = foodFor(foods, targetId);
  if (!source || !target) return result('blocked', 'Alimento no reconocido en el catálogo.');
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

export function effectiveIngredients(recipe, changes = {}, foods = {}) {
  return (Array.isArray(recipe?.ingredients) ? recipe.ingredients : []).map((ingredient, index) => {
    const original = {...ingredient};
    if (recipe.blockSwaps || !own(changes, index)) return original;
    const swap = proposeSwap(ingredient, changes[index], foods);
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
  const whole = Math.floor(value);
  const fraction = value - whole;
  if (fraction === 0) return String(whole);
  for (const denominator of [2,3,4,6,8,12]) {
    const numerator = Math.round(fraction * denominator);
    if (numerator > 0 && numerator < denominator && Math.abs(fraction - numerator / denominator) < 1e-10) {
      return `${whole ? `${whole} ` : ''}${numerator}/${denominator}`;
    }
  }
  return String(value).replace('.', ',');
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
