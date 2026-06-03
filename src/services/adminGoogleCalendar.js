// src/services/adminGoogleCalendar.js
//
// OAuth2 Google Calendar POR ADMIN.
// Coexiste con googleCalendarOAuth.js (que es singleton id=1) y con
// googleCalendarService.js (Service Account legacy con calendarOwner1/2).
//
// Cada admin (recepcionista/admin) puede conectar su propio Gmail y recibir
// los eventos de las citas que se le ASIGNEN manualmente en el form Nueva Cita.
//
// El callback de OAuth reusa la misma redirect URI del legacy
// (GOOGLE_REDIRECT_URI) — se distingue por el parámetro `state`.
// Si state = "adm_<adminId>" → este módulo. Sin state → legacy singleton.
//
import { google } from 'googleapis';
import { prisma } from '../db/index.js';

// ─────────────────────────────────────────────
//  Cliente OAuth2 base (mismas credenciales que el legacy)
// ─────────────────────────────────────────────
function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// ─────────────────────────────────────────────
//  1. URL de autorización para un admin específico
// ─────────────────────────────────────────────
export function getAuthUrlForAdmin(adminId) {
  if (!adminId) throw new Error('adminId requerido para getAuthUrlForAdmin');
  const client = buildOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'consent',
    // state identifica al admin destinatario. El callback (compartido con el
    // singleton legacy) lo lee para enrutar al módulo correcto.
    state: `adm_${adminId}`,
    // include_granted_scopes evita que Google ignore nuestros scopes si ya
    // hay un consent previo de la misma app para esta cuenta Google.
    include_granted_scopes: true,
  });
}

// ─────────────────────────────────────────────
//  2. Callback: code → tokens → upsert AdminGoogleCalendar
// ─────────────────────────────────────────────
export async function handleAdminCallback(code, adminId) {
  if (!adminId) throw new Error('adminId requerido para handleAdminCallback');
  const client = buildOAuthClient();
  const { tokens } = await client.getToken(code);

  // Obtener el email de la cuenta Gmail conectada (puede diferir del email del admin)
  let connectedEmail = null;
  try {
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const info = await oauth2.userinfo.get();
    connectedEmail = info?.data?.email || null;
  } catch (e) {
    console.warn('[AdminGCal] No se pudo leer userinfo.email:', e.message);
  }

  await prisma.adminGoogleCalendar.upsert({
    where: { adminId },
    create: {
      adminId,
      email: connectedEmail || '',
      refreshToken: tokens.refresh_token || '',
      accessToken: tokens.access_token || null,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      isConnected: true,
    },
    update: {
      // Solo sobrescribe refresh_token si llega uno nuevo (Google a veces lo omite)
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      ...(connectedEmail ? { email: connectedEmail } : {}),
      accessToken: tokens.access_token || null,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      isConnected: true,
    },
  });

  console.log(`[AdminGCal] ✅ Tokens guardados para admin ${adminId} (${connectedEmail || 'email desconocido'})`);
  return { email: connectedEmail };
}

// ─────────────────────────────────────────────
//  3. Estado de la conexión por admin
// ─────────────────────────────────────────────
export async function getStatusForAdmin(adminId) {
  const cfg = await prisma.adminGoogleCalendar.findUnique({ where: { adminId } });
  return {
    connected: cfg?.isConnected ?? false,
    email:     cfg?.email ?? null,
    calendarId: cfg?.calendarId ?? 'primary',
    lastSyncAt: cfg?.lastSyncAt ?? null,
    tokenExpiry: cfg?.tokenExpiry ?? null,
  };
}

// ─────────────────────────────────────────────
//  4. Desconectar (revocar + borrar registro)
// ─────────────────────────────────────────────
export async function disconnectForAdmin(adminId) {
  const cfg = await prisma.adminGoogleCalendar.findUnique({ where: { adminId } });
  if (cfg?.accessToken) {
    try {
      const client = buildOAuthClient();
      client.setCredentials({ access_token: cfg.accessToken });
      await client.revokeCredentials();
    } catch (e) {
      console.warn('[AdminGCal] Revocación falló (puede estar expirado):', e.message);
    }
  }
  await prisma.adminGoogleCalendar.deleteMany({ where: { adminId } });
  console.log(`[AdminGCal] 🔌 Desconectado admin ${adminId}`);
}

