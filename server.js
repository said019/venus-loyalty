// server.js - ACTUALIZADO CON NUEVAS RUTAS GOOGLE WALLET
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

// Wallet helpers
import { buildGoogleSaveUrl, checkLoyaltyClass, createLoyaltyClass, updateLoyaltyObject } from "./lib/google.js";
import { buildApplePassBuffer } from "./lib/apple.js";

// Importar los nuevos handlers de Google Wallet
import { 
  createClassHandler, 
  diagnosticsHandler, 
  testHandler, 
  saveCardHandler 
} from "./lib/api/google.js";

// DB
import db from "./lib/db.js";

// Admin auth helpers (JWT en cookie)
import {
  adminAuth,
  signAdmin,
  setAdminCookie,
  clearAdminCookie,
} from "./lib/auth.js";

// __dirname para ESModules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
   📧 Envío de correos: Resend API o SMTP
   ========================================================= */
async function sendMail({ to, subject, text, html }) {
  // 1) Resend
  if (process.env.RESEND_API_KEY) {
    const from =
      process.env.RESEND_FROM || "Venus Admin <onboarding@resend.dev>";
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

  // 2) SMTP
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
   BASIC AUTH (solo para endpoints protegidos tipo staff)
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

// admins
const insertAdmin = db.prepare(
  "INSERT INTO admins (id, email, pass_hash) VALUES (?, ?, ?)"
);
const getAdminByEmail = db.prepare("SELECT * FROM admins WHERE email = ?");
const countAdmins = db.prepare("SELECT COUNT(*) AS n FROM admins");

// admin_resets con admin_id NOT NULL
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_resets (
    token TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    email TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`);
(function ensureAdminResetsSchema() {
  const cols = db.prepare(`PRAGMA table_info(admin_resets)`).all();
  const names = cols.map((c) => c.name);
  const need = ["token", "admin_id", "email", "expires_at"];
  if (!need.every((n) => names.includes(n))) {
    db.exec("DROP TABLE IF EXISTS admin_resets;");
    db.exec(`
      CREATE TABLE admin_resets (
        token TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL,
        email TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `);
    console.log("[DB] admin_resets recreada con admin_id NOT NULL");
  }
})();

const insertReset = db.prepare(
  "INSERT INTO admin_resets (token, admin_id, email, expires_at) VALUES (?, ?, ?, ?)"
);
const findReset = db.prepare("SELECT * FROM admin_resets WHERE token = ?");
const delReset = db.prepare("DELETE FROM admin_resets WHERE token = ?");

// tarjetas / eventos
const insertCard = db.prepare("INSERT INTO cards (id, name, max) VALUES (?, ?, ?)");
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

// métricas
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

// listados admin
const listCardsStmt = db.prepare(`
  SELECT id, name, stamps, max, status, created_at
  FROM cards
  WHERE 1=1
    AND (LOWER(id) LIKE LOWER(@like) OR LOWER(name) LIKE LOWER(@like))
  ORDER BY created_at DESC
  LIMIT @limit OFFSET @offset
`);
const countCardsStmt = db.prepare(`
  SELECT COUNT(*) AS n
  FROM cards
  WHERE 1=1
    AND (LOWER(id) LIKE LOWER(@like) OR LOWER(name) LIKE LOWER(@like))
`);

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
   NUEVAS RUTAS GOOGLE WALLET - SIMPLIFICADAS
   ========================================================= */

// Crear la clase de lealtad
app.get("/api/google/create-class", createClassHandler);

// Diagnóstico completo
app.get("/api/google/diagnostics", diagnosticsHandler);

// Probar Google Wallet
app.get("/api/google/test", testHandler);

// Generar enlace para guardar tarjeta
app.get("/api/save-card", saveCardHandler);

/* =========================================================
   RUTAS EXISTENTES GOOGLE WALLET (se mantienen)
   ========================================================= */
app.get("/api/debug/google-class", async (_req, res) => {
  try {
    const info = await checkLoyaltyClass();
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/debug/google-permissions", async (_req, res) => {
  try {
    const { getWalletAccessToken } = await import('./lib/google.js');
    const token = await getWalletAccessToken();
    
    // Probar acceso a la API
    const response = await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/3388000000023035846.venus_loyalty_v1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const data = await response.json();
    
    res.json({
      canGetToken: true,
      tokenLength: token.length,
      apiResponse: {
        status: response.status,
        statusText: response.statusText,
        data: data
      }
    });
  } catch (error) {
    res.json({
      canGetToken: false,
      error: error.message
    });
  }
});

app.post("/api/debug/test-google-object", async (req, res) => {
  try {
    const { updateLoyaltyObject } = await import('./lib/google.js');
    const result = await updateLoyaltyObject('test-card-123', 'Test Client', 2, 8);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Diagnóstico completo de Google Wallet (mantener compatibilidad)
app.get("/api/debug/google-setup", async (_req, res) => {
  try {
    const diagnostics = {
      environment: {
        GOOGLE_ISSUER_ID: !!process.env.GOOGLE_ISSUER_ID,
        GOOGLE_CLASS_ID: !!process.env.GOOGLE_CLASS_ID,
        GOOGLE_SA_EMAIL: !!process.env.GOOGLE_SA_EMAIL,
        GOOGLE_SA_JSON: !!process.env.GOOGLE_SA_JSON,
        BASE_URL: process.env.BASE_URL
      },
      loyaltyClass: null,
      serviceAccount: null
    };

    // Verificar Service Account
    try {
      const { loadServiceAccount } = await import('./lib/google.js');
      const { client_email } = loadServiceAccount();
      diagnostics.serviceAccount = {
        hasCredentials: true,
        clientEmail: client_email
      };
    } catch (e) {
      diagnostics.serviceAccount = {
        hasCredentials: false,
        error: e.message
      };
    }

    // Verificar Loyalty Class
    try {
      const classCheck = await checkLoyaltyClass();
      diagnostics.loyaltyClass = classCheck;
    } catch (e) {
      diagnostics.loyaltyClass = {
        error: e.message
      };
    }

    res.json(diagnostics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verificar configuración del Issuer ID
app.get("/api/debug/google-issuer-check", (_req, res) => {
  const currentConfig = {
    console_issuer_id: "338800000002303846",
    env_issuer_id: process.env.GOOGLE_ISSUER_ID,
    env_class_id: process.env.GOOGLE_CLASS_ID,
    match: process.env.GOOGLE_ISSUER_ID === "338800000002303846"
  };
  
  res.json(currentConfig);
});

// Verificar caracteres del Class ID
app.get("/api/debug/google-character-check", (_req, res) => {
  const classId = process.env.GOOGLE_CLASS_ID || '';
  
  const characterCheck = {
    classId: classId,
    classIdRaw: JSON.stringify(classId),
    length: classId.length,
    hasSpaces: classId.includes(' '),
    hasDoubleDots: classId.includes('..'),
    characters: classId.split('').map((char, index) => ({
      position: index,
      char: char,
      charCode: char.charCodeAt(0),
      isProblematic: char === ' ' || char === '..'
    })),
    expected: "3388000000023035846.venus_loyalty_v1",
    matchesExpected: classId === "3388000000023035846.venus_loyalty_v1"
  };
  
  res.json(characterCheck);
});

/* ---------- emisión de tarjeta ---------- */
app.post("/api/issue", (req, res) => {
  try {
    let { name = "Cliente", max = 8 } = req.body;
    max = parseInt(max, 10);
    if (!Number.isInteger(max) || max <= 0) {
      return res.status(400).json({ error: "max debe ser entero > 0" });
    }
    const cardId = `card_${Date.now()}`;
    insertCard.run(cardId, String(name).trim() || "Cliente", max);
    logEvent.run(cardId, "ISSUE", JSON.stringify({ name, max }));

    const addToGoogleUrl = buildGoogleSaveUrl({
      cardId,
      name,
      stamps: 0,
      max,
    });
    const base = process.env.BASE_URL || "";
    const addToAppleUrl = `${base}/api/apple/pass?cardId=${encodeURIComponent(
      cardId
    )}`;
    res.json({ cardId, addToGoogleUrl, addToAppleUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ---------- obtener datos tarjeta ---------- */
app.post("/api/create-card", async (req, res) => {
  try {
    const { name, phone, max } = req.body || {};
    if (!name || !phone) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    const maxVal = parseInt(max) || 8;
    const cardId = `card_${Date.now()}`;
    const cleanName = String(name).trim();

    insertCard.run(cardId, cleanName, maxVal);
    logEvent.run(cardId, "ISSUE", JSON.stringify({ name: cleanName, max: maxVal }));

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
   DIAGNÓSTICOS APPLE WALLET
   ========================================================= */

// Diagnóstico básico de variables de entorno
app.get("/api/debug/apple-env", (_req, res) => {
  const need = [
    "APPLE_ORG_NAME",
    "APPLE_PASS_CERT",
    "APPLE_PASS_KEY", 
    "APPLE_WWDR",
    "APPLE_PASS_TYPE_ID",
    "APPLE_TEAM_ID",
  ];
  const status = {};
  for (const k of need) status[k] = !!process.env[k];
  res.json(status);
});

// Diagnóstico detallado de certificados
app.get("/api/debug/apple-certs", (_req, res) => {
  try {
    const certPaths = {
      APPLE_PASS_CERT: process.env.APPLE_PASS_CERT,
      APPLE_PASS_KEY: process.env.APPLE_PASS_KEY,
      APPLE_WWDR: process.env.APPLE_WWDR
    };

    const certChecks = {};
    
    for (const [key, filePath] of Object.entries(certPaths)) {
      if (filePath && fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        certChecks[key] = {
          exists: true,
          size: stats.size,
          hasValidFormat: content.includes('BEGIN') && content.includes('END'),
          firstLine: content.split('\n')[0],
          path: filePath
        };
      } else {
        certChecks[key] = { 
          exists: false,
          path: filePath
        };
      }
    }

    res.json(certChecks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Diagnóstico completo de configuración Apple
app.get("/api/debug/apple-full-check", async (req, res) => {
  try {
    const TEAM_ID = process.env.APPLE_TEAM_ID;
    const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID;
    
    const diagnostics = {
      teamId: TEAM_ID,
      passTypeId: PASS_TYPE_ID,
      expectedPassTypeId: "pass.com.venusloyalty.mx",
      match: PASS_TYPE_ID === "pass.com.venusloyalty.mx",
      certificateInfo: {},
      canGenerateTestPass: false
    };

    // Verificar certificado del Pass Type ID
    if (process.env.APPLE_PASS_CERT && fs.existsSync(process.env.APPLE_PASS_CERT)) {
      const certContent = fs.readFileSync(process.env.APPLE_PASS_CERT, 'utf8');
      const certificate = certContent.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
      
      if (certificate) {
        const certLines = certificate[0].split('\n');
        const subjectLine = certLines.find(line => line.includes('Subject:'));
        diagnostics.certificateInfo = {
          hasCertificate: true,
          subject: subjectLine || 'No subject found',
          containsPassTypeId: certContent.includes(PASS_TYPE_ID),
          size: certContent.length
        };
      }
    }

    // Intentar generar un pase de prueba
    try {
      const testBuffer = await buildApplePassBuffer({
        cardId: 'test-' + Date.now(),
        name: 'Test Client',
        stamps: 2,
        max: 8
      });
      diagnostics.canGenerateTestPass = true;
      diagnostics.testPassSize = testBuffer.length;
    } catch (testError) {
      diagnostics.canGenerateTestPass = false;
      diagnostics.testError = testError.message;
    }

    res.json(diagnostics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pase de prueba para descargar
app.get("/api/apple/test-pass", async (req, res) => {
  try {
    const testPayload = {
      cardId: 'test-' + Date.now(),
      name: 'Cliente Test',
      stamps: 2,
      max: 8
    };

    console.log('Generando pase de prueba con:', testPayload);
    
    const buffer = await buildApplePassBuffer(testPayload);

    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="test-pass.pkpass"`,
      'Content-Length': buffer.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.send(buffer);
  } catch (error) {
    console.error('Error en test pass:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
});

/* ---------- APPLE: generar y descargar .pkpass ---------- */
app.get("/api/apple/pass", async (req, res) => {
  try {
    const { cardId } = req.query;
    if (!cardId) return res.status(400).send("Falta cardId");

    // Usar DB si ya existe la tarjeta
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

    // Generar el .pkpass (Buffer binario)
    const buffer = await buildApplePassBuffer(payload);

    // Headers correctos para Apple Wallet
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

/* ---------- sumar sello ---------- */
app.post("/api/stamp/:cardId", basicAuth, (req, res) => {
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

/* ---------- canjear ---------- */
app.post("/api/redeem/:cardId", basicAuth, (req, res) => {
  try {
    const { cardId } = req.params;
    const card = getCard.get(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });
    if (card.stamps < card.max)
      return res.status(400).json({ error: "Aún no completa los sellos" });

    updStamps.run(0, cardId);
    logEvent.run(cardId, "REDEEM", JSON.stringify({ by: "reception" }));

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

/* ---------- export CSV ---------- */
app.get("/api/export.csv", basicAuth, (_req, res) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT id, name, stamps, max, status, created_at
      FROM cards
      ORDER BY created_at DESC
    `
      )
      .all();

    const header = "id,name,stamps,max,status,created_at";
    const csvLines = rows.map((r) =>
      [r.id, r.name, r.stamps, r.max, r.status, r.created_at]
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
   ADMIN (auth + panel)
   ========================================================= */
app.post("/api/admin/register", async (req, res) => {
  try {
    const allow =
      (process.env.ADMIN_ALLOW_SIGNUP || "false").toLowerCase() === "true";
    const { n } = countAdmins.get();
    if (!allow && n > 0) return res.status(403).json({ error: "signup_disabled" });

    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "missing_fields" });

    const norm = String(email).trim().toLowerCase();
    const exists = getAdminByEmail.get(norm);
    if (exists) return res.status(409).json({ error: "email_in_use" });

    const id = `adm_${Date.now()}`;
    const pass_hash = await bcrypt.hash(password, 10);
    insertAdmin.run(id, norm, pass_hash);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "missing_fields" });

    const admin = getAdminByEmail.get(String(email).trim().toLowerCase());
    if (!admin) return res.status(401).json({ error: "invalid_credentials" });

    const ok = await bcrypt.compare(password, admin.pass_hash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    const token = signAdmin({ id: admin.id, email: admin.email });
    setAdminCookie(res, token);
    res.json({ ok: true });
  } catch (e) {
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

app.post("/api/admin/stamp", adminAuth, (req, res) => {
  try {
    const { cardId } = req.body || {};
    if (!cardId) return res.status(400).json({ error: "missing_cardId" });

    const card = getCard.get(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });
    if (card.stamps >= card.max)
      return res.status(400).json({ error: "already_full" });
    if (!canStamp(cardId))
      return res.status(429).json({ error: "Solo 1 sello por día" });

    const newStamps = card.stamps + 1;
    updStamps.run(newStamps, cardId);
    logEvent.run(cardId, "STAMP", JSON.stringify({ by: "admin" }));

    res.json({ ok: true, cardId, stamps: newStamps });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/redeem", adminAuth, (req, res) => {
  try {
    const { cardId } = req.body || {};
    if (!cardId) return res.status(400).json({ error: "missing_cardId" });

    const card = getCard.get(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });
    if (card.stamps < card.max)
      return res.status(400).json({ error: "not_enough_stamps" });

    updStamps.run(0, cardId);
    logEvent.run(cardId, "REDEEM", JSON.stringify({ by: "admin" }));

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
   RECUPERACIÓN DE CONTRASEÑA (admin)
   ========================================================= */
app.post("/api/admin/forgot", async (req, res) => {
  try {
    const email = String((req.body?.email || "")).trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "missing_email" });

    const admin = getAdminByEmail.get(email);
    // Siempre 200 para no revelar si existe
    if (!admin) return res.json({ ok: true });

    const token = crypto.randomBytes(24).toString("hex");
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
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
   DEBUG MAIL (para Postman)
   ========================================================= */
app.post("/api/debug/mail", async (req, res) => {
  try {
    const to = String((req.body?.to || "").trim());
    if (!to) return res.status(400).json({ error: "missing_to" });

    const r = await sendMail({
      to,
      subject: "Prueba de correo — Venus",
      text: "Hola 👋 Este es un correo de prueba.",
      html: "<p>Hola 👋</p><p>Este es un correo de prueba.</p>",
    });

    res.json({ ok: true, channel: r.channel, messageId: r.id, to });
  } catch (e) {
    console.error("[MAIL TEST]", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* =========================================================
   SERVER
   ========================================================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en http://localhost:${PORT}`);
  console.log(`📱 Google Wallet endpoints disponibles:`);
  console.log(`   • Crear clase: http://localhost:${PORT}/api/google/create-class`);
  console.log(`   • Diagnóstico: http://localhost:${PORT}/api/google/diagnostics`);
  console.log(`   • Probar: http://localhost:${PORT}/api/google/test`);
  console.log(`   • Generar enlace: http://localhost:${PORT}/api/save-card?cardId=test123&name=Maria&stamps=3&max=8`);
});