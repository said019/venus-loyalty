// server.js - COMPLETO CON TODAS LAS CORRECCIONES APPLICADAS
import express from "express";
import cors from "cors";
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendGoogleMessage } from "./lib/google.js"
import nodemailer from "nodemailer";
import fs from "fs";
import { firestore } from "./lib/firebase.js";
import {
  sendMassPushNotification,
  sendTestPushNotification,
  getNotifications,
} from "./lib/api/push.js";
// Wallet helpers
import {
  buildGoogleSaveUrl,
  checkLoyaltyClass,
  createLoyaltyClass,
  updateLoyaltyObject,
} from "./lib/google.js";
import { buildApplePassBuffer } from "./lib/apple.js";

// Handlers Google Wallet
import {
  createClassHandler,
  diagnosticsHandler,
  testHandler,
  saveCardHandler,
} from "./lib/api/google.js";

// Admin auth helpers
import {
  adminAuth,
  signAdmin,
  setAdminCookie,
  clearAdminCookie,
} from "./lib/auth.js";

// 🍎 Apple Wallet Web Service
import appleWebService from './lib/apple-webservice.js';

// 📅 Appointments Module
import appointmentsRouter from './src/routes/api.js';
import { startScheduler } from './src/scheduler/cron.js';
import calendarRoutes from './src/routes/calendarRoutes.js';


// __dirname para ESModules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================================================
   DATA LAYER FIRESTORE (reemplaza todo lo de SQLite)
   ========================================================= */

if (!firestore) {
  console.error("❌ Firestore NO está inicializado. Revisa lib/firebase.js");
}

const COL_CARDS = "cards";
const COL_EVENTS = "events";
const COL_ADMINS = "admins";
const COL_RESETS = "admin_resets";
const COL_DEVICES = "apple_devices";
const COL_UPDATES = "apple_updates";

// ⭐ NUEVO: Constante para dispositivos Google
const COL_GOOGLE_DEVICES = "google_devices";

// ⭐ NUEVO: Constante para gift cards
const COL_GIFT_HISTORY = "gift_card_redeems";

// ---------- HELPERS ADMIN ----------

async function fsCountAdmins() {
  const snap = await firestore.collection(COL_ADMINS).get();
  return snap.size;
}

async function fsGetAdminByEmail(email) {
  const snap = await firestore
    .collection(COL_ADMINS)
    .where("email", "==", email)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function fsInsertAdmin({ id, email, pass_hash }) {
  const now = new Date().toISOString();
  await firestore.collection(COL_ADMINS).doc(id).set({
    id,
    email,
    pass_hash,
    createdAt: now,
    updatedAt: now,
  });
}

async function fsUpdateAdminPassword(adminId, pass_hash) {
  const now = new Date().toISOString();
  await firestore.collection(COL_ADMINS).doc(adminId).set(
    {
      pass_hash,
      updatedAt: now,
    },
    { merge: true }
  );
}

// ---------- HELPERS RESET PASSWORD ----------

async function fsCreateResetToken({ token, adminId, email, expiresAt }) {
  await firestore.collection(COL_RESETS).doc(token).set({
    token,
    adminId,
    email,
    expiresAt,
  });
}

async function fsGetResetToken(token) {
  const snap = await firestore.collection(COL_RESETS).doc(token).get();
  return snap.exists ? snap.data() : null;
}

async function fsDeleteResetToken(token) {
  await firestore.collection(COL_RESETS).doc(token).delete();
}

// ---------- HELPERS CARDS + EVENTS ----------

async function fsCreateCard({ id, name, phone, birthdate, max }) {
  const now = new Date().toISOString();
  const doc = {
    id,
    name,
    phone: phone || null,
    birthdate: birthdate || null,
    max,
    stamps: 0,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  await firestore.collection(COL_CARDS).doc(id).set(doc);
  return doc;
}

async function fsGetCard(cardId) {
  const snap = await firestore.collection(COL_CARDS).doc(cardId).get();
  return snap.exists ? snap.data() : null;
}

async function fsUpdateCard(cardId, data) {
  const now = new Date().toISOString();
  await firestore.collection(COL_CARDS).doc(cardId).set(
    {
      ...data,
      updatedAt: now,
    },
    { merge: true }
  );
  const snap = await firestore.collection(COL_CARDS).doc(cardId).get();
  return snap.data();
}

async function fsUpdateCardStamps(cardId, stamps) {
  return fsUpdateCard(cardId, { stamps });
}

async function fsAddEvent(cardId, type, meta = {}) {
  await firestore.collection(COL_EVENTS).add({
    cardId,
    type,
    meta,
    createdAt: new Date().toISOString(),
  });
}

async function fsListEvents(cardId) {
  const snap = await firestore
    .collection(COL_EVENTS)
    .where("cardId", "==", cardId)
    .orderBy("createdAt", "desc")
    .get();

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

async function fsGetLastStampDate(cardId) {
  const snap = await firestore
    .collection(COL_EVENTS)
    .where("cardId", "==", cardId)
    .where("type", "==", "STAMP")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data().createdAt || null;
}

// equivalente al canStamp original pero con Firestore
async function canStamp(cardId) {
  const last = await fsGetLastStampDate(cardId);
  if (!last) return true;
  const lastDate = new Date(last);
  const now = new Date();
  const diffMs = now - lastDate;
  return diffMs >= 23 * 60 * 60 * 1000; // ~23h
}

async function fsDeleteCard(cardId) {
  const ref = firestore.collection(COL_CARDS).doc(cardId);
  const snap = await ref.get();
  if (!snap.exists) return false;

  await ref.delete();

  const evSnap = await firestore
    .collection(COL_EVENTS)
    .where("cardId", "==", cardId)
    .get();

  if (!evSnap.empty) {
    const batch = firestore.batch();
    evSnap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
  return true;
}

// ---------- LISTADO / MÉTRICAS ----------

async function fsListCardsPage({ page = 1, limit = 12, q = "", sortBy = "createdAt", sortOrder = "desc" }) {
  const offset = (page - 1) * limit;
  const like = q.trim().toLowerCase();

  // Total
  const allSnap = await firestore.collection(COL_CARDS).get();
  const allDocs = allSnap.docs;

  const filtered = like
    ? allDocs.filter((d) => {
      const c = d.data();
      const id = (c.id || "").toLowerCase();
      const name = (c.name || "").toLowerCase();
      const phone = (c.phone || "").toLowerCase();
      const birthdate = (c.birthdate || "").toLowerCase();
      return (
        id.includes(like) || name.includes(like) || phone.includes(like) || birthdate.includes(like)
      );
    })
    : allDocs;

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Aplicar ordenamiento
  const sorted = filtered.sort((a, b) => {
    const ca = a.data();
    const cb = b.data();

    let aValue, bValue;

    switch (sortBy) {
      case "name":
        aValue = (ca.name || "").toLowerCase();
        bValue = (cb.name || "").toLowerCase();
        break;
      case "phone":
        aValue = ca.phone || "";
        bValue = cb.phone || "";
        break;
      case "birthdate":
        aValue = ca.birthdate || "";
        bValue = cb.birthdate || "";
        break;
      case "stamps":
        aValue = ca.stamps || 0;
        bValue = cb.stamps || 0;
        break;
      case "max":
        aValue = ca.max || 0;
        bValue = cb.max || 0;
        break;
      case "createdAt":
      default:
        aValue = ca.createdAt || "";
        bValue = cb.createdAt || "";
        break;
    }

    // Comparar según el tipo de dato
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
    } else {
      // Para strings y fechas
      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    }
  });

  const slice = sorted
    .slice(offset, offset + limit)
    .map((d) => d.data());

  return { page, totalPages, total, items: slice, sortBy, sortOrder };
}

async function fsMetrics() {
  const cardsSnap = await firestore.collection(COL_CARDS).get();
  let total = cardsSnap.size;
  let full = 0;

  cardsSnap.forEach((doc) => {
    const c = doc.data();
    if ((c.stamps || 0) >= (c.max || 0)) full++;
  });

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();

  const evSnap = await firestore
    .collection(COL_EVENTS)
    .where("createdAt", ">=", startIso)
    .get();

  const counts = { STAMP: 0, REDEEM: 0 };
  evSnap.forEach((doc) => {
    const t = doc.data().type;
    if (t === "STAMP") counts.STAMP++;
    if (t === "REDEEM") counts.REDEEM++;
  });

  return {
    total,
    full,
    stampsToday: counts.STAMP,
    redeemsToday: counts.REDEEM,
  };
}

// ⭐ NUEVO: Funciones para dispositivos Google
async function fsRegisterGoogleDevice(cardId, deviceId) {
  try {
    const deviceKey = `google_${cardId}_${deviceId}`;
    await firestore.collection(COL_GOOGLE_DEVICES).doc(deviceKey).set({
      card_id: cardId,
      device_id: deviceId,
      platform: 'android',
      registered_at: new Date().toISOString(),
      last_active: new Date().toISOString()
    });
    console.log(`[GOOGLE DEVICE] ✅ Dispositivo registrado: ${deviceId}`);
  } catch (error) {
    console.error('[GOOGLE DEVICE] Error registrando:', error);
    throw error;
  }
}

async function fsGetGoogleDevicesByCard(cardId) {
  try {
    const snap = await firestore
      .collection(COL_GOOGLE_DEVICES)
      .where('card_id', '==', cardId)
      .get();

    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('[GOOGLE DEVICE] Error obteniendo dispositivos:', error);
    return [];
  }
}

/* =========================================================
   APP base
   ========================================================= */
const app = express();
app.set("trust proxy", true);

// ========== MIDDLEWARES GLOBALES ==========
app.use(cors({ origin: true, credentials: true }));
// ✅ 1. BODY PARSERS PRIMERO (antes de cualquier middleware que use req.body)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("public"));

// ✅ Appointments API
app.use('/api', appointmentsRouter);

// ✅ Calendar API
app.use('/api/calendar', calendarRoutes);

// ✅ Start Scheduler
startScheduler();

/* =========================================================
   🍎 DECODIFICAR APNs KEY DE BASE64 (para Render)
   ========================================================= */
if (process.env.APPLE_APNS_KEY_BASE64 && !process.env.APPLE_APNS_KEY_PATH) {
  try {
    const keyContent = Buffer.from(process.env.APPLE_APNS_KEY_BASE64, 'base64').toString('utf8');
    const tempPath = '/tmp/apns-key.p8';
    fs.writeFileSync(tempPath, keyContent);
    process.env.APPLE_APNS_KEY_PATH = tempPath;
    console.log('[APPLE APNs] ✅ Key decodificada desde base64');
  } catch (e) {
    console.error('[APPLE APNs] ❌ Error decodificando key:', e);
  }
}


/* =========================================================
   📧 Envío de correos
   ========================================================= */
async function sendMail({ to, subject, text, html }) {
  if (process.env.RESEND_API_KEY) {
    const from = process.env.RESEND_FROM || "Venus Admin <onboarding@resend.dev>";
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        text,
        html,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("[Resend Error]", data);
      throw new Error(`Resend API ${resp.status}: ${JSON.stringify(data)}`);
    }
    return { channel: "resend", id: data?.id || null };
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) {
    throw new Error("No hay SMTP operativo ni RESEND_API_KEY configurada");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  const from = process.env.SMTP_FROM || `Venus Admin <${process.env.SMTP_USER}>`;
  const info = await transporter.sendMail({ from, to, subject, text, html });
  return { channel: "smtp", id: info?.messageId || null };
}

/* =========================================================
   BASIC AUTH (staff)
   ========================================================= */
function basicAuth(req, res, next) {
  const hdr = req.headers.authorization || "";
  if (!hdr.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="Staff"');
    return res.status(401).send("Auth required");
  }
  const b64 = hdr.split(" ")[1] || "";
  const [user, pass] = Buffer.from(b64, "base64").toString().split(":");
  if (user === process.env.STAFF_USER && pass === process.env.STAFF_PASS)
    return next();
  res.set("WWW-Authenticate", 'Basic realm="Staff"');
  return res.status(401).send("Invalid credentials");
}

/* =========================================================
   Páginas HTML
   ========================================================= */
app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.get("/admin-login.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-login.html"));
});
app.get("/staff.html", basicAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "staff.html"));
});

