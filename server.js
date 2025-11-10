// server.js
import express from "express";
import cors from "cors";
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";

// Wallet helpers
import { buildGoogleSaveUrl, checkLoyaltyClass } from "./lib/google.js";
import { buildApplePassBuffer } from "./lib/apple.js";

// DB
import db from "./lib/db.js";

// Admin auth helpers (JWT en cookie)
import { adminAuth, signAdmin, setAdminCookie, clearAdminCookie } from "./lib/auth.js";

// __dirname para ESModules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================================================
   MAIL: Resend API (preferido) o SMTP (respaldo)
   ========================================================= */
async function sendMail({ to, subject, text, html }) {
  // A) Resend API (más simple). Solo requiere RESEND_API_KEY y RESEND_FROM
  if (process.env.RESEND_API_KEY) {
    const sender = process.env.RESEND_FROM || "Venus Admin <no-reply@your-domain.com>";
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: Array.isArray(to) ? to : [to],
        subject,
        text,
        html,
      }),
    });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error("Resend error: " + JSON.stringify(j));
    }
    return { channel: "resend", id: j?.id || null };
  }

  // B) SMTP (por ejemplo smtp.resend.com, Gmail u otro)
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
   BASIC AUTH (solo si mantienes /staff)
   ========================================================= */
function basicAuth(req, res, next) {
  const hdr = req.headers.authorization || "";
  if (!hdr.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="Staff"');
    return res.status(401).send("Auth required");
  }
  const b64 = hdr.split(" ")[1] || "";
  const [user, pass] = Buffer.from(b64, "base64").toString().split(":");
  if (user === process.env.STAFF_USER && pass === process.env.STAFF_PASS) return next();
  res.set("WWW-Authenticate", 'Basic realm="Staff"');
  return res.status(401).send("Invalid credentials");
}

/* =========================================================
   SQL: tablas y prepared statements
   ========================================================= */

// --- admins (asumido existente)
const insertAdmin     = db.prepare("INSERT INTO admins (id, email, pass_hash) VALUES (?, ?, ?)");
const getAdminByEmail = db.prepare("SELECT * FROM admins WHERE email = ?");
const countAdmins     = db.prepare("SELECT COUNT(*) AS n FROM admins");

// --- admin_resets (token de recuperación) con migración a admin_id NOT NULL
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_resets (
    token TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    email TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`);
function ensureAdminResetsSchema() {
  const cols = db.prepare(`PRAGMA table_info(admin_resets)`).all();
  const names = cols.map(c => c.name);
  const need = ["token", "admin_id", "email", "expires_at"];
  const ok = need.every(n => names.includes(n));
  if (!ok) {
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
}
ensureAdminResetsSchema();

const insertReset = db.prepare("INSERT INTO admin_resets (token, admin_id, email, expires_at) VALUES (?, ?, ?, ?)");
const findReset   = db.prepare("SELECT * FROM admin_resets WHERE token = ?");
const delReset    = db.prepare("DELETE FROM admin_resets WHERE token = ?");

// --- tarjetas / eventos
const insertCard = db.prepare("INSERT INTO cards (id, name, max) VALUES (?, ?, ?)");
const getCard    = db.prepare("SELECT * FROM cards WHERE id = ?");
const updStamps  = db.prepare("UPDATE cards SET stamps = ? WHERE id = ?");
const logEvent   = db.prepare("INSERT INTO events (card_id, type, meta) VALUES (?, ?, ?)");
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

// --- métricas
const countAllCards    = db.prepare(`SELECT COUNT(*) AS n FROM cards`);
const countFullCards   = db.prepare(`SELECT COUNT(*) AS n FROM cards WHERE stamps >= max`);
const countEventsToday = db.prepare(`
  SELECT type, COUNT(*) AS n
  FROM events
  WHERE DATE(created_at) = DATE('now','localtime')
  GROUP BY type
`);

// --- listas para admin
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
   APP base
   ========================================================= */
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// estáticos
app.use(express.static("public"));

// páginas
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
   ANTI-FRAUDE: 1 sello por día
   ========================================================= */
function canStamp(cardId) {
  const row = lastStampStmt.get(cardId);
  if (!row) return true;
  const last = new Date(row.created_at);
  const now  = new Date();
  return (now - last) > 24 * 60 * 60 * 1000; // 24 h
}

/* =========================================================
   RUTAS PÚBLICAS / CLIENTE
   ========================================================= */

// ping
app.get("/", (_req, res) => {
  res.send("☕ Loyalty Wallet API funcionando correctamente");
});

// debug google wallet
app.get("/api/debug/google-class", async (_req, res) => {
  try {
    const info = await checkLoyaltyClass();
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// emitir tarjeta
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

    const addToGoogleUrl = buildGoogleSaveUrl({ cardId, name, stamps: 0, max });
    const addToAppleUrl  = `${process.env.BASE_URL}/api/apple/pass?cardId=${cardId}`;
    res.json({ cardId, addToGoogleUrl, addToAppleUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// obtener tarjeta
app.get("/api/card/:cardId", (req, res) => {
  const card = getCard.get(req.params.cardId);
  if (!card) return res.status(404).json({ error: "not_found" });
  res.json(card);
});

// eventos de tarjeta
app.get("/api/events/:cardId", (req, res) => {
  const rows = listEvents.all(req.params.cardId);
  res.json(rows);
});

// link guardar en Google Wallet (tarjeta existente)
app.get("/api/wallet-link/:cardId", (req, res) => {
  const card = getCard.get(req.params.cardId);
  if (!card) return res.status(404).json({ error: "not_found" });
  const addToGoogleUrl = buildGoogleSaveUrl({
    cardId: card.id,
    name  : card.name,
    stamps: card.stamps,
    max   : card.max,
  });
  res.json({ addToGoogleUrl });
});

// emitir pase Apple (placeholder)
app.get("/api/apple/pass", async (req, res) => {
  try {
    const { cardId } = req.query;
    if (!cardId) return res.status(400).send("Falta cardId");

    const buffer = await buildApplePassBuffer({
      cardId,
      name: "Cliente",
      stamps: 0,
      max: 8,
    });

    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", `attachment; filename="${cardId}.pkpass"`);
    res.send(buffer);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// +1 sello (staff)
app.post("/api/stamp/:cardId", basicAuth, (req, res) => {
  try {
    const { cardId } = req.params;
    const card = getCard.get(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });
    if (card.stamps >= card.max) return res.json({ ...card, message: "Tarjeta ya completa" });
    if (!canStamp(cardId)) return res.status(429).json({ error: "Solo 1 sello por día" });

    const newStamps = card.stamps + 1;
    updStamps.run(newStamps, cardId);
    logEvent.run(cardId, "STAMP", JSON.stringify({ by: "reception" }));

    const addToGoogleUrl = buildGoogleSaveUrl({ cardId, name: card.name, stamps: newStamps, max: card.max });
    res.json({ ...card, stamps: newStamps, addToGoogleUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// canjear (staff)
app.post("/api/redeem/:cardId", basicAuth, (req, res) => {
  try {
    const { cardId } = req.params;
    const card = getCard.get(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });
    if (card.stamps < card.max) return res.status(400).json({ error: "Aún no completa los sellos" });

    updStamps.run(0, cardId);
    logEvent.run(cardId, "REDEEM", JSON.stringify({ by: "reception" }));

    const addToGoogleUrl = buildGoogleSaveUrl({ cardId, name: card.name, stamps: 0, max: card.max });
    res.json({ ok: true, message: "Canje realizado", cardId, addToGoogleUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// export CSV (staff)
app.get("/api/export.csv", basicAuth, (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, name, stamps, max, status, created_at
      FROM cards
      ORDER BY created_at DESC
    `).all();

    const header = "id,name,stamps,max,status,created_at";
    const csvLines = rows.map(r =>
      [r.id, r.name, r.stamps, r.max, r.status, r.created_at]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
    );

    const csv = [header, ...csvLines].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=venus_cards.csv");
    res.send(csv);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

