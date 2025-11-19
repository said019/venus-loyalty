// server.js - COMPLETO CON APPLE WALLET APNs - MIGRADO A FIRESTORE
import express from "express";
import cors from "cors";
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import crypto from "crypto";
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

// __dirname para ESModules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================================================
   DATA LAYER FIRESTORE (reemplaza todo lo de SQLite)
   ========================================================= */

if (!firestore) {
  console.error("❌ Firestore NO está inicializado. Revisa lib/firebase.js");
}

const COL_CARDS    = "cards";
const COL_EVENTS   = "events";
const COL_ADMINS   = "admins";
const COL_RESETS   = "admin_resets";
const COL_DEVICES  = "apple_devices";
const COL_UPDATES  = "apple_updates";

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

async function fsCreateCard({ id, name, phone, max }) {
  const now = new Date().toISOString();
  const doc = {
    id,
    name,
    phone: phone || null,
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

async function fsListCardsPage({ page = 1, limit = 12, q = "" }) {
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
        return (
          id.includes(like) || name.includes(like) || phone.includes(like)
        );
      })
    : allDocs;

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const slice = filtered
    .sort((a, b) => {
      const ca = a.data();
      const cb = b.data();
      return (cb.createdAt || "").localeCompare(ca.createdAt || "");
    })
    .slice(offset, offset + limit)
    .map((d) => d.data());

  return { page, totalPages, total, items: slice };
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

/* =========================================================
   APP base
   ========================================================= */
const app = express();
app.set("trust proxy", true);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("public"));

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
/* ===== DEBUG: APPLE REQUESTS ===== */
app.use('/api/apple/v1', (req, res, next) => {
  console.log('[APPLE DEBUG] ==================');
  console.log('[APPLE DEBUG] Petición recibida:');
  console.log('[APPLE DEBUG] Method:', req.method);
  console.log('[APPLE DEBUG] URL:', req.url);
  console.log('[APPLE DEBUG] Path:', req.path);
  console.log('[APPLE DEBUG] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('[APPLE DEBUG] Body:', JSON.stringify(req.body, null, 2));
  console.log('[APPLE DEBUG] ==================');
  next();
});
// ⭐ AGREGAR OTRO DEBUG PARA /v1 (sin /api)
app.use('/v1', (req, res, next) => {
  console.log('[APPLE DEBUG] ==================');
  console.log('[APPLE DEBUG] Petición recibida:');
  console.log('[APPLE DEBUG] Method:', req.method);
  console.log('[APPLE DEBUG] URL:', req.url);
  console.log('[APPLE DEBUG] Path:', req.path);
  console.log('[APPLE DEBUG] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('[APPLE DEBUG] Body:', JSON.stringify(req.body, null, 2));
  console.log('[APPLE DEBUG] ==================');
  next();
});

/* =========================================================
   🍎 APPLE WALLET WEB SERVICE ENDPOINTS
   ========================================================= */
console.log('[APPLE] Configurando endpoints del web service...');

const appleAuth = appleWebService.appleAuthMiddleware;

app.post(
  '/api/apple/v1/devices/:deviceId/registrations/:passTypeId/:serial',
  appleAuth,
  appleWebService.registerDeviceHandler
);

app.get(
  '/api/apple/v1/devices/:deviceId/registrations/:passTypeId',
  appleAuth,
  appleWebService.getUpdatablePassesHandler
);

app.get(
  '/api/apple/v1/passes/:passTypeId/:serial',
  appleAuth,
  appleWebService.getLatestPassHandler
);

app.delete(
  '/api/apple/v1/devices/:deviceId/registrations/:passTypeId/:serial',
  appleAuth,
  appleWebService.unregisterDeviceHandler
);

app.post(
  '/api/apple/v1/log',
  appleAuth,
  appleWebService.logHandler
);
// ========== ENDPOINTS CORTOS (sin /api - para Apple) ==========
app.post('/v1/devices/:deviceId/registrations/:passTypeId/:serial',
  appleAuth, appleWebService.registerDeviceHandler);

app.get('/v1/devices/:deviceId/registrations/:passTypeId',
  appleAuth, appleWebService.getUpdatablePassesHandler);

app.get('/v1/passes/:passTypeId/:serial',
  appleAuth, appleWebService.getLatestPassHandler);

app.delete('/v1/devices/:deviceId/registrations/:passTypeId/:serial',
  appleAuth, appleWebService.unregisterDeviceHandler);

app.post('/v1/log',
  appleAuth, appleWebService.logHandler);

console.log('[APPLE] ✅ Endpoints configurados');

/* =========================================================
   DEBUG ENDPOINTS
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
      webServiceUrl: process.env.BASE_URL + '/api/apple/v1'
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

/* =========================================================
   EMISIÓN DE TARJETA
   ========================================================= */
app.post("/api/issue", async (req, res) => {
  try {
    let { name = "Cliente", max = 8, phone = "" } = req.body;
    max = parseInt(max, 10);
    if (!Number.isInteger(max) || max <= 0) {
      return res.status(400).json({ error: "max debe ser entero > 0" });
    }

    const cardId = `card_${Date.now()}`;
    const cleanName = String(name).trim() || "Cliente";

    const card = await fsCreateCard({ id: cardId, name: cleanName, phone, max });
    await fsAddEvent(cardId, "ISSUE", { name: cleanName, max, phone });

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
    const { name, phone, max } = req.query;
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
      max: maxVal,
    });
    await fsAddEvent(cardId, "ISSUE", {
      name: cleanName,
      phone,
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
    const { name, phone, max } = req.body || {};
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
      max: maxVal,
    });
    await fsAddEvent(cardId, "ISSUE", {
      name: cleanName,
      phone,
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
    };

    const buffer = await buildApplePassBuffer(testPayload);

    res.set({
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="test-pass.pkpass"`,
      "Content-Length": buffer.length,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });

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
        }
      : {
          cardId: String(cardId),
          name: "Cliente",
          stamps: 0,
          max: 8,
        };

    const buffer = await buildApplePassBuffer(payload);

    res.set({
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="${payload.cardId}.pkpass"`,
      "Content-Transfer-Encoding": "binary",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
    });

    res.status(200).send(buffer);
  } catch (e) {
    console.error("[APPLE PASS ERROR]", e);
    res.status(500).send(e.message || "pkpass_error");
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

app.get("/api/admin/cards-firebase", adminAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const q = (req.query.q || "").trim();
    const data = await fsListCardsPage({ page, limit: 12, q });
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
   SUMAR SELLO (staff) - CON NOTIFICACIÓN APPLE
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

    try {
      await appleWebService.updatePassAndNotify(cardId, card.stamps, newStamps);
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

    try {
      await appleWebService.updatePassAndNotify(cardId, prev, 0);
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
   NOTIFICAR A UNA SOLA TARJETA
   ========================================================= */
app.post("/api/admin/push-one", adminAuth, async (req, res) => {
  try {
    const { cardId, title, message, type } = req.body || {};
    if (!cardId || !title || !message) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const card = await fsGetCard(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });

    const { getWalletAccessToken } = await import("./lib/google.js");
    const token = await getWalletAccessToken();

    const issuerId = process.env.GOOGLE_ISSUER_ID;
    if (!issuerId) {
      return res.status(500).json({ error: "missing_GOOGLE_ISSUER_ID" });
    }

    const objectId = `${issuerId}.${cardId}`;

    const resp = await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(
        objectId
      )}/addMessage`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            header: title,
            body: message,
            kind: "walletobjects#message",
          },
        }),
      }
    );

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("[push-one error]", resp.status, data);
      return res.status(500).json({ error: "google_api_error", details: data });
    }

    res.json({ success: true, cardId, googleStatus: resp.status });
  } catch (e) {
    console.error("[push-one]", e);
    res.status(500).json({ error: e.message });
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

    const header = "id,name,phone,stamps,max,status,created_at";
    const csvLines = rows.map((r) =>
      [
        r.id,
        r.name,
        r.phone || "",
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
    const data = await fsListCardsPage({ page, limit: 12, q });
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

    try {
      await appleWebService.updatePassAndNotify(cardId, prev, 0);
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
   DEBUG
   ========================================================= */
app.get("/api/debug/database-status", adminAuth, async (req, res) => {
  try {
    let firestoreCards = 0;
    let firestoreAdmins = 0;

    const cardsSnap = await firestore.collection(COL_CARDS).get();
    firestoreCards = cardsSnap.size;

    const adminsSnap = await firestore.collection(COL_ADMINS).get();
    firestoreAdmins = adminsSnap.size;

    res.json({
      firestore: {
        cards: firestoreCards,
        admins: firestoreAdmins,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
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

  (async () => {
    try {
      const cardsSnap = await firestore.collection(COL_CARDS).get();
      const adminsSnap = await firestore.collection(COL_ADMINS).get();
      console.log(`\n📊 Estado actual Firestore:`);
      console.log(`   • Tarjetas: ${cardsSnap.size}`);
      console.log(`   • Admins: ${adminsSnap.size}`);
    } catch (e) {
      console.error("Error leyendo estado inicial Firestore:", e);
    }
  })();
});