// ─────────────────────────────────────────────
//  INTERNO: cliente autenticado con auto-refresh
// ─────────────────────────────────────────────
async function getAuthenticatedClientForAdmin(adminId) {
  const cfg = await prisma.adminGoogleCalendar.findUnique({ where: { adminId } });
  if (!cfg?.isConnected || !cfg?.refreshToken) {
    throw new Error(`Admin ${adminId} no tiene Gmail conectado.`);
  }

  const client = buildOAuthClient();
  client.setCredentials({
    refresh_token: cfg.refreshToken,
    access_token:  cfg.accessToken,
  });

  // Auto-renovación
  client.on('tokens', async (tokens) => {
    try {
      await prisma.adminGoogleCalendar.update({
        where: { adminId },
        data: {
          ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
          accessToken: tokens.access_token,
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      });
    } catch (e) {
      console.warn('[AdminGCal] no se pudo guardar refresh:', e.message);
    }
  });

  return { client, cfg };
}

// ─────────────────────────────────────────────
//  HELPERS (duplicados del legacy — código corto, no vale la pena refactor)
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

function calcEndTime(startTime, durationMinutes = 60) {
  const [h, m] = startTime.split(':').map(Number);
  const totalMin = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;
}

const STATUS_EMOJI = { pending: '🟡', scheduled: '🔵', confirmed: '🟢', rescheduling: '🟠', completed: '✅', cancelled: '❌', no_show: '🔴' };
const STATUS_LABEL = { pending: 'Pendiente', scheduled: 'Agendada', confirmed: 'Confirmada', rescheduling: 'Reagendando', completed: 'Completada', cancelled: 'Cancelada', no_show: 'No se presentó' };
const STATUS_COLORS = { pending: '5', scheduled: '9', confirmed: '10', rescheduling: '6', completed: '2', cancelled: '8', no_show: '11' };

// ─────────────────────────────────────────────
//  5. CREAR EVENTO en el calendar del admin
//     Retorna el googleEventId si OK, null si falla (no tira la cita).
// ─────────────────────────────────────────────
export async function createEventForAdmin(adminId, appointment) {
  try {
    const { client, cfg } = await getAuthenticatedClientForAdmin(adminId);
    const calendarId = cfg.calendarId || 'primary';
    const tz = process.env.TZ || 'America/Mexico_City';

    const dateStr = formatDateStr(appointment.date || appointment.appointment_date);
    const startTime = padTime(appointment.time || appointment.start_time);
    const endTime = padTime(appointment.endTime || appointment.end_time || calcEndTime(startTime, appointment.durationMinutes));

    const statusKey = appointment.status || 'scheduled';
    const event = {
      summary: `${STATUS_EMOJI[statusKey] || '🔵'} ${appointment.clientName || ''} — ${appointment.serviceName || 'Cita'}`,
      description: [
        `👤 Cliente: ${appointment.clientName || 'N/A'}`,
        `📱 Teléfono: ${appointment.clientPhone || 'N/A'}`,
        `💆 Servicio: ${appointment.serviceName || 'N/A'}`,
        `📋 Estado: ${STATUS_LABEL[statusKey] || statusKey}`,
        appointment.assignedAdminName ? `🧑‍💼 Atiende: ${appointment.assignedAdminName}` : null,
      ].filter(Boolean).join('\n'),
      start: { dateTime: `${dateStr}T${startTime}`, timeZone: tz },
      end:   { dateTime: `${dateStr}T${endTime}`,   timeZone: tz },
      colorId: STATUS_COLORS[statusKey] || '9',
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
    };

    const calApi = google.calendar({ version: 'v3', auth: client });
    const response = await calApi.events.insert({ calendarId, requestBody: event, sendUpdates: 'none' });
    const eventId = response.data.id;

    await prisma.adminGoogleCalendar.update({
      where: { adminId },
      data: { lastSyncAt: new Date() },
    });

    console.log(`[AdminGCal] ✅ Evento creado para admin ${adminId}: ${eventId}`);
    return eventId;
  } catch (err) {
    console.error(`[AdminGCal] Error creando evento para admin ${adminId}:`, err.message);
    return null; // no propagamos — la cita sigue siendo válida aunque falle el cal personal
  }
}

export default {
  getAuthUrlForAdmin,
  handleAdminCallback,
  getStatusForAdmin,
  disconnectForAdmin,
  createEventForAdmin,
};
