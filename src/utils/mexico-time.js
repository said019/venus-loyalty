// Helpers de fecha/hora centrados en la zona horaria Ciudad de México
// Evitar errores por timezone del servidor (Render, UTC)
const TIMEZONE = 'America/Mexico_City';

function formatearFechaLegible(fecha) {
    // Devuelve algo como: "27 de febrero"
    if (!fecha) return '';

    // Si es YYYY-MM-DD, construir fecha a mediodía para evitar corrimientos
    let dt;
    if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        dt = new Date(`${fecha}T12:00:00`);
    } else {
        dt = new Date(fecha);
    }

    const opts = { day: 'numeric', month: 'long', timeZone: TIMEZONE };
    const parts = new Intl.DateTimeFormat('es-MX', opts).formatToParts(dt);
    const day = parts.find(p => p.type === 'day')?.value || dt.getDate();
    const month = parts.find(p => p.type === 'month')?.value || '';
    return `${day} de ${month}`;
}

function formatearHora(dateTimeStr) {
    if (!dateTimeStr) return '';

    // Si ya es HH:MM
    if (typeof dateTimeStr === 'string' && /^\d{2}:\d{2}$/.test(dateTimeStr)) {
        return dateTimeStr;
    }

    const dt = (dateTimeStr instanceof Date) ? dateTimeStr : new Date(dateTimeStr);
    // Usar formato 24h sin AM/PM
    const opts = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIMEZONE };
    return new Intl.DateTimeFormat('es-MX', opts).format(dt);
}

function extractDateAndTime(isoString) {
    // isoString puede ser '2026-02-27T16:00:00-06:00' o Date
    if (!isoString) return { date: null, time: null };
    const dt = (isoString instanceof Date) ? isoString : new Date(isoString);

    const dateOpts = { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TIMEZONE };
    const dateParts = new Intl.DateTimeFormat('en-CA', dateOpts).format(dt); // en-CA -> YYYY-MM-DD

    const time = formatearHora(dt);
    return { date: dateParts, time };
}

function toMexicoCityISO(date) {
    // Convierte Date a ISO con offset -06:00 (ej: 2026-02-27T16:00:00-06:00)
    const ts = date.getTime();
    const mexicoOffset = 6 * 60 * 60 * 1000;
    const localDate = new Date(ts - mexicoOffset);
    return localDate.toISOString().replace('Z', '-06:00');
}

export { formatearFechaLegible, formatearHora, extractDateAndTime };
