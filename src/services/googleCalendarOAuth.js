// src/services/googleCalendarOAuth.js
//
// Integración de Google Calendar vía OAuth2.
// Persiste los tokens en la tabla `google_calendar_config` (Prisma).
// Funciona en paralelo con el servicio existente de Service Account
// (googleCalendarService.js). Los endpoints de citas usan ambos si
// ambos están configurados, pero este toma prioridad cuando está
// conectado (is_connected = true).
//
import { google } from 'googleapis';
import { prisma } from '../db/index.js';

// ─────────────────────────────────────────────
//  Inicializar cliente OAuth2
// ─────────────────────────────────────────────
function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// ─────────────────────────────────────────────
//  1. URL de autorización → redirigir al admin
// ─────────────────────────────────────────────
export function getAuthUrl() {
  const client = buildOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    prompt: 'consent', // Siempre pide refresh_token
  });
}

// ─────────────────────────────────────────────
//  2. Callback: intercambiar code → tokens
// ─────────────────────────────────────────────
export async function handleCallback(code) {
  const client = buildOAuthClient();
  const { tokens } = await client.getToken(code);

  await prisma.googleCalendarConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      refreshToken: tokens.refresh_token || null,
      accessToken: tokens.access_token || null,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      isConnected: true,
    },
    update: {
      // Solo sobreescribe refresh_token si llega uno nuevo
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      accessToken: tokens.access_token || null,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      isConnected: true,
      updatedAt: new Date(),
    },
  });

  console.log('[GCal OAuth] ✅ Tokens guardados en BD');
  return tokens;
}

// ─────────────────────────────────────────────
//  3. Estado de la conexión
// ─────────────────────────────────────────────
export async function getStatus() {
  const cfg = await prisma.googleCalendarConfig.findUnique({ where: { id: 1 } });
  return {
    connected: cfg?.isConnected ?? false,
    calendarId: cfg?.calendarId ?? 'primary',
    lastSyncAt: cfg?.lastSyncAt ?? null,
    tokenExpiry: cfg?.tokenExpiry ?? null,
  };
}

// ─────────────────────────────────────────────
//  4. Desconectar (revocar + borrar tokens)
// ─────────────────────────────────────────────
export async function disconnect() {
  const cfg = await prisma.googleCalendarConfig.findUnique({ where: { id: 1 } });
  if (cfg?.accessToken) {
    try {
      const client = buildOAuthClient();
      client.setCredentials({ access_token: cfg.accessToken });
      await client.revokeCredentials();
    } catch (e) {
      // Si ya expiró el token la revocación puede fallar — no es bloqueante
      console.warn('[GCal OAuth] Revocación de token falló (puede ya estar expirado):', e.message);
    }
  }

  await prisma.googleCalendarConfig.upsert({
    where: { id: 1 },
    create: { id: 1, isConnected: false },
    update: {
      isConnected: false,
      refreshToken: null,
      accessToken: null,
      tokenExpiry: null,
      updatedAt: new Date(),
    },
  });

  console.log('[GCal OAuth] 🔌 Desconectado');
}

// ─────────────────────────────────────────────
//  INTERNO: Cargar credenciales y auto-refrescar
// ─────────────────────────────────────────────
async function getAuthenticatedClient() {
  const cfg = await prisma.googleCalendarConfig.findUnique({ where: { id: 1 } });

  if (!cfg?.isConnected || !cfg?.refreshToken) {
    throw new Error('Google Calendar OAuth no está conectado. Ve a /api/admin/calendar/auth para autorizar.');
  }

  const client = buildOAuthClient();
  client.setCredentials({
    refresh_token: cfg.refreshToken,
    access_token: cfg.accessToken,
  });

  // Escuchar tokens nuevos (auto-renovación)
  client.on('tokens', async (tokens) => {
    console.log('[GCal OAuth] 🔄 Tokens renovados automáticamente');
    await prisma.googleCalendarConfig.update({
      where: { id: 1 },
      data: {
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        accessToken: tokens.access_token,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        updatedAt: new Date(),
      },
    });
  });

  return client;
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function formatDateStr(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.split('T')[0];
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value);
}

