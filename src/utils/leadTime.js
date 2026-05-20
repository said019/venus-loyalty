// src/utils/leadTime.js
//
// Regla de anticipación para solicitudes de cita en línea.
//
// - Slot ≥ 18:00 hora MX → requiere ≥ 8 horas de anticipación
// - Slot <  18:00 hora MX → requiere ≥ 1 hora de anticipación
// - Slots en fecha posterior a hoy (MX) siempre cumplen (no se calcula diferencia).
//
// La función es **pura**: no lee el reloj ni el TZ del proceso. El caller
// pasa `now` (en backend es `new Date()`; en tests, un Date fijo). El slot
// se construye con offset fijo -06:00 (CDMX sin DST desde 2022), así que
// el resultado no depende de dónde corra el server.
//
// Devuelve { ok: boolean, reason?, hoursRequired?, hoursActual?, branch? }
// donde branch es 'evening' | 'day' | 'future' | 'past_or_invalid'.

import { todayMexicoStr } from './mexico-time.js';

export const LEAD_TIME_RULE = Object.freeze({
    eveningCutoffHour: 18, // hora MX a partir de la cual aplica la regla "tarde"
    eveningMinHours: 8,
    dayMinHours: 1,
});

/**
 * Mensaje en español para mostrar a la clienta.
 * @param {'evening'|'day'} branch
 */
export function leadTimeErrorMessage(branch) {
    if (branch === 'evening') {
        return 'Las citas a partir de las 6:00 PM deben solicitarse con al menos 8 horas de anticipación. Por favor elige otro horario o un día posterior.';
    }
    return 'Las citas deben solicitarse con al menos 1 hora de anticipación. Por favor elige un horario más tarde o un día posterior.';
}

/**
 * Valida el lead time de un slot solicitado.
 * @param {object} params
 * @param {string} params.date  - 'YYYY-MM-DD' (hora local MX)
 * @param {string} params.time  - 'HH:MM' (24h, hora local MX)
 * @param {Date}   [params.now] - default new Date(); inyectable para tests
 * @returns {{ ok:boolean, reason?:string, branch:string, hoursRequired?:number, hoursActual?:number }}
 */
export function validateLeadTime({ date, time, now = new Date() }) {
    // 1. Formato básico
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) {
        return { ok: false, branch: 'past_or_invalid', reason: 'Formato de fecha u hora inválido.' };
    }

    // 2. Si la fecha es estrictamente posterior a hoy MX, lead time no aplica.
    const todayMX = todayMexicoStr();
    if (date > todayMX) {
        return { ok: true, branch: 'future' };
    }

    // 3. Detectar rama por la hora del slot (es hora local MX, leerla literal)
    const slotHour = parseInt(time.split(':')[0], 10);
    const isEvening = slotHour >= LEAD_TIME_RULE.eveningCutoffHour;
    const required = isEvening ? LEAD_TIME_RULE.eveningMinHours : LEAD_TIME_RULE.dayMinHours;
    const branch = isEvening ? 'evening' : 'day';

    // 4. Construir el instante del slot con offset fijo -06:00 (CDMX sin DST).
    const slotMs = new Date(`${date}T${time}:00-06:00`).getTime();
    if (!Number.isFinite(slotMs)) {
        return { ok: false, branch: 'past_or_invalid', reason: 'Fecha u hora inválida.' };
    }
    const diffHours = (slotMs - now.getTime()) / 3_600_000;

    if (diffHours >= required) {
        return { ok: true, branch, hoursRequired: required, hoursActual: diffHours };
    }
    return {
        ok: false,
        branch,
        hoursRequired: required,
        hoursActual: diffHours,
        reason: leadTimeErrorMessage(branch),
    };
}
