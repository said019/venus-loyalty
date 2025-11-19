// server.js - COMPLETO CON APPLE WALLET APNs
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

// DB local (SQLite)
import db from "./lib/db.js";

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
   MIGRACIÓN DE BASE DE DATOS - AGREGAR COLUMNA PHONE
   ========================================================= */
function runMigrations() {
  try {
    const tableInfo = db.prepare("PRAGMA table_info(cards)").all();
    const hasPhoneColumn = tableInfo.some(column => column.name === 'phone');
    
    if (!hasPhoneColumn) {
      console.log('[DB MIGRATION] Agregando columna phone a tabla cards...');
      db.exec("ALTER TABLE cards ADD COLUMN phone TEXT");
      console.log('[DB MIGRATION] ✅ Columna phone agregada exitosamente');
    } else {
      console.log('[DB MIGRATION] ✅ Columna phone ya existe en tabla cards');
    }
  } catch (error) {
    console.error('[DB MIGRATION ERROR]', error);
  }
}

runMigrations();

const deleteCardStmt = db.prepare("DELETE FROM cards WHERE id = ?");
const deleteEventsByCardStmt = db.prepare("DELETE FROM events WHERE card_id = ?");

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
   SQL: tablas y prepared statements
   ========================================================= */

const insertAdmin = db.prepare(
  "INSERT INTO admins (id, email, pass_hash) VALUES (?, ?, ?)"
);
const getAdminByEmail = db.prepare("SELECT * FROM admins WHERE email = ?");
const getAdminById = db.prepare("SELECT * FROM admins WHERE id = ?");
const countAdmins = db.prepare("SELECT COUNT(*) AS n FROM admins");

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_resets (
    token TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    email TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`);

const insertReset = db.prepare(
  "INSERT INTO admin_resets (token, admin_id, email, expires_at) VALUES (?, ?, ?, ?)"
);
const findReset = db.prepare("SELECT * FROM admin_resets WHERE token = ?");
const delReset = db.prepare("DELETE FROM admin_resets WHERE token = ?");

const insertCard = db.prepare(
  "INSERT INTO cards (id, name, max, phone) VALUES (?, ?, ?, ?)"
);
const getCard = db.prepare("SELECT * FROM cards WHERE id = ?");
const updStamps = db.prepare("UPDATE cards SET stamps = ? WHERE id = ?");
const logEvent = db.prepare(
  "INSERT INTO events (card_id, type, meta) VALUES (?, ?, ?)"
);
const lastStampStmt = db.prepare(`
  SELECT created_at FROM events
  WHERE card_id = ? AND type = 'STAMP'
  ORDER BY id DESC LIMIT 1
`);
const listEvents = db.prepare(`
  SELECT id, type, meta, created_at
  FROM events
  WHERE card_id = ?
  ORDER BY id DESC
`);

const countAllCards = db.prepare(`SELECT COUNT(*) AS n FROM cards`);
const countFullCards = db.prepare(
  `SELECT COUNT(*) AS n FROM cards WHERE stamps >= max`
);
const countEventsToday = db.prepare(`
  SELECT type, COUNT(*) AS n
  FROM events
  WHERE DATE(created_at) = DATE('now','localtime')
  GROUP BY type
`);

const listCardsStmt = db.prepare(`
  SELECT id, name, phone, stamps, max, status, created_at
  FROM cards
  WHERE 1=1
    AND (LOWER(id) LIKE LOWER(@like) OR LOWER(name) LIKE LOWER(@like) OR LOWER(phone) LIKE LOWER(@like))
  ORDER BY created_at DESC
  LIMIT @limit OFFSET @offset
`);
const countCardsStmt = db.prepare(`
  SELECT COUNT(*) AS n
  FROM cards
  WHERE 1=1
    AND (LOWER(id) LIKE LOWER(@like) OR LOWER(name) LIKE LOWER(@like) OR LOWER(phone) LIKE LOWER(@like))
`);

function canStamp(cardId) {
  const row = lastStampStmt.get(cardId);
  if (!row || !row.created_at) return true;
  const last = new Date(row.created_at);
  const now = new Date();
  const diffMs = now - last;
  return diffMs >= 23 * 60 * 60 * 1000;
}

/* =========================================================
   HELPERS FIRESTORE
   ========================================================= */
async function fsUpsertCard({ id, name, phone, max, stamps, status }) {
  try {
    if (!firestore) {
      console.log('[Firestore] No disponible - saltando sync de card');
      return;
    }
    const now = new Date().toISOString();
    await firestore.collection("cards").doc(id).set(
      {
        id,
        name,
        phone: phone || null,
        max,
        stamps,
        status: status || "active",
        updatedAt: now,
      },
      { merge: true }
    );
    console.log(`[Firestore] ✅ Card ${id} sincronizada`);
  } catch (e) {
    console.error(`[Firestore card ${id}]`, e.message);
  }
}

async function fsAddEvent(cardId, type, meta = {}) {
  try {
    if (!firestore) return;
    await firestore.collection("events").add({
      cardId,
      type,
      meta,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[Firestore event]", e.message);
  }
}

async function fsUpsertAdmin({ id, email, pass_hash }) {
  try {
    if (!firestore) return;
    const now = new Date().toISOString();
    await firestore.collection("admins").doc(id).set(
      {
        id,
        email,
        pass_hash,
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    );
  } catch (e) {
    console.error("[Firestore admin]", e.message);
  }
}

async function fsDeleteCard(cardId) {
  try {
    if (!firestore) return;
    
    await firestore.collection("cards").doc(cardId).delete();
    console.log(`[Firestore] ✅ Card ${cardId} eliminada`);
    
    const evSnap = await firestore
      .collection("events")
      .where("cardId", "==", cardId)
      .get();
    
    if (!evSnap.empty) {
      const batch = firestore.batch();
      evSnap.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      console.log(`[Firestore] ✅ ${evSnap.size} eventos eliminados`);
    }
  } catch (e) {
    console.error(`[Firestore delete card ${cardId}]`, e.message);
  }
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

app.get('/api/debug/apple-devices', (req, res) => {
  try {
    const devices = db.prepare('SELECT * FROM apple_devices').all();
    const updates = db.prepare('SELECT * FROM apple_updates ORDER BY id DESC LIMIT 10').all();
    res.json({ devices, recentUpdates: updates });
  } catch (e) {
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

    insertCard.run(cardId, cleanName, max, phone);
    logEvent.run(cardId, "ISSUE", JSON.stringify({ name: cleanName, max, phone }));

    await fsUpsertCard({
      id: cardId,
      name: cleanName,
      phone,
      max,
      stamps: 0,
      status: "active",
    });
    await fsAddEvent(cardId, "ISSUE", { name: cleanName, max, phone });

    const addToGoogleUrl = buildGoogleSaveUrl({
      cardId,
      name: cleanName,
      stamps: 0,
      max,
    });
    const base = process.env.BASE_URL || "";
    const addToAppleUrl = `${base}/api/apple/pass?cardId=${encodeURIComponent(cardId)}`;
    res.json({ cardId, addToGoogleUrl, addToAppleUrl });
  } catch (error) {
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

    insertCard.run(cardId, cleanName, maxVal, phone);
    logEvent.run(
      cardId,
      "ISSUE",
      JSON.stringify({ name: cleanName, phone, max: maxVal })
    );

    await fsUpsertCard({
      id: cardId,
      name: cleanName,
      phone,
      max: maxVal,
      stamps: 0,
      status: "active",
    });
    await fsAddEvent(cardId, "ISSUE", {
      name: cleanName,
      phone,
      max: maxVal,
    });

    const addToGoogleUrl = buildGoogleSaveUrl({
      cardId,
      name: cleanName,
      stamps: 0,
      max: maxVal,
    });

    const base = process.env.BASE_URL || "https://venus-loyalty.onrender.com";
    const addToAppleUrl = `${base}/api/apple/pass?cardId=${encodeURIComponent(cardId)}`;
    const url = `${base}/?cardId=${cardId}`;

    res.json({
      url,
      cardId,
      name: cleanName,
      stamps: 0,
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

    insertCard.run(cardId, cleanName, maxVal, phone);
    logEvent.run(
      cardId,
      "ISSUE",
      JSON.stringify({ name: cleanName, phone, max: maxVal })
    );

    await fsUpsertCard({
      id: cardId,
      name: cleanName,
      phone,
      max: maxVal,
      stamps: 0,
      status: "active",
    });
    await fsAddEvent(cardId, "ISSUE", {
      name: cleanName,
      phone,
      max: maxVal,
    });

    const addToGoogleUrl = buildGoogleSaveUrl({
      cardId,
      name: cleanName,
      stamps: 0,
      max: maxVal,
    });

    const base = process.env.BASE_URL || "https://venus-loyalty.onrender.com";
    const addToAppleUrl = `${base}/api/apple/pass?cardId=${encodeURIComponent(cardId)}`;
    const url = `${base}/?cardId=${cardId}`;

    res.json({
      url,
      cardId,
      name: cleanName,
      stamps: 0,
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
app.get("/api/card/:cardId", (req, res) => {
  try {
    const card = getCard.get(req.params.cardId);
    if (!card) return res.status(404).json({ error: "not_found" });
    res.json(card);
  } catch (e) {
    console.error('[GET card]', e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/events/:cardId", (req, res) => {
  const rows = listEvents.all(req.params.cardId);
  res.json(rows);
});

app.get("/api/wallet-link/:cardId", (req, res) => {
  const card = getCard.get(req.params.cardId);
  if (!card) return res.status(404).json({ error: "not_found" });
  const addToGoogleUrl = buildGoogleSaveUrl({
    cardId: card.id,
    name: card.name,
    stamps: card.stamps,
    max: card.max,
  });
  res.json({ addToGoogleUrl });
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

    const existing = getCard.get(cardId);
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
app.get("/api/admin/metrics-firebase", adminAuth, async (req, res) => {
  try {
    const total = countAllCards.get().n;
    const full = countFullCards.get().n;
    
    const rows = countEventsToday.all();
    const m = { STAMP: 0, REDEEM: 0 };
    for (const r of rows) m[r.type] = r.n;
    
    res.json({
      total,
      full,
      stampsToday: m.STAMP || 0,
      redeemsToday: m.REDEEM || 0,
      source: 'sqlite'
    });
  } catch (e) {
    console.error('[METRICS]', e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/cards-firebase", adminAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = 12;
    const offset = (page - 1) * limit;
    const q = (req.query.q || '').trim();
    const like = q ? `%${q}%` : '%';
    
    const items = listCardsStmt.all({ like, limit, offset });
    const { n } = countCardsStmt.get({ like });
    const totalPages = Math.max(1, Math.ceil(n / limit));
    
    res.json({ 
      page, 
      totalPages, 
      total: n, 
      items,
      source: 'sqlite'
    });
  } catch (e) {
    console.error('[CARDS LIST]', e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/events-firebase", adminAuth, async (req, res) => {
  try {
    const { cardId } = req.query || {};
    if (!cardId) return res.status(400).json({ error: 'missing_cardId' });
    
    const items = listEvents.all(cardId);
    
    res.json({ items, source: 'sqlite' });
  } catch (e) {
    console.error('[EVENTS]', e);
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   SUMAR SELLO (staff) - CON NOTIFICACIÓN APPLE
   ========================================================= */
app.post("/api/stamp/:cardId", basicAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const card = getCard.get(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });
    if (card.stamps >= card.max)
      return res.json({ ...card, message: "Tarjeta ya completa" });
    if (!canStamp(cardId))
      return res.status(429).json({ error: "Solo 1 sello por día" });

    const newStamps = card.stamps + 1;
    updStamps.run(newStamps, cardId);
    logEvent.run(cardId, "STAMP", JSON.stringify({ by: "reception" }));

    await fsUpsertCard({
      id: cardId,
      name: card.name,
      phone: card.phone,
      max: card.max,
      stamps: newStamps,
      status: card.status,
    });
    await fsAddEvent(cardId, "STAMP", { by: "reception" });

    // 🍎 Notificar a Apple Wallet
    try {
      await appleWebService.updatePassAndNotify(cardId, card.stamps, newStamps);
    } catch (err) {
      console.error('[APPLE] Error notificando:', err);
    }

    const addToGoogleUrl = buildGoogleSaveUrl({
      cardId,
      name: card.name,
      stamps: newStamps,
      max: card.max,
    });
    res.json({ ...card, stamps: newStamps, addToGoogleUrl });
  } catch (e) {
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
    const card = getCard.get(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });
    if (card.stamps < card.max)
      return res.status(400).json({ error: "Aún no completa los sellos" });

    updStamps.run(0, cardId);
    logEvent.run(cardId, "REDEEM", JSON.stringify({ by: "reception" }));

    await fsUpsertCard({
      id: cardId,
      name: card.name,
      phone: card.phone,
      max: card.max,
      stamps: 0,
      status: card.status,
    });
    await fsAddEvent(cardId, "REDEEM", { by: "reception" });

    // 🍎 Notificar a Apple Wallet
    try {
      await appleWebService.updatePassAndNotify(cardId, card.stamps, 0);
    } catch (err) {
      console.error('[APPLE] Error notificando:', err);
    }

    const addToGoogleUrl = buildGoogleSaveUrl({
      cardId,
      name: card.name,
      stamps: 0,
      max: card.max,
    });
    res.json({ ok: true, message: "Canje realizado", cardId, addToGoogleUrl });
  } catch (e) {
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

    const card = getCard.get(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });

    const { getWalletAccessToken } = await import("./lib/google.js");
    const token = await getWalletAccessToken();

    const issuerId = process.env.GOOGLE_ISSUER_ID;
    if (!issuerId) {
      return res.status(500).json({ error: "missing_GOOGLE_ISSUER_ID" });
    }

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
app.get("/api/export.csv", basicAuth, (_req, res) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT id, name, phone, stamps, max, status, created_at
      FROM cards
      ORDER BY created_at DESC
    `
      )
      .all();

    const header = "id,name,phone,stamps,max,status,created_at";
    const csvLines = rows.map((r) =>
      [r.id, r.name, r.phone || '', r.stamps, r.max, r.status, r.created_at]
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

    const card = getCard.get(cardId);
    if (!card) {
      return res.status(404).json({ error: "card not found" });
    }

    deleteEventsByCardStmt.run(cardId);
    deleteCardStmt.run(cardId);

    await fsDeleteCard(cardId);

    res.json({ ok: true, cardId, message: 'Tarjeta eliminada correctamente' });
  } catch (e) {
    console.error('[DELETE CARD ERROR]', e);
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   ADMIN AUTH
   ========================================================= */
app.post("/api/admin/register", async (req, res) => {
  try {
    const allow = (process.env.ADMIN_ALLOW_SIGNUP || "false").toLowerCase() === "true";
    const { n } = countAdmins.get();
    if (!allow && n > 0) return res.status(403).json({ error: "signup_disabled" });

    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "missing_fields" });

    const norm = String(email).trim().toLowerCase();
    
    const exists = getAdminByEmail.get(norm);
    if (exists) {
      return res.status(409).json({ error: "email_in_use" });
    }

    const id = `adm_${Date.now()}`;
    const pass_hash = await bcrypt.hash(password, 10);

    insertAdmin.run(id, norm, pass_hash);
    await fsUpsertAdmin({ id, email: norm, pass_hash });

    res.json({ ok: true });
  } catch (e) {
    console.error("[ADMIN REGISTER]", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "missing_fields" });

    const norm = String(email).trim().toLowerCase();
    
    const admin = getAdminByEmail.get(norm);
    if (!admin) {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    const ok = await bcrypt.compare(password, admin.pass_hash);
    if (!ok) {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    await fsUpsertAdmin({ id: admin.id, email: admin.email, pass_hash: admin.pass_hash });

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

app.get("/api/admin/cards", adminAuth, (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = 12;
    const offset = (page - 1) * limit;
    const like = `%${String(req.query.q || "").trim()}%`;

    const items = listCardsStmt.all({ like, limit, offset });
    const { n } = countCardsStmt.get({ like });
    const totalPages = Math.max(1, Math.ceil(n / limit));

    res.json({ page, totalPages, total: n, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/events", adminAuth, (req, res) => {
  try {
    const { cardId } = req.query || {};
    if (!cardId) return res.status(400).json({ error: "missing_cardId" });
    const items = listEvents.all(cardId);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/stamp", adminAuth, async (req, res) => {
  try {
    const { cardId } = req.body || {};
    if (!cardId) return res.status(400).json({ error: "missing_cardId" });

    const card = getCard.get(cardId);
    if (!card) {
      return res.status(404).json({ error: "card not found" });
    }
    
    if (card.stamps >= card.max) return res.status(400).json({ error: "already_full" });
    if (!canStamp(cardId)) return res.status(429).json({ error: "Solo 1 sello por día" });

    const newStamps = card.stamps + 1;
    updStamps.run(newStamps, cardId);
    logEvent.run(cardId, "STAMP", JSON.stringify({ by: "admin" }));

    await fsUpsertCard({
      id: cardId,
      name: card.name,
      phone: card.phone,
      max: card.max,
      stamps: newStamps,
      status: card.status,
    });
    await fsAddEvent(cardId, "STAMP", { by: "admin" });

    // 🍎 Notificar a Apple Wallet
    try {
      await appleWebService.updatePassAndNotify(cardId, card.stamps, newStamps);
    } catch (err) {
      console.error('[APPLE] Error notificando:', err);
    }

    res.json({ ok: true, cardId, stamps: newStamps });
  } catch (e) {
    console.error('[ADMIN STAMP]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/redeem", adminAuth, async (req, res) => {
  try {
    const { cardId } = req.body || {};
    if (!cardId) return res.status(400).json({ error: "missing_cardId" });

    const card = getCard.get(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });
    if (card.stamps < card.max) return res.status(400).json({ error: "not_enough_stamps" });

    updStamps.run(0, cardId);
    logEvent.run(cardId, "REDEEM", JSON.stringify({ by: "admin" }));

    await fsUpsertCard({
      id: cardId,
      name: card.name,
      phone: card.phone,
      max: card.max,
      stamps: 0,
      status: card.status,
    });
    await fsAddEvent(cardId, "REDEEM", { by: "admin" });

    // 🍎 Notificar a Apple Wallet
    try {
      await appleWebService.updatePassAndNotify(cardId, card.stamps, 0);
    } catch (err) {
      console.error('[APPLE] Error notificando:', err);
    }

    res.json({ ok: true, cardId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/metrics", adminAuth, (_req, res) => {
  try {
    const total = countAllCards.get().n;
    const full = countFullCards.get().n;
    const rows = countEventsToday.all();
    const m = { STAMP: 0, REDEEM: 0 };
    for (const r of rows) m[r.type] = r.n;
    res.json({
      total,
      full,
      stampsToday: m.STAMP || 0,
      redeemsToday: m.REDEEM || 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   RECUPERACIÓN DE CONTRASEÑA
   ========================================================= */
app.post("/api/admin/forgot", async (req, res) => {
  try {
    const email = String((req.body?.email || "")).trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "missing_email" });

    const admin = getAdminByEmail.get(email);
    if (!admin) return res.json({ ok: true });

    const token = crypto.randomBytes(24).toString("hex");
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    insertReset.run(token, admin.id, email, expires);

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

    const row = findReset.get(token);
    if (!row) return res.status(400).json({ error: "invalid_token" });

    if (new Date(row.expires_at) < new Date()) {
      delReset.run(token);
      return res.status(400).json({ error: "expired" });
    }

    const pass_hash = await bcrypt.hash(password, 10);
    db.prepare("UPDATE admins SET pass_hash = ? WHERE id = ?").run(
      pass_hash,
      row.admin_id
    );
    delReset.run(token);

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
    const sqliteCards = countAllCards.get().n;
    const sqliteAdmins = countAdmins.get().n;
    
    let firestoreCards = 0;
    let firestoreAdmins = 0;
    
    try {
      const cardsSnap = await firestore.collection('cards').get();
      firestoreCards = cardsSnap.size;
      
      const adminsSnap = await firestore.collection('admins').get();
      firestoreAdmins = adminsSnap.size;
    } catch (e) {
      console.error('[Firestore count]', e);
    }
    
    res.json({
      sqlite: {
        cards: sqliteCards,
        admins: sqliteAdmins
      },
      firestore: {
        cards: firestoreCards,
        admins: firestoreAdmins
      },
      sync: {
        cardsMatch: sqliteCards === firestoreCards,
        adminsMatch: sqliteAdmins === firestoreAdmins
      }
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
  console.log(`\n📱 Endpoints disponibles:`);
  console.log(`   • Admin: http://localhost:${PORT}/admin`);
  console.log(`   • Staff: http://localhost:${PORT}/staff.html`);
  console.log(`   • Google Wallet: http://localhost:${PORT}/api/google/diagnostics`);
  console.log(`   • Apple APNs Status: http://localhost:${PORT}/api/debug/apple-apns`);
  console.log(`\n🔍 Diagnóstico:`);
  console.log(`   • DB Status: http://localhost:${PORT}/api/debug/database-status`);
  
  try {
    const cards = countAllCards.get().n;
    const admins = countAdmins.get().n;
    console.log(`\n📊 Estado actual:`);
    console.log(`   • Tarjetas: ${cards}`);
    console.log(`   • Admins: ${admins}`);
  } catch (e) {
    console.error('Error leyendo estado inicial:', e);
  }
});