/* =========================================================
   ADMIN (auth + panel)
   ========================================================= */

// registrar admin
app.post("/api/admin/register", async (req, res) => {
  try {
    const allow = (process.env.ADMIN_ALLOW_SIGNUP || "false").toLowerCase() === "true";
    const { n } = countAdmins.get();
    if (!allow && n > 0) return res.status(403).json({ error: "signup_disabled" });

    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "missing_fields" });

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

// login admin
app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "missing_fields" });

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

// tarjetas (admin)
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

// eventos por tarjeta (admin)
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

// +1 sello (admin)
app.post("/api/admin/stamp", adminAuth, (req, res) => {
  try {
    const { cardId } = req.body || {};
    if (!cardId) return res.status(400).json({ error: "missing_cardId" });

    const card = getCard.get(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });
    if (card.stamps >= card.max) return res.status(400).json({ error: "already_full" });
    if (!canStamp(cardId)) return res.status(429).json({ error: "Solo 1 sello por día" });

    const newStamps = card.stamps + 1;
    updStamps.run(newStamps, cardId);
    logEvent.run(cardId, "STAMP", JSON.stringify({ by: "admin" }));

    res.json({ ok: true, cardId, stamps: newStamps });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// canjear (admin)
app.post("/api/admin/redeem", adminAuth, (req, res) => {
  try {
    const { cardId } = req.body || {};
    if (!cardId) return res.status(400).json({ error: "missing_cardId" });

    const card = getCard.get(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });
    if (card.stamps < card.max) return res.status(400).json({ error: "not_enough_stamps" });

    updStamps.run(0, cardId);
    logEvent.run(cardId, "REDEEM", JSON.stringify({ by: "admin" }));

    res.json({ ok: true, cardId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// métricas
app.get("/api/admin/metrics", adminAuth, (_req, res) => {
  try {
    const total = countAllCards.get().n;
    const full = countFullCards.get().n;
    const rows = countEventsToday.all();
    const m = { STAMP: 0, REDEEM: 0 };
    for (const r of rows) m[r.type] = r.n;
    res.json({ total, full, stampsToday: m.STAMP || 0, redeemsToday: m.REDEEM || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   RECUPERACIÓN DE CONTRASEÑA (admin)
   ========================================================= */

// solicitar link
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

// aplicar nueva contraseña
app.post("/api/admin/reset", async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: "missing_fields" });

    const row = findReset.get(token);
    if (!row) return res.status(400).json({ error: "invalid_token" });

    if (new Date(row.expires_at) < new Date()) {
      delReset.run(token);
      return res.status(400).json({ error: "expired" });
    }

    const pass_hash = await bcrypt.hash(password, 10);
    db.prepare("UPDATE admins SET pass_hash = ? WHERE id = ?").run(pass_hash, row.admin_id);
    delReset.run(token);

    res.json({ ok: true });
  } catch (e) {
    console.error("[RESET]", e);
    res.status(500).json({ error: "reset_error" });
  }
});

/* =========================================================
   DEBUG MAIL (prueba canal disponible)
   ========================================================= */
app.post("/api/debug/mail", async (req, res) => {
  try {
    const to = String((req.body?.to || process.env.SMTP_USER || "").trim());
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
});