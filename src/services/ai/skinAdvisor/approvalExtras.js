export const CADENCES = ['unica', 'semanal', 'quincenal', 'cada_3_semanas', 'mensual'];
export const PROGRESS_STATES = ['mejoro', 'se_mantiene', 'a_cuidar'];
const MAX_PLAN = 6;
const MAX_ROUTINE = 600;
const invalid = () => { throw new Error('invalid_review'); };
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const onlyKeys = (obj, keys) => { if (!isObject(obj) || Object.keys(obj).some(k => !keys.includes(k))) invalid(); };

function realDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = m.slice(1).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function normalizeApprovalExtras(extras = {}, { services, zones }) {
  onlyKeys(extras ?? {}, ['plan', 'homeRoutine', 'nextVisitWeek', 'zoneProgress']);
  const { plan = [], homeRoutine = null, nextVisitWeek = null, zoneProgress = {} } = extras ?? {};

  if (!Array.isArray(plan) || plan.length > MAX_PLAN) invalid();
  const normalizedPlan = plan.map((item) => {
    onlyKeys(item, ['serviceId', 'cadence']);
    const service = services.find(s => s.id === item.serviceId);
    if (!service || !CADENCES.includes(item.cadence)) invalid();
    const price = Number(service.price);
    if (!Number.isFinite(price)) invalid();
    return { serviceId: service.id, name: service.name, price, durationMinutes: service.durationMinutes, cadence: item.cadence };
  });

  let routine = null;
  if (homeRoutine !== null) {
    onlyKeys(homeRoutine, ['morning', 'night']);
    const text = (v) => { if (v === undefined || v === null) return ''; if (typeof v !== 'string') invalid(); const t = v.trim(); if (t.length > MAX_ROUTINE) invalid(); return t; };
    const morning = text(homeRoutine.morning);
    const night = text(homeRoutine.night);
    if (morning || night) routine = { morning, night };
  }

  if (nextVisitWeek !== null && (typeof nextVisitWeek !== 'string' || !realDate(nextVisitWeek))) invalid();

  if (!isObject(zoneProgress)) invalid();
  for (const [zone, state] of Object.entries(zoneProgress)) if (!zones.includes(zone) || !PROGRESS_STATES.includes(state)) invalid();

  return { plan: normalizedPlan, homeRoutine: routine, nextVisitWeek, zoneProgress: { ...zoneProgress } };
}