function padTime(t) {
  if (!t) return '00:00:00';
  return t.length === 5 ? t + ':00' : t;
}

// Prefijo emoji según status — visible en la vista de Google Calendar
const STATUS_EMOJI = {
  pending:      '🟡',
  scheduled:    '🔵',
  confirmed:    '🟢',
  rescheduling: '🟠',
  completed:    '✅',
  cancelled:    '❌',
  no_show:      '🔴',
};

function emojiForStatus(status) {
  return STATUS_EMOJI[status] ?? '🔵';
}

// Etiqueta legible en español
const STATUS_LABEL = {
  pending:      'Pendiente',
  scheduled:    'Agendada',
  confirmed:    'Confirmada',
  rescheduling: 'Reagendando',
  completed:    'Completada',
  cancelled:    'Cancelada',
  no_show:      'No se presentó',
};

// Colores de Google Calendar:
//  1  = Lavanda (morado claro)      7  = Pavo real (cian oscuro)
//  2  = Salvia (verde grisáceo)     8  = Grafito (gris)
//  3  = Uva (morado)                9  = Arándano (azul oscuro)
//  4  = Flamenco (naranja rojizo)  10  = Albahaca (verde oscuro)
//  5  = Banana (amarillo)          11  = Tomate (rojo)
//  6  = Mandarina (naranja)
const STATUS_COLORS = {
  pending:      '5',   // 🟡 Banana  — solicitud pendiente de aprobar
  scheduled:    '9',   // 🔵 Arándano — cita agendada (confirmada por admin)
  confirmed:    '10',  // 🟢 Albahaca — confirmada por la clienta
  rescheduling: '6',   // 🟠 Mandarina — pidió reagendar
  completed:    '2',   // 🌿 Salvia  — servicio realizado
  cancelled:    '8',   // ⬛ Grafito  — cancelada
  no_show:      '11',  // 🔴 Tomate  — no se presentó
};

function colorForStatus(status) {
  return STATUS_COLORS[status] ?? STATUS_COLORS['scheduled'];
}

// ─────────────────────────────────────────────
//  5. CREAR EVENTO
// ─────────────────────────────────────────────
export async function createEvent(appointment) {
  const authClient = await getAuthenticatedClient();
  const calCfg = await prisma.googleCalendarConfig.findUnique({ where: { id: 1 } });
  const calendarId = calCfg?.calendarId || process.env.GOOGLE_CALENDAR_ID || 'primary';
  const tz = process.env.TZ || 'America/Mexico_City';

  const dateStr = formatDateStr(appointment.date || appointment.appointment_date);
  const startTime = padTime(appointment.time || appointment.start_time);
  const endTime = padTime(appointment.endTime || appointment.end_time || _calcEndTime(startTime, appointment.durationMinutes));

  const event = {
    summary: `${emojiForStatus(appointment.status)} ${appointment.clientName || appointment.client_name} — ${appointment.serviceName || appointment.service_name || 'Cita'}`,
    description: [
      `👤 Cliente: ${appointment.clientName || appointment.client_name || 'N/A'}`,
      `📱 Teléfono: ${appointment.clientPhone || appointment.client_phone || 'N/A'}`,
      `💆 Servicio: ${appointment.serviceName || appointment.service_name || 'N/A'}`,
      `📋 Estado: ${STATUS_LABEL[appointment.status] || appointment.status || 'Agendada'}`,
    ].join('\n'),
    start: { dateTime: `${dateStr}T${startTime}`, timeZone: tz },
    end:   { dateTime: `${dateStr}T${endTime}`,   timeZone: tz },
    colorId: colorForStatus(appointment.status),
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
  };

  const calApi = google.calendar({ version: 'v3', auth: authClient });
  const response = await calApi.events.insert({ calendarId, requestBody: event, sendUpdates: 'none' });
  const googleEventId = response.data.id;

  // Persistir mapeo
  if (appointment.id) {
    await prisma.googleCalendarMapping.upsert({
      where: { googleEventId },
      create: {
        appointmentId: appointment.id,
        googleEventId,
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
      },
      update: {
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
      },
    });
  }

  // Actualizar last_sync_at en config
  await prisma.googleCalendarConfig.update({ where: { id: 1 }, data: { lastSyncAt: new Date() } });

  console.log(`[GCal OAuth] ✅ Evento creado: ${googleEventId}`);
  return googleEventId;
}

// ─────────────────────────────────────────────
//  6. ACTUALIZAR EVENTO
// ─────────────────────────────────────────────
export async function updateEvent(appointmentId, appointment) {
  // Si se cancela → pintar de gris en vez de eliminar (queda en historial)
  // La eliminación real ocurre solo desde deleteEvent() al borrar la cita de la BD
  const authClient = await getAuthenticatedClient();
  const calCfg = await prisma.googleCalendarConfig.findUnique({ where: { id: 1 } });
  const calendarId = calCfg?.calendarId || process.env.GOOGLE_CALENDAR_ID || 'primary';
  const tz = process.env.TZ || 'America/Mexico_City';

  // Buscar mapeo existente
  const mapping = await prisma.googleCalendarMapping.findFirst({
    where: { appointmentId },
  });

  // Si no existe, crear
  if (!mapping) {
    return await createEvent({ ...appointment, id: appointmentId });
  }

  const eventId = mapping.googleEventId;
  const dateStr = formatDateStr(appointment.date || appointment.appointment_date);
  const startTime = padTime(appointment.time || appointment.start_time);
  const endTime = padTime(appointment.endTime || appointment.end_time || _calcEndTime(startTime, appointment.durationMinutes));

  const event = {
    summary: `${emojiForStatus(appointment.status)} ${appointment.clientName || appointment.client_name} — ${appointment.serviceName || appointment.service_name || 'Cita'}`,
    description: [
      `👤 Cliente: ${appointment.clientName || appointment.client_name || 'N/A'}`,
      `📱 Teléfono: ${appointment.clientPhone || appointment.client_phone || 'N/A'}`,
      `💆 Servicio: ${appointment.serviceName || appointment.service_name || 'N/A'}`,
      `📋 Estado: ${STATUS_LABEL[appointment.status] || appointment.status || 'Agendada'}`,
    ].join('\n'),
    start: { dateTime: `${dateStr}T${startTime}`, timeZone: tz },
    end:   { dateTime: `${dateStr}T${endTime}`,   timeZone: tz },
    colorId: colorForStatus(appointment.status),
  };

  try {
    const calApi = google.calendar({ version: 'v3', auth: authClient });
    await calApi.events.patch({ calendarId, eventId, requestBody: event, sendUpdates: 'none' });

    await prisma.googleCalendarMapping.update({
      where: { id: mapping.id },
      data: { syncStatus: 'synced', lastSyncedAt: new Date(), errorMessage: null },
    });
    await prisma.googleCalendarConfig.update({ where: { id: 1 }, data: { lastSyncAt: new Date() } });

    console.log(`[GCal OAuth] ✅ Evento actualizado: ${eventId}`);
  } catch (err) {
    if (err.code === 404 || err.status === 404) {
      // El evento fue borrado manualmente en Google → recrear
      console.warn(`[GCal OAuth] Evento ${eventId} no encontrado en Google, recreando...`);
      await prisma.googleCalendarMapping.delete({ where: { id: mapping.id } });
      return await createEvent({ ...appointment, id: appointmentId });
    }

    // Guardar error en el mapeo pero no tirar la cita
    await prisma.googleCalendarMapping.update({
      where: { id: mapping.id },
      data: { syncStatus: 'failed', errorMessage: err.message },
    }).catch(() => {});
    throw err;
  }
}