/* =========================================================
   RUTAS GOOGLE WALLET
   ========================================================= */
app.get("/api/google/create-class", createClassHandler);
app.get("/api/google/diagnostics", diagnosticsHandler);
app.get("/api/google/test", testHandler);
app.get("/api/save-card", saveCardHandler);

/* =========================================================
   🍎 APPLE WALLET WEB SERVICE ENDPOINTS - CORREGIDOS
   ========================================================= */
console.log('[APPLE] Configurando endpoints del web service...');

// ========== ENDPOINTS /v1 PARA APPLE (SIN MIDDLEWARE, CON AUTH INLINE) ==========
app.post('/v1/devices/:deviceId/registrations/:passTypeId/:serial',
  appleWebService.registerDeviceHandler
);

app.get('/v1/devices/:deviceId/registrations/:passTypeId',
  appleWebService.getUpdatablePassesHandler
);

app.get('/v1/passes/:passTypeId/:serial',
  appleWebService.getLatestPassHandler
);

app.delete('/v1/devices/:deviceId/registrations/:passTypeId/:serial',
  appleWebService.unregisterDeviceHandler
);

app.post('/v1/log',
  appleWebService.logHandler
);

console.log('[APPLE] ✅ Endpoints Apple configurados correctamente');


/* =========================================================
   DEBUG ENDPOINTS - MEJORADOS
   ========================================================= */
