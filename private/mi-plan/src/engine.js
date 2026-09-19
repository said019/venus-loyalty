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