// ─────────────────────────────────────────────
//  7. ELIMINAR EVENTO
// ─────────────────────────────────────────────
export async function deleteEvent(appointmentId) {
  const mapping = await prisma.googleCalendarMapping.findFirst({
    where: { appointmentId },
  });

  if (!mapping) {
    console.log(`[GCal OAuth] Sin mapeo para cita ${appointmentId}, nada que eliminar`);
    return;
  }

  try {
    const authClient = await getAuthenticatedClient();
    const calCfg = await prisma.googleCalendarConfig.findUnique({ where: { id: 1 } });
    const calendarId = calCfg?.calendarId || process.env.GOOGLE_CALENDAR_ID || 'primary';
    const calApi = google.calendar({ version: 'v3', auth: authClient });

    await calApi.events.delete({ calendarId, eventId: mapping.googleEventId, sendUpdates: 'none' });
    console.log(`[GCal OAuth] 🗑️ Evento eliminado: ${mapping.googleEventId}`);
  } catch (err) {
    if (err.code === 404 || err.status === 404 || err.code === 410) {
      console.warn(`[GCal OAuth] Evento ya no existe en Google (${mapping.googleEventId}), limpiando mapeo`);
    } else {
      console.error('[GCal OAuth] Error eliminando evento:', err.message);
    }
  } finally {
    // Siempre limpiar el mapeo local
    await prisma.googleCalendarMapping.delete({ where: { id: mapping.id } }).catch(() => {});
  }
}

// ─────────────────────────────────────────────
//  8. SYNC MASIVO (re-sincronizar citas activas)
// ─────────────────────────────────────────────
export async function syncAllActive() {
  const today = new Date().toISOString().split('T')[0];

  const appointments = await prisma.appointment.findMany({
    where: {
      date: { gte: today },
      status: { notIn: ['cancelled'] },
    },
    take: 200,
  });

  let created = 0, updated = 0, failed = 0;

  for (const appt of appointments) {
    try {
      const existing = await prisma.googleCalendarMapping.findFirst({
        where: { appointmentId: appt.id },
      });

      if (existing) {
        await updateEvent(appt.id, appt);
        updated++;
      } else {
        await createEvent(appt);
        created++;
      }
    } catch (err) {
      console.error(`[GCal OAuth] Sync falló para cita ${appt.id}:`, err.message);
      failed++;
    }
  }

  return { total: appointments.length, created, updated, failed };
}

// ─────────────────────────────────────────────
//  9. FREEBUSY: consultar horarios ocupados
// ─────────────────────────────────────────────
export async function getFreeBusy(dateStr) {
  try {
    const authClient = await getAuthenticatedClient();
    const calCfg = await prisma.googleCalendarConfig.findUnique({ where: { id: 1 } });
    const calendarId = calCfg?.calendarId || process.env.GOOGLE_CALENDAR_ID || 'primary';
    const tz = 'America/Mexico_City';

    const timeMin = `${dateStr}T00:00:00-06:00`;
    const timeMax = `${dateStr}T23:59:59-06:00`;

    const calApi = google.calendar({ version: 'v3', auth: authClient });
    const response = await calApi.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        timeZone: tz,
        items: [{ id: calendarId }],
      },
    });

    const busySlots = [];
    const calendars = response.data.calendars || {};
    const busyPeriods = calendars[calendarId]?.busy || [];

    for (const period of busyPeriods) {
      const start = new Date(period.start);
      const end = new Date(period.end);

      // Convertir a hora local de México (UTC-6)
      const startLocal = new Date(start.toLocaleString('en-US', { timeZone: tz }));
      const endLocal = new Date(end.toLocaleString('en-US', { timeZone: tz }));

      // Generar slots ocupados en intervalos de 30 min dentro del rango
      let current = new Date(startLocal);
      while (current < endLocal) {
        const h = current.getHours();
        const m = current.getMinutes();
        const slot = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        if (!busySlots.includes(slot)) {
          busySlots.push(slot);
        }
        current = new Date(current.getTime() + 30 * 60000);
      }
    }

    console.log(`[GCal OAuth] FreeBusy ${dateStr}: ${busySlots.length} slots ocupados`);
    return busySlots;
  } catch (err) {
    console.warn(`[GCal OAuth] FreeBusy falló (${err.message}), continuando sin datos de calendario`);
    return [];
  }
}

// ─────────────────────────────────────────────
//  HELPER PRIVADO: calcular hora de fin
// ─────────────────────────────────────────────
function _calcEndTime(startTime, durationMinutes = 60) {
  const [h, m] = startTime.split(':').map(Number);
  const totalMin = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;
}

export default { getAuthUrl, handleCallback, getStatus, disconnect, createEvent, updateEvent, deleteEvent, syncAllActive, getFreeBusy };