app.get("/api/debug/google-class", async (_req, res) => {
  try {
    const info = await checkLoyaltyClass();
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/debug/apple-apns', (req, res) => {
  res.json({
    configured: {
      keyId: !!process.env.APPLE_KEY_ID,
      teamId: !!process.env.APPLE_TEAM_ID,
      keyPath: !!process.env.APPLE_APNS_KEY_PATH,
      authToken: !!process.env.APPLE_AUTH_TOKEN,
      passTypeId: !!process.env.APPLE_PASS_TYPE_ID,
      baseUrl: !!process.env.BASE_URL
    },
    values: {
      keyId: process.env.APPLE_KEY_ID,
      teamId: process.env.APPLE_TEAM_ID,
      passTypeId: process.env.APPLE_PASS_TYPE_ID,
      webServiceUrl: process.env.BASE_URL + '/v1' // ✅ Cambiado a /v1
    }
  });
});

app.get('/api/debug/apple-devices', async (req, res) => {
  try {
    const devicesSnap = await firestore.collection(COL_DEVICES).get();
    const updatesSnap = await firestore
      .collection(COL_UPDATES)
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();

    const devices = devicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const recentUpdates = updatesSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    res.json({ devices, recentUpdates });
  } catch (e) {
    console.error("[APPLE DEBUG DEVICES]", e);
    res.status(500).json({ error: e.message });
  }
});

// ✅ NUEVO ENDPOINT PARA DEBUG DE RUTAS APPLE
app.get('/api/debug/apple-routes-test', async (req, res) => {
  const baseUrl = 'https://venus-loyalty.onrender.com';
  const testResults = [];

  // Test rutas /v1
  try {
    const testResponse = await fetch(`${baseUrl}/v1/devices/test-device-123/registrations/pass.com.venusloyalty.mx/test-card-123`, {
      method: 'POST',
      headers: {
        'Authorization': `ApplePass ${process.env.APPLE_AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pushToken: 'test-push-token-123' })
    });
    testResults.push({
      route: 'POST /v1/devices/.../registrations/...',
      status: testResponse.status,
      working: testResponse.status !== 404
    });
  } catch (error) {
    testResults.push({
      route: 'POST /v1/devices/.../registrations/...',
      error: error.message,
      working: false
    });
  }

  // Test rutas /api/apple/v1
  try {
    const testResponse = await fetch(`${baseUrl}/api/apple/v1/devices/test-device-123/registrations/pass.com.venusloyalty.mx/test-card-123`, {
      method: 'POST',
      headers: {
        'Authorization': `ApplePass ${process.env.APPLE_AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pushToken: 'test-push-token-123' })
    });
    testResults.push({
      route: 'POST /api/apple/v1/devices/.../registrations/...',
      status: testResponse.status,
      working: testResponse.status !== 404
    });
  } catch (error) {
    testResults.push({
      route: 'POST /api/apple/v1/devices/.../registrations/...',
      error: error.message,
      working: false
    });
  }

  res.json({ testResults });
});

app.get('/api/debug/apple-auth-config', (req, res) => {
  const authToken = process.env.APPLE_AUTH_TOKEN;

  res.json({
    appleAuthToken: {
      configured: !!authToken,
      value: authToken ? authToken.substring(0, 10) + '...' : 'NO CONFIGURADO',
      length: authToken ? authToken.length : 0
    },
    expectedHeader: `ApplePass ${authToken ? authToken.substring(0, 10) + '...' : '???'}`,
    recommendation: authToken ?
      '✅ Token configurado correctamente' :
      '❌ APPLE_AUTH_TOKEN no está configurado en las variables de entorno'
  });
});

/* =========================================================
   EMISIÓN DE TARJETA
   ========================================================= */
app.post("/api/issue", async (req, res) => {
  try {
    let { name = "Cliente", max = 8, phone = "", birthdate = null } = req.body;
    max = parseInt(max, 10);
    if (!Number.isInteger(max) || max <= 0) {
      return res.status(400).json({ error: "max debe ser entero > 0" });
    }

    const cardId = `card_${Date.now()}`;
    const cleanName = String(name).trim() || "Cliente";

    const card = await fsCreateCard({ id: cardId, name: cleanName, phone, birthdate, max });
    await fsAddEvent(cardId, "ISSUE", { name: cleanName, max, phone, birthdate });

    const addToGoogleUrl = buildGoogleSaveUrl({
      cardId,
      name: cleanName,
      stamps: card.stamps,
      max,
    });
    const base = process.env.BASE_URL || "";
    const addToAppleUrl = `${base}/api/apple/pass?cardId=${encodeURIComponent(
      cardId
    )}`;
    res.json({ cardId, addToGoogleUrl, addToAppleUrl });
  } catch (error) {
    console.error("[/api/issue]", error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================================================
   CREAR TARJETA PÚBLICA
   ========================================================= */
app.get("/api/create-card", async (req, res) => {
  try {
    const { name, phone, max, birthdate } = req.query;  // <- Agregar birthdate
    if (!name || !phone) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    const maxVal = parseInt(max, 10) || 8;
    const cardId = `card_${Date.now()}`;
    const cleanName = String(name).trim();

    const card = await fsCreateCard({
      id: cardId,
      name: cleanName,
      phone,
      birthdate,  // <- Agregar esta línea
      max: maxVal,
    });
    await fsAddEvent(cardId, "ISSUE", {
      name: cleanName,
      phone,
      birthdate,  // <- Agregar en el evento también
      max: maxVal,
    });

    const addToGoogleUrl = buildGoogleSaveUrl({
      cardId,
      name: cleanName,
      stamps: card.stamps,
      max: maxVal,
    });

    const base = process.env.BASE_URL || "https://venus-loyalty.onrender.com";
    const addToAppleUrl = `${base}/api/apple/pass?cardId=${encodeURIComponent(
      cardId
    )}`;
    const url = `${base}/?cardId=${cardId}`;

    res.json({
      url,
      cardId,
      name: cleanName,
      stamps: card.stamps,
      max: maxVal,
      gwallet: addToGoogleUrl,
      applewallet: addToAppleUrl,
    });
  } catch (err) {
    console.error("❌ Error en GET /api/create-card:", err);
    res.status(500).json({ error: "No se pudo crear la tarjeta" });
  }
});

app.post("/api/create-card", async (req, res) => {
  try {
    const { name, phone, max, birthdate } = req.body || {};  // <- Agregar birthdate
    if (!name || !phone) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    const maxVal = parseInt(max, 10) || 8;
    const cardId = `card_${Date.now()}`;
    const cleanName = String(name).trim();

    const card = await fsCreateCard({
      id: cardId,
      name: cleanName,
      phone,
      birthdate,  // <- Agregar esta línea
      max: maxVal,
    });
    await fsAddEvent(cardId, "ISSUE", {
      name: cleanName,
      phone,
      birthdate,  // <- Agregar en el evento también
      max: maxVal,
    });

    const addToGoogleUrl = buildGoogleSaveUrl({
      cardId,
      name: cleanName,
      stamps: card.stamps,
      max: maxVal,
    });

    const base = process.env.BASE_URL || "https://venus-loyalty.onrender.com";
    const addToAppleUrl = `${base}/api/apple/pass?cardId=${encodeURIComponent(
      cardId
    )}`;
    const url = `${base}/?cardId=${cardId}`;

    res.json({
      url,
      cardId,
      name: cleanName,
      stamps: card.stamps,
      max: maxVal,
      gwallet: addToGoogleUrl,
      applewallet: addToAppleUrl,
    });
  } catch (err) {
    console.error("❌ Error en POST /api/create-card:", err);
    res.status(500).json({ error: "No se pudo crear la tarjeta" });
  }
});

/* =========================================================
   OBTENER DATOS TARJETA
   ========================================================= */
app.get("/api/card/:cardId", async (req, res) => {
  try {
    const card = await fsGetCard(req.params.cardId);
    if (!card) return res.status(404).json({ error: "not_found" });
    res.json(card);
  } catch (e) {
    console.error("[GET /api/card]", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/events/:cardId", async (req, res) => {
  try {
    const items = await fsListEvents(req.params.cardId);
    res.json(items);
  } catch (e) {
    console.error("[GET /api/events]", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/wallet-link/:cardId", async (req, res) => {
  try {
    const card = await fsGetCard(req.params.cardId);
    if (!card) return res.status(404).json({ error: "not_found" });
    const addToGoogleUrl = buildGoogleSaveUrl({
      cardId: card.id,
      name: card.name,
      stamps: card.stamps,
      max: card.max,
    });
    res.json({ addToGoogleUrl });
  } catch (e) {
    console.error("[GET /api/wallet-link]", e);
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   APPLE WALLET - GENERAR PASE
   ========================================================= */
app.get("/api/apple/test-pass", async (_req, res) => {
  try {
    const testPayload = {
      cardId: "test-" + Date.now(),
      name: "Cliente Test",
      stamps: 2,
      max: 8,
      latestMessage: "¡Este es un mensaje de prueba para las notificaciones!"
    };

    console.log("[APPLE TEST] 🔨 Generando pase de prueba con payload:", testPayload);

    const buffer = await buildApplePassBuffer(testPayload);

    res.set({
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="test-pass.pkpass"`,
      "Content-Length": buffer.length,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });

    console.log("[APPLE TEST] ✅ Pase de prueba generado exitosamente");
    res.send(buffer);
  } catch (error) {
    console.error("Error en test pass:", error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

app.get("/api/apple/pass", async (req, res) => {
  try {
    const { cardId } = req.query;
    if (!cardId) return res.status(400).send("Falta cardId");

    const existing = await fsGetCard(cardId);
    const payload = existing
      ? {
        cardId: existing.id,
        name: existing.name,
        stamps: existing.stamps,
        max: existing.max,
        latestMessage: existing.latestMessage || null
      }
      : {
        cardId: String(cardId),
        name: "Cliente",
        stamps: 0,
        max: 8,
        latestMessage: null
      };

    console.log("[APPLE PASS] 📥 Generando pase con datos:", payload);

    const buffer = await buildApplePassBuffer(payload);

    // ✅ HEADERS CRÍTICOS PARA QUE SE ABRA EN WALLET
    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="${payload.cardId}.pkpass"`,
      'Content-Transfer-Encoding': 'binary',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Content-Length': buffer.length
    });

    console.log(`[APPLE PASS] 📤 Enviando pase para: ${payload.cardId}`);
    res.status(200).send(buffer);

  } catch (e) {
    console.error("[APPLE PASS ERROR]", e);
    res.status(500).send(e.message || "pkpass_error");
  }
});

/* =========================================================
   NUEVAS RUTAS: CUMPLEAÑOS Y GIFT CARDS
   ========================================================= */

// A. Obtener Cumpleaños (±15 días)
app.get('/api/admin/birthdays', adminAuth, async (req, res) => {
  try {
    const snapshot = await firestore.collection(COL_CARDS).where('status', '==', 'active').get();
    // Filtramos en memoria los que tienen fecha
    const cards = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.birthdate);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const past = [], upcoming = [];

    cards.forEach(c => {
      try {
        const [y, m, d] = c.birthdate.split('-');
        // Cumpleaños este año
        const bday = new Date(today.getFullYear(), parseInt(m) - 1, parseInt(d));

        // Calcular diferencia en días
        const diffTime = bday - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Lógica ±15 días
        if (diffDays >= -15 && diffDays < 0) {
          past.push({ ...c, daysAgo: Math.abs(diffDays) });
        } else if (diffDays >= 0 && diffDays <= 15) {
          upcoming.push({ ...c, daysLeft: diffDays });
        }
      } catch (e) { }
    });

    res.json({ success: true, past, upcoming });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// B. Historial de Gift Cards
app.get('/api/admin/gift-history', adminAuth, async (req, res) => {
  try {
    const snap = await firestore.collection(COL_GIFT_HISTORY).orderBy('redeemed_at', 'desc').limit(20).get();
    const history = snap.docs.map(d => d.data());
    res.json({ success: true, history });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// C. Canjear Gift Card
app.post('/api/admin/redeem-gift', adminAuth, async (req, res) => {
  try {
    const { code, service, clientName, expiryDate } = req.body;

    // Verificar duplicado
    const exist = await firestore.collection(COL_GIFT_HISTORY).where('code', '==', code).get();
    if (!exist.empty) return res.status(400).json({ error: "Esta Gift Card ya fue canjeada anteriormente." });

    // Verificar expiración (si viene fecha)
    if (expiryDate && new Date(expiryDate) < new Date()) {
      return res.status(400).json({ error: "Gift Card expirada." });
    }

    const redeemData = {
      code, service, client_name: clientName, expiry_date: expiryDate,
      redeemed_at: new Date().toISOString()
    };

    await firestore.collection(COL_GIFT_HISTORY).add(redeemData);
    res.json({ success: true, message: "Gift Card canjeada correctamente." });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// D. Obtener gift card por ID (para QR scanner)
app.get('/api/admin/gift-card/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await firestore.collection(COL_EVENTS).doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Gift card no encontrada' });
    }

    const data = doc.data();

    // Verificar que sea una gift card
    if (data.type !== 'GIFT') {
      return res.status(400).json({ error: 'Este QR no es una gift card' });
    }

    res.json({ id: doc.id, ...data });
  } catch (e) {
    console.error('[GET GIFT CARD]', e);
    res.status(500).json({ error: e.message });
  }
});

// E. Redimir gift card por QR scanner
app.post('/api/admin/gift-card/:id/redeem', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const docRef = firestore.collection(COL_EVENTS).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Gift card no encontrada' });
    }

    const data = doc.data();

    // Verificar que sea una gift card
    if (data.type !== 'GIFT') {
      return res.status(400).json({ error: 'Este QR no es una gift card' });
    }

    // Verificar si ya fue canjeada
    if (data.redeemed) {
      return res.status(400).json({
        error: 'Gift card ya canjeada',
        redeemedAt: data.redeemedAt,
        redeemedBy: data.redeemedBy
      });
    }

    // Marcar como canjeada
    await docRef.update({
      redeemed: true,
      redeemedAt: new Date().toISOString(),
      redeemedBy: req.user?.email || 'admin'
    });

    res.json({ success: true, message: 'Gift card canjeada correctamente' });
  } catch (e) {
    console.error('[REDEEM GIFT CARD]', e);
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   MÉTRICAS Y TARJETAS
   ========================================================= */
app.get("/api/admin/metrics-firebase", adminAuth, async (_req, res) => {
  try {
    const m = await fsMetrics();
    res.json({ ...m, source: "firestore" });
  } catch (e) {
    console.error("[METRICS-FIREBASE]", e);
    res.status(500).json({ error: e.message });
  }
});

// Top clientes (después de /api/admin/metrics-firebase)
app.get("/api/admin/top-clients", adminAuth, async (req, res) => {
  try {
    const snap = await firestore
      .collection(COL_CARDS)
      .orderBy("stamps", "desc")
      .limit(10)
      .get();

    const clients = snap.docs.map(d => d.data());
    res.json({ clients });
  } catch (e) {
    console.error("[TOP CLIENTS]", e);
    res.status(500).json({ error: e.message });
  }
});

// Actividad semanal
app.get("/api/admin/activity-week", adminAuth, async (req, res) => {
  try {
    const labels = [];
    const stamps = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);

      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);

      const snap = await firestore
        .collection(COL_EVENTS)
        .where("type", "==", "STAMP")
        .where("createdAt", ">=", day.toISOString())
        .where("createdAt", "<", nextDay.toISOString())
        .get();

      labels.push(day.toLocaleDateString('es-ES', { weekday: 'short' }));
      stamps.push(snap.size);
    }

    res.json({ labels, stamps });
  } catch (e) {
    console.error("[ACTIVITY WEEK]", e);
    res.status(500).json({ error: e.message });
  }
});

// Stats de wallets
app.get("/api/admin/wallet-stats", adminAuth, async (req, res) => {
  try {
    // Contar dispositivos Apple registrados
    const devicesSnap = await firestore.collection(COL_DEVICES).get();
    const appleDevices = devicesSnap.size;

    // ⭐ NUEVO: Contar dispositivos Google registrados
    const googleDevicesSnap = await firestore.collection(COL_GOOGLE_DEVICES).get();
    const googleDevices = googleDevicesSnap.size;

    res.json({
      appleDevices,
      appleWallets: appleDevices,
      googleWallets: googleDevices // ⭐ NUEVO: Ahora incluye dispositivos Google
    });
  } catch (e) {
    console.error("[WALLET STATS]", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/cards-firebase", adminAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const q = (req.query.q || "").trim();
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder || "desc";

    const data = await fsListCardsPage({
      page,
      limit: 12,
      q,
      sortBy,
      sortOrder
    });
    res.json({ ...data, source: "firestore" });
  } catch (e) {
    console.error("[CARDS-FIREBASE]", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/events-firebase", adminAuth, async (req, res) => {
  try {
    const { cardId } = req.query || {};
    if (!cardId) return res.status(400).json({ error: "missing_cardId" });
    const items = await fsListEvents(cardId);
    res.json({ items, source: "firestore" });
  } catch (e) {
    console.error("[EVENTS-FIREBASE]", e);
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   SUMAR SELLO (staff) - CON NOTIFICACIÓN APPLE - ⭐ CORREGIDO
   ========================================================= */
app.post("/api/stamp/:cardId", basicAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const card = await fsGetCard(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });
    if (card.stamps >= card.max)
      return res.json({ ...card, message: "Tarjeta ya completa" });
    if (!(await canStamp(cardId)))
      return res.status(429).json({ error: "Solo 1 sello por día" });

    const newStamps = (card.stamps || 0) + 1;
    const updated = await fsUpdateCardStamps(cardId, newStamps);
    await fsAddEvent(cardId, "STAMP", { by: "reception" });

    // ⭐ CORRECCIÓN: Google Wallet con 4 parámetros
    try {
      const { updateLoyaltyObject } = await import("./lib/google.js");
      // ✅ CORRECTO: 4 parámetros en lugar de 2
      await updateLoyaltyObject(cardId, updated.name, newStamps, updated.max);
      console.log(`[GOOGLE WALLET] ✅ Stamp actualizado para: ${cardId} (${newStamps}/${updated.max})`);
    } catch (googleError) {
      console.error(`[GOOGLE WALLET] ❌ Error actualizando stamp:`, googleError.message);
    }

    // Notificar Apple
    try {
      await appleWebService.notifyCardUpdate(cardId);
    } catch (err) {
      console.error("[APPLE] Error notificando:", err);
    }

    const addToGoogleUrl = buildGoogleSaveUrl({
      cardId,
      name: updated.name,
      stamps: newStamps,
      max: updated.max,
    });
    res.json({ ...updated, addToGoogleUrl });
  } catch (e) {
    console.error("[STAMP staff]", e);
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   PUSH NOTIFICATIONS
   ========================================================= */
app.post("/api/admin/push-notification", adminAuth, sendMassPushNotification);
app.post("/api/admin/push-test", adminAuth, sendTestPushNotification);
app.get("/api/admin/notifications", adminAuth, getNotifications);

/* =========================================================
   CANJEAR (staff) - CON NOTIFICACIÓN APPLE
   ========================================================= */
app.post("/api/redeem/:cardId", basicAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const card = await fsGetCard(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });
    if ((card.stamps || 0) < card.max)
      return res.status(400).json({ error: "Aún no completa los sellos" });

    const prev = card.stamps;
    const updated = await fsUpdateCardStamps(cardId, 0);
    await fsAddEvent(cardId, "REDEEM", { by: "reception" });

    // ⭐ CORRECCIÓN: Google Wallet con 4 parámetros
    try {
      const { updateLoyaltyObject } = await import("./lib/google.js");
      await updateLoyaltyObject(cardId, updated.name, 0, updated.max);
      console.log(`[GOOGLE WALLET] ✅ Redeem actualizado para: ${cardId} (0/${updated.max})`);
    } catch (googleError) {
      console.error(`[GOOGLE WALLET] ❌ Error actualizando redeem:`, googleError.message);
    }

    try {
      await appleWebService.notifyCardUpdate(cardId);
    } catch (err) {
      console.error("[APPLE] Error notificando:", err);
    }

    const addToGoogleUrl = buildGoogleSaveUrl({
      cardId,
      name: updated.name,
      stamps: 0,
      max: updated.max,
    });
    res.json({ ok: true, message: "Canje realizado", cardId, addToAppleUrl });
  } catch (e) {
    console.error("[REDEEM staff]", e);
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   REGISTRAR DISPOSITIVO GOOGLE - ⭐ NUEVO ENDPOINT MEJORADO
   ========================================================= */
app.post('/api/google/register-device', async (req, res) => {
  try {
    const { cardId, deviceId } = req.body;

    if (!cardId || !deviceId) {
      return res.status(400).json({
        error: "Faltan cardId o deviceId"
      });
    }

    console.log(`[GOOGLE] 📱 Registrando dispositivo: ${deviceId} para tarjeta: ${cardId}`);

    // Verificar que la tarjeta existe
    const card = await fsGetCard(cardId);
    if (!card) {
      return res.status(404).json({
        error: "Tarjeta no encontrada"
      });
    }

    await fsRegisterGoogleDevice(cardId, deviceId);

    res.json({
      success: true,
      message: "Dispositivo Google registrado exitosamente",
      cardId,
      deviceId
    });

  } catch (error) {
    console.error('[GOOGLE] ❌ Error registrando dispositivo:', error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================================================
   OBTENER DISPOSITIVOS GOOGLE DE UNA TARJETA - ⭐ NUEVO ENDPOINT
   ========================================================= */
app.get('/api/debug/google-devices/:cardId', adminAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const devices = await fsGetGoogleDevicesByCard(cardId);

    res.json({
      cardId,
      deviceCount: devices.length,
      devices: devices.map(d => ({
        deviceId: d.device_id,
        registeredAt: d.registered_at,
        lastActive: d.last_active
      }))
    });
  } catch (error) {
    console.error('[GOOGLE DEVICES] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================================================
   ESTADÍSTICAS DE DISPOSITIVOS - ⭐ NUEVO ENDPOINT
   ========================================================= */
app.get('/api/admin/device-stats', adminAuth, async (req, res) => {
  try {
    const appleSnap = await firestore.collection(COL_DEVICES).get();
    const googleSnap = await firestore.collection(COL_GOOGLE_DEVICES).get();

    // Contar dispositivos únicos por tarjeta
    const appleByCard = {};
    appleSnap.forEach(doc => {
      const serial = doc.data().serial_number;
      appleByCard[serial] = (appleByCard[serial] || 0) + 1;
    });

    const googleByCard = {};
    googleSnap.forEach(doc => {
      const cardId = doc.data().card_id;
      googleByCard[cardId] = (googleByCard[cardId] || 0) + 1;
    });

    res.json({
      apple: {
        totalDevices: appleSnap.size,
        cardsWithDevices: Object.keys(appleByCard).length,
        avgDevicesPerCard: appleSnap.size / Math.max(1, Object.keys(appleByCard).length)
      },
      google: {
        totalDevices: googleSnap.size,
        cardsWithDevices: Object.keys(googleByCard).length,
        avgDevicesPerCard: googleSnap.size / Math.max(1, Object.keys(googleByCard).length)
      },
      total: {
        devices: appleSnap.size + googleSnap.size,
        cardsWithAnyDevice: new Set([
          ...Object.keys(appleByCard),
          ...Object.keys(googleByCard)
        ]).size
      }
    });
  } catch (error) {
    console.error('[DEVICE STATS] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================================================
   HELPER: CREAR/ACTUALIZAR OBJETO GOOGLE WALLET
   ========================================================= */
async function ensureGoogleWalletObject(cardId, cardData) {
  try {
    const { getWalletAccessToken, createLoyaltyObject, updateLoyaltyObject } = await import("./lib/google.js");
    const token = await getWalletAccessToken();
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const objectId = `${issuerId}.${cardId}`;

    // Verificar si el objeto existe
    const checkResp = await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (checkResp.status === 404) {
      // Crear objeto si no existe
      console.log(`[GOOGLE WALLET] 🆕 Creando nuevo objeto para: ${cardId}`);
      await createLoyaltyObject({
        cardId,
        name: cardData.name,
        stamps: cardData.stamps,
        max: cardData.max
      });
    } else if (checkResp.ok) {
      // Actualizar objeto existente
      console.log(`[GOOGLE WALLET] 🔄 Actualizando objeto existente para: ${cardId}`);
      await updateLoyaltyObject(cardId, cardData.name, cardData.stamps, cardData.max);
    }

    return true;
  } catch (error) {
    console.error(`[GOOGLE WALLET] ❌ Error asegurando objeto:`, error);
    return false;
  }
}





/* =========================================================
   RUTAS DE NOTIFICACIONES PUSH (TU VERSIÓN CORREGIDA)
   ========================================================= */

// 1. PUSH INDIVIDUAL (Con Pausa de Seguridad de 1.5s)
app.post("/api/admin/push-one", adminAuth, async (req, res) => {
  try {
    const { cardId, title, message } = req.body;
    if (!cardId || !message) return res.status(400).json({ error: "Faltan datos" });

    console.log(`[PUSH ONE] 🎯 Enviando a ${cardId}`);

    // Guardar en DB
    await firestore.collection(COL_CARDS).doc(cardId).set({
      latestMessage: message,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    console.log(`[PUSH ONE] 💾 Guardado. Esperando propagación...`);

    // ⭐ PAUSA CRÍTICA para que Firestore replique antes de que el iPhone lea
    await new Promise(resolve => setTimeout(resolve, 1500));

    const results = { google: 0, apple: 0 };

    // Apple
    const appleDevs = await firestore.collection(COL_DEVICES).where("serial_number", "==", cardId).get();
    for (const doc of appleDevs.docs) {
      try {
        await appleWebService.sendAPNsAlertNotification(doc.data().push_token, title, message);
        results.apple++;
      } catch (e) { console.error("Error Apple One:", e.message); }
    }

    // Google
    try {
      await sendGoogleMessage(cardId, title, message);
      results.google++;
    } catch (e) { console.error("Error Google One:", e.message); }

    res.json({ success: true, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
/* =========================================================
   ENDPOINT: NOTIFICACIÓN MASIVA (BLINDADA)
   ========================================================= */
app.post("/api/admin/push-all", adminAuth, async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) return res.status(400).json({ error: "Faltan datos" });

    console.log(`[PUSH ALL] 🚀 Iniciando masivo BLINDADO: "${message}"`);

    // 1. OBTENER TARJETAS
    const cardsSnap = await firestore.collection(COL_CARDS).get();
    if (cardsSnap.empty) return res.json({ success: true, msg: "Sin tarjetas." });

    // 2. ESCRITURA LENTA PERO SEGURA (Iteración directa)
    // No usamos batch para evitar race conditions en este caso crítico
    console.log(`[PUSH ALL] 📝 Escribiendo en ${cardsSnap.size} tarjetas...`);

    // Convertimos a array de promesas para Promise.all (paralelo pero individual)
    const updates = cardsSnap.docs.map(doc => {
      return doc.ref.set({
        latestMessage: message,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    });

    await Promise.all(updates);
    console.log(`[PUSH ALL] ✅ DB Actualizada. Verificando...`);

    // ⭐ VERIFICACIÓN DE SEGURIDAD
    // Leemos una tarjeta al azar para forzar consistencia en Firestore
    const checkDoc = await cardsSnap.docs[0].ref.get();
    const checkMsg = checkDoc.data().latestMessage;

    if (checkMsg !== message) {
      console.warn(`[PUSH ALL] ⚠️ ALERTA: Firestore lento. Mensaje leido: '${checkMsg}'. Esperando 3s extra...`);
      await new Promise(r => setTimeout(r, 3000));
    }

    // Pausa base obligatoria
    await new Promise(r => setTimeout(r, 2000));

    const results = { apple: 0, google: 0 };

    // 3. APPLE (Envío)
    const appleDevs = await firestore.collection(COL_DEVICES).get();
    const devices = appleDevs.docs.map(d => d.data());

    if (devices.length > 0) {
      console.log(`[PUSH ALL] 🍏 Notificando a ${devices.length} iPhones...`);
      for (const d of devices) {
        if (d.push_token && d.serial_number) {
          try {
            await appleWebService.sendAPNsAlertNotification(d.push_token, title, message);
            results.apple++;
          } catch (e) {
            console.error(`[PUSH ALL] X Apple error: ${e.message}`);
          }
          // Pausa entre envíos
          await new Promise(r => setTimeout(r, 100));
        }
      }
    }

    // 4. GOOGLE (Envío)
    const googleDevs = await firestore.collection(COL_GOOGLE_DEVICES).get();
    const googlePromises = googleDevs.docs.map(async (doc) => {
      const d = doc.data();
      if (d.card_id) {
        try {
          await sendGoogleMessage(d.card_id, title, message);
          results.google++;
        } catch (e) { }
      }
    });
    await Promise.all(googlePromises);

    console.log(`[PUSH ALL] 🏁 Fin. Apple: ${results.apple}, Google: ${results.google}`);
    res.json({ success: true, results });

  } catch (e) {
    console.error("[PUSH ALL] Error Fatal:", e);
    res.status(500).json({ error: e.message });
  }
});
/* =========================================================
   DEBUG: ESTADO DE TARJETA
   ========================================================= */
app.get('/api/debug/card-state/:cardId', async (req, res) => {
  try {
    const cardId = req.params.cardId;

    console.log(`[DEBUG CARD] 🔍 Solicitando estado de: ${cardId}`);

    const card = await fsGetCard(cardId);

    if (!card) {
      console.log(`[DEBUG CARD] ❌ Tarjeta no encontrada: ${cardId}`);
      return res.json({
        exists: false,
        message: 'Tarjeta no encontrada',
        firestorePath: `${COL_CARDS}/${cardId}`
      });
    }

    // Verificar dispositivos Apple registrados
    const appleDevicesSnap = await firestore
      .collection(COL_DEVICES)
      .where("serial_number", "==", cardId)
      .get();

    const appleDevices = appleDevicesSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // ⭐ NUEVO: Verificar dispositivos Google registrados
    const googleDevices = await fsGetGoogleDevicesByCard(cardId);

    console.log(`[DEBUG CARD] ✅ Tarjeta encontrada:`, {
      id: card.id,
      name: card.name,
      hasMessage: !!card.latestMessage,
      appleDeviceCount: appleDevices.length,
      googleDeviceCount: googleDevices.length
    });

    res.json({
      exists: true,
      firestorePath: `${COL_CARDS}/${cardId}`,
      cardData: {
        id: card.id,
        name: card.name,
        stamps: card.stamps,
        max: card.max,
        latestMessage: card.latestMessage || 'NULL',
        messageUpdatedAt: card.messageUpdatedAt || 'NO REGISTRADO',
        updatedAt: card.updatedAt || 'NO REGISTRADO',
        _debug_push_sent: card._debug_push_sent || 'NO REGISTRADO'
      },
      appleDevices: {
        count: appleDevices.length,
        devices: appleDevices.map(d => ({
          deviceId: d.device_id,
          hasToken: !!d.push_token,
          registeredAt: d.registered_at
        }))
      },
      googleDevices: {
        count: googleDevices.length,
        devices: googleDevices.map(d => ({
          deviceId: d.device_id,
          registeredAt: d.registered_at,
          lastActive: d.last_active
        }))
      }
    });
  } catch (error) {
    console.error(`[DEBUG CARD] ❌ Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================================================
   EXPORT CSV
   ========================================================= */
app.get("/api/export.csv", basicAuth, async (_req, res) => {
  try {
    const snap = await firestore
      .collection(COL_CARDS)
      .orderBy("createdAt", "desc")
      .get();

    const rows = snap.docs.map((d) => d.data());

    const header = "id,name,phone,birthdate,stamps,max,status,created_at";  // <- Agregar birthdate
    const csvLines = rows.map((r) =>
      [
        r.id,
        r.name,
        r.phone || "",
        r.birthdate || "",  // <- Agregar esta línea
        r.stamps || 0,
        r.max || 0,
        r.status || "active",
        r.createdAt || "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );

    const csv = [header, ...csvLines].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=venus_cards.csv"
    );
    res.send(csv);
  } catch (e) {
    console.error("[EXPORT CSV]", e);
    res.status(500).send(e.message);
  }
});
/* =========================================================
   ELIMINAR TARJETA
   ========================================================= */
app.delete("/api/admin/card/:cardId", adminAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    if (!cardId) return res.status(400).json({ error: "missing_cardId" });

    const ok = await fsDeleteCard(cardId);
    if (!ok) return res.status(404).json({ error: "card not found" });

    res.json({ ok: true, cardId, message: "Tarjeta eliminada correctamente" });
  } catch (e) {
    console.error("[DELETE CARD ERROR]", e);
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   ADMIN AUTH
   ========================================================= */
app.post("/api/admin/register", async (req, res) => {
  try {
    const allow =
      (process.env.ADMIN_ALLOW_SIGNUP || "false").toLowerCase() === "true";
    const n = await fsCountAdmins();
    if (!allow && n > 0)
      return res.status(403).json({ error: "signup_disabled" });

    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "missing_fields" });

    const norm = String(email).trim().toLowerCase();

    const exists = await fsGetAdminByEmail(norm);
    if (exists) {
      return res.status(409).json({ error: "email_in_use" });
    }

    const id = `adm_${Date.now()}`;
    const pass_hash = await bcrypt.hash(password, 10);

    await fsInsertAdmin({ id, email: norm, pass_hash });

    res.json({ ok: true });
  } catch (e) {
    console.error("[ADMIN REGISTER]", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "missing_fields" });

    const norm = String(email).trim().toLowerCase();

    const admin = await fsGetAdminByEmail(norm);
    if (!admin) {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    const ok = await bcrypt.compare(password, admin.pass_hash);
    if (!ok) {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    const token = signAdmin({ id: admin.id, email: admin.email });
    setAdminCookie(res, token);

    res.json({ ok: true });
  } catch (e) {
    console.error("[ADMIN LOGIN]", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/logout", (_req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

app.get("/api/admin/me", adminAuth, (req, res) => {
  res.json({ uid: req.admin.uid, email: req.admin.email });
});

app.get("/api/admin/cards", adminAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const q = (req.query.q || "").trim();
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder || "desc";

    const data = await fsListCardsPage({
      page,
      limit: 12,
      q,
      sortBy,
      sortOrder
    });
    res.json(data);
  } catch (e) {
    console.error("[CARDS]", e);
    res.status(500).json({ error: e.message });
  }
});


app.get("/api/admin/events", adminAuth, async (req, res) => {
  try {
    const { cardId } = req.query || {};
    if (!cardId) return res.status(400).json({ error: "missing_cardId" });
    const items = await fsListEvents(cardId);
    res.json({ items });
  } catch (e) {
    console.error("[EVENTS]", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/stamp", adminAuth, async (req, res) => {
  try {
    const { cardId } = req.body || {};
    if (!cardId) return res.status(400).json({ error: "missing_cardId" });

    const card = await fsGetCard(cardId);
    if (!card) {
      return res.status(404).json({ error: "card not found" });
    }

    if (card.stamps >= card.max) return res.status(400).json({ error: "already_full" });
    if (!(await canStamp(cardId))) return res.status(429).json({ error: "Solo 1 sello por día" });

    const newStamps = (card.stamps || 0) + 1;
    await fsUpdateCardStamps(cardId, newStamps);
    await fsAddEvent(cardId, "STAMP", { by: "admin" });

    // ⭐ CORRECCIÓN: Agregar actualización de Google Wallet
    try {
      const { updateLoyaltyObject } = await import("./lib/google.js");
      await updateLoyaltyObject(cardId, card.name, newStamps, card.max);
      console.log(`[GOOGLE WALLET] ✅ Stamp admin actualizado para: ${cardId}`);
    } catch (googleError) {
      console.error(`[GOOGLE WALLET] ❌ Error actualizando stamp admin:`, googleError.message);
    }

    try {
      await appleWebService.updatePassAndNotify(cardId, card.stamps, newStamps);
    } catch (err) {
      console.error("[APPLE] Error notificando:", err);
    }

    res.json({ ok: true, cardId, stamps: newStamps });
  } catch (e) {
    console.error("[ADMIN STAMP]", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/redeem", adminAuth, async (req, res) => {
  try {
    const { cardId } = req.body || {};
    if (!cardId) return res.status(400).json({ error: "missing_cardId" });

    const card = await fsGetCard(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });
    if ((card.stamps || 0) < card.max) return res.status(400).json({ error: "not_enough_stamps" });

    const prev = card.stamps;
    await fsUpdateCardStamps(cardId, 0);
    await fsAddEvent(cardId, "REDEEM", { by: "admin" });

    // ⭐ CORRECCIÓN: Agregar actualización de Google Wallet
    try {
      const { updateLoyaltyObject } = await import("./lib/google.js");
      await updateLoyaltyObject(cardId, card.name, 0, card.max);
      console.log(`[GOOGLE WALLET] ✅ Redeem admin actualizado para: ${cardId}`);
    } catch (googleError) {
      console.error(`[GOOGLE WALLET] ❌ Error actualizando redeem admin:`, googleError.message);
    }

    try {
      await appleWebService.notifyCardUpdate(cardId);
    } catch (err) {
      console.error("[APPLE] Error notificando:", err);
    }

    res.json({ ok: true, cardId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/metrics", adminAuth, async (_req, res) => {
  try {
    const m = await fsMetrics();
    res.json(m);
  } catch (e) {
    console.error("[METRICS]", e);
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   PRUEBA DIRECTA: NOTIFICACIÓN APPLE
   ========================================================= */
app.post('/api/debug/test-apple-push', adminAuth, async (req, res) => {
  try {
    const { cardId, title, message } = req.body;

    console.log(`[DEBUG APPLE PUSH] 🧪 Probando notificación para: ${cardId}`);

    // Usar la función de alerta visible directamente
    const result = await appleWebService.sendAlertToCardDevices(
      cardId,
      title || "🔥 PRUEBA DIRECTA",
      message || "Esta notificación DEBE verse en pantalla de bloqueo"
    );

    res.json({
      success: result.sent > 0,
      result,
      message: result.sent > 0
        ? `✅ Notificación enviada a ${result.sent} dispositivo(s)`
        : `❌ No se pudo enviar a ningún dispositivo`
    });
  } catch (error) {
    console.error('[DEBUG APPLE PUSH] ❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================================================
   PRUEBA DIRECTA: GOOGLE WALLET
   ========================================================= */
app.post('/api/debug/test-google-push', adminAuth, async (req, res) => {
  try {
    const { cardId, title, message } = req.body;

    console.log(`[DEBUG GOOGLE PUSH] 🧪 Probando Google Wallet para: ${cardId}`);

    const card = await fsGetCard(cardId);
    if (!card) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    // Asegurar objeto existe
    const googleReady = await ensureGoogleWalletObject(cardId, card);

    if (!googleReady) {
      return res.json({ success: false, error: "No se pudo crear/actualizar objeto Google Wallet" });
    }

    // Enviar mensaje
    const { getWalletAccessToken } = await import("./lib/google.js");
    const token = await getWalletAccessToken();
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const objectId = `${issuerId}.${cardId}`;

    const resp = await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}/addMessage`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            header: title || "🔥 PRUEBA GOOGLE",
            body: message || "Esta notificación DEBE verse en Google Wallet",
            kind: "walletobjects#message",
          },
        }),
      }
    );

    const data = await resp.json().catch(() => ({}));

    res.json({
      success: resp.ok,
      status: resp.status,
      data: data,
      message: resp.ok
        ? "✅ Mensaje enviado a Google Wallet"
        : `❌ Error Google API: ${resp.status}`
    });

  } catch (error) {
    console.error('[DEBUG GOOGLE PUSH] ❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================================================
   RECUPERACIÓN DE CONTRASEÑA
   ========================================================= */
app.post("/api/admin/forgot", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "missing_email" });

    const admin = await fsGetAdminByEmail(email);
    if (!admin) return res.json({ ok: true }); // no revelamos nada

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await fsCreateResetToken({
      token,
      adminId: admin.id,
      email,
      expiresAt,
    });

    const base = process.env.APP_BASE_URL || process.env.BASE_URL || "";
    const link = `${base}/admin-login.html?view=reset&token=${token}`;

    await sendMail({
      to: email,
      subject: "Restablecer tu contraseña — Venus Lealtad",
      text: `Hola,

Para restablecer tu contraseña usa este enlace (válido 30 minutos):
${link}

Si no fuiste tú, ignora este mensaje.`,
      html: `
        <div style="font-family:system-ui,Arial,sans-serif">
          <h2 style="margin:0 0 8px">Restablecer contraseña</h2>
          <p>Para restablecer tu contraseña usa este enlace (válido 30 minutos):</p>
          <p><a href="${link}">${link}</a></p>
          <p style="color:#6b7280">Si no fuiste tú, ignora este mensaje.</p>
        </div>
      `,
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("[SMTP forgot]", e);
    res.status(500).json({ error: "mail_error" });
  }
});

app.post("/api/admin/reset", async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password)
      return res.status(400).json({ error: "missing_fields" });

    const row = await fsGetResetToken(token);
    if (!row) return res.status(400).json({ error: "invalid_token" });

    if (new Date(row.expiresAt) < new Date()) {
      await fsDeleteResetToken(token);
      return res.status(400).json({ error: "expired" });
    }

    const pass_hash = await bcrypt.hash(password, 10);
    await fsUpdateAdminPassword(row.adminId, pass_hash);
    await fsDeleteResetToken(token);

    res.json({ ok: true });
  } catch (e) {
    console.error("[RESET]", e);
    res.status(500).json({ error: "reset_error" });
  }
});

/* =========================================================
   DEBUG: ESTADO GOOGLE WALLET
   ========================================================= */
app.get('/api/debug/google-wallet-state/:cardId', async (req, res) => {
  try {
    const cardId = req.params.cardId;

    console.log(`[DEBUG GOOGLE] 🔍 Verificando estado para: ${cardId}`);

    const card = await fsGetCard(cardId);
    if (!card) {
      return res.json({ exists: false, message: 'Tarjeta no encontrada' });
    }

    const { getWalletAccessToken } = await import("./lib/google.js");
    const token = await getWalletAccessToken();
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const objectId = `${issuerId}.${cardId}`;

    // Verificar si el objeto existe en Google Wallet
    const checkResp = await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const googleObjectExists = checkResp.status === 200;
    let googleObjectData = null;

    if (googleObjectExists) {
      googleObjectData = await checkResp.json();
    }

    // Verificar dispositivos Google registrados
    const googleDevices = await fsGetGoogleDevicesByCard(cardId);

    res.json({
      firestore: {
        exists: true,
        cardData: {
          id: card.id,
          name: card.name,
          stamps: card.stamps,
          max: card.max
        }
      },
      googleWallet: {
        objectExists: googleObjectExists,
        objectId: objectId,
        objectData: googleObjectData ? {
          loyaltyPoints: googleObjectData.loyaltyPoints,
          state: googleObjectData.state
        } : null,
        error: !googleObjectExists ? `Objeto no existe (status: ${checkResp.status})` : null
      },
      googleDevices: {
        count: googleDevices.length,
        devices: googleDevices.map(d => ({
          deviceId: d.device_id,
          registeredAt: d.registered_at,
          lastActive: d.last_active
        }))
      }
    });

  } catch (error) {
    console.error(`[DEBUG GOOGLE] ❌ Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================================================
   DEBUG: CREAR/ACTUALIZAR OBJETO GOOGLE WALLET MANUALMENTE
   ========================================================= */
app.post('/api/debug/fix-google-wallet/:cardId', async (req, res) => {
  try {
    const cardId = req.params.cardId;

    console.log(`[DEBUG GOOGLE] 🔧 Reparando objeto para: ${cardId}`);

    const card = await fsGetCard(cardId);
    if (!card) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    const { createLoyaltyObject, updateLoyaltyObject } = await import("./lib/google.js");

    // Intentar actualizar primero (si existe)
    try {
      await updateLoyaltyObject(cardId, card.name, card.stamps, card.max);
      console.log(`[DEBUG GOOGLE] ✅ Objeto actualizado: ${cardId}`);
      return res.json({ success: true, action: "updated", stamps: card.stamps });
    } catch (updateError) {
      // Si falla la actualización, crear uno nuevo
      if (updateError.message.includes('404') || updateError.message.includes('not found')) {
        await createLoyaltyObject({
          cardId,
          name: card.name,
          stamps: card.stamps,
          max: card.max
        });
        console.log(`[DEBUG GOOGLE] ✅ Objeto creado: ${cardId}`);
        return res.json({ success: true, action: "created", stamps: card.stamps });
      } else {
        throw updateError;
      }
    }

  } catch (error) {
    console.error(`[DEBUG GOOGLE] ❌ Error reparando:`, error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================================================
   ENDPOINT PARA OBTENER TOKEN DE ADMIN (para pruebas)
   ========================================================= */
app.get('/api/debug/admin-token', adminAuth, (req, res) => {
  // Este endpoint solo funciona si ya estás autenticado como admin
  res.json({
    token: req.admin.token,
    admin: {
      uid: req.admin.uid,
      email: req.admin.email
    },
    instructions: "Usa este token en el header Authorization: Bearer <token>"
  });
});

/* =========================================================
   DEBUG
   ========================================================= */
app.get("/api/debug/database-status", adminAuth, async (req, res) => {
  try {
    let firestoreCards = 0;
    let firestoreAdmins = 0;
    let firestoreGoogleDevices = 0;

    const cardsSnap = await firestore.collection(COL_CARDS).get();
    firestoreCards = cardsSnap.size;

    const adminsSnap = await firestore.collection(COL_ADMINS).get();
    firestoreAdmins = adminsSnap.size;

    // ⭐ NUEVO: Contar dispositivos Google
    const googleDevicesSnap = await firestore.collection(COL_GOOGLE_DEVICES).get();
    firestoreGoogleDevices = googleDevicesSnap.size;

    res.json({
      firestore: {
        cards: firestoreCards,
        admins: firestoreAdmins,
        googleDevices: firestoreGoogleDevices // ⭐ NUEVO
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// === HEALTH CHECK
app.get("/health", (req, res) => res.json({ ok: true }));

/* =========================================================
   ADMIN: ACTUALIZAR INFORMACIÓN DE CLIENTE (FASE 5)
   ========================================================= */
app.post("/api/admin/update-client-info", adminAuth, async (req, res) => {
  try {
    const { cardId, notes, favoriteServices } = req.body;

    if (!cardId) {
      return res.status(400).json({ error: "cardId es requerido" });
    }

    const cardRef = firestore.collection("cards").doc(cardId);
    const cardSnap = await cardRef.get();

    if (!cardSnap.exists) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    // Actualizar solo los campos proporcionados
    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    if (favoriteServices !== undefined) {
      updateData.favoriteServices = favoriteServices;
    }

    await cardRef.update(updateData);

    console.log(`✅ Información actualizada para tarjeta: ${cardId}`);
    res.json({ ok: true, message: "Información actualizada correctamente" });

  } catch (error) {
    console.error("[UPDATE CLIENT INFO] Error:", error);
    res.status(500).json({ error: "Error al actualizar información" });
  }
});

/* =========================================================
   SERVER
   ========================================================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor activo en http://localhost:${PORT}`);
  console.log(`   • Admin: http://localhost:${PORT}/admin`);
  console.log(`   • Staff: http://localhost:${PORT}/staff.html`);
  console.log(`   • Google Wallet: http://localhost:${PORT}/api/google/diagnostics`);
  console.log(`   • Apple APNs Status: http://localhost:${PORT}/api/debug/apple-apns`);
  console.log(`   • DB Status (Firestore): http://localhost:${PORT}/api/debug/database-status`);
  console.log(`   • Apple Routes Test: http://localhost:${PORT}/api/debug/apple-routes-test`);
  console.log(`   • Google Devices: http://localhost:${PORT}/api/debug/google-devices/CARD_ID`);
  console.log(`   • Device Stats: http://localhost:${PORT}/api/admin/device-stats`);
  console.log(`   • Cumpleaños: http://localhost:${PORT}/api/admin/birthdays`);
  console.log(`   • Gift Cards: http://localhost:${PORT}/api/admin/gift-history`);

  (async () => {
    try {
      const cardsSnap = await firestore.collection(COL_CARDS).get();
      const adminsSnap = await firestore.collection(COL_ADMINS).get();
      const googleDevicesSnap = await firestore.collection(COL_GOOGLE_DEVICES).get();
      const giftHistorySnap = await firestore.collection(COL_GIFT_HISTORY).get();
      console.log(`\n📊 Estado actual Firestore:`);
      console.log(`   • Tarjetas: ${cardsSnap.size}`);
      console.log(`   • Admins: ${adminsSnap.size}`);
      console.log(`   • Dispositivos Google: ${googleDevicesSnap.size}`);
      console.log(`   • Gift Cards Canjeadas: ${giftHistorySnap.size}`);
    } catch (e) {
      console.error("Error leyendo estado inicial Firestore:", e);
    }
  })();
});