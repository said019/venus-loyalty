// server.js
import express from "express";
import cors from "cors";
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "crypto";
import nodemailer from "nodemailer";

// Wallet helpers
import { buildGoogleSaveUrl, checkLoyaltyClass } from "./lib/google.js";
import { buildApplePassBuffer } from "./lib/apple.js";

// DB
import db from "./lib/db.js";

// Admin auth
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { adminAuth, signAdmin, setAdminCookie, clearAdminCookie } from "./lib/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== SMTP / correo (helpers) =====
const smtpFrom = process.env.SMTP_FROM || "Venus Admin <no-reply@venus.com>";
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// =====================
// BASIC AUTH (para staff) — puedes retirarlo si ya no lo usas
// =====================
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

// =====================
// PREPARED STATEMENTS
// =====================
const insertCard = db.prepare("INSERT INTO cards (id, name, max) VALUES (?, ?, ?)");
const getCard = db.prepare("SELECT * FROM cards WHERE id = ?");
const updStamps = db.prepare("UPDATE cards SET stamps = ? WHERE id = ?");
const logEvent = db.prepare("INSERT INTO events (card_id, type, meta) VALUES (?, ?, ?)");
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

// ==== Admin prepared statements ====
const insertAdmin = db.prepare("INSERT INTO admins (id, email, pass_hash) VALUES (?, ?, ?)");
const getAdminByEmail = db.prepare("SELECT * FROM admins WHERE email = ?");
const countAdmins = db.prepare("SELECT COUNT(*) AS n FROM admins");

// Reset password
const insertReset = db.prepare(`
  INSERT INTO admin_resets (token, admin_id, email, expires_at)
  VALUES (@token, @admin_id, @email, @expires_at)
`);
const getResetByToken = db.prepare("SELECT * FROM admin_resets WHERE token = ?");
const deleteResetsByEmail = db.prepare("DELETE FROM admin_resets WHERE email = ?");
const deleteResetByToken = db.prepare("DELETE FROM admin_resets WHERE token = ?");
const updateAdminPass = db.prepare("UPDATE admins SET pass_hash = ? WHERE id = ?");

// =====================
// APP BASE
// =====================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// servir interfaz pública (cliente) desde /public
app.use(express.static("public"));

// Páginas del Admin (HTML)
app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.get("/admin-login.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-login.html"));
});

// (opcional) Staff antiguo
app.get("/staff.html", basicAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "staff.html"));
});

// =====================
// REGLA ANTI-FRAUDE: 1 sello/día
// =====================
function canStamp(cardId) {
  const row = lastStampStmt.get(cardId);
  if (!row) return true;
  const last = new Date(row.created_at);
  const now = new Date();
  return (now - last) > 24 * 60 * 60 * 1000; // 24 h
}

// =====================
// RUTAS PÚBLICAS / CLIENTE
// =====================
app.get("/", (_req, res) => {
  res.send("☕ Loyalty Wallet API funcionando correctamente");
});

app.get("/api/debug/google-class", async (_req, res) => {
  try {
    const info = await checkLoyaltyClass();
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

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
    const addToAppleUrl = `${process.env.BASE_URL}/api/apple/pass?cardId=${cardId}`;

    res.json({ cardId, addToGoogleUrl, addToAppleUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/card/:cardId", (req, res) => {
  const card = getCard.get(req.params.cardId);
  if (!card) return res.status(404).json({ error: "not_found" });
  res.json(card);
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

// =====================
// STAFF (sello/canje) — si ya no lo usas, puedes borrarlo
// =====================
app.post("/api/stamp/:cardId", basicAuth, (req, res) => {
  try {
    const { cardId } = req.params;
    const card = getCard.get(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });

    if (card.stamps >= card.max) {
      return res.json({ ...card, message: "Tarjeta ya completa" });
    }
    if (!canStamp(cardId)) {
      return res.status(429).json({ error: "Solo 1 sello por día" });
    }

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

app.post("/api/redeem/:cardId", basicAuth, (req, res) => {
  try {
    const { cardId } = req.params;
    const card = getCard.get(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });

    if (card.stamps < card.max) {
      return res.status(400).json({ error: "Aún no completa los sellos" });
    }

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

// =====================
// ===== ADMIN (auth + data + acciones + forgot/reset)
// =====================

// Registro
app.post("/api/admin/register", async (req, res) => {
  try {
    const allow = (process.env.ADMIN_ALLOW_SIGNUP || "false").toLowerCase() === "true";
    const { n } = countAdmins.get();
    if (!allow && n > 0) return res.status(403).json({ error: "signup_disabled" });

    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "missing_fields" });

    const exists = getAdminByEmail.get(email.trim().toLowerCase());
    if (exists) return res.status(409).json({ error: "email_in_use" });

    const id = `adm_${Date.now()}`;
    const pass_hash = await bcrypt.hash(password, 10);
    insertAdmin.run(id, email.trim().toLowerCase(), pass_hash);

    return res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Login
app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "missing_fields" });

    const admin = getAdminByEmail.get(email.trim().toLowerCase());
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

// Logout
app.post("/api/admin/logout", (_req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

// Who am I
app.get("/api/admin/me", adminAuth, (req, res) => {
  res.json({ uid: req.admin.uid, email: req.admin.email });
});

// Listado de tarjetas (paginado/filtrado básico)
const listCardsStmt = db.prepare(`
  SELECT id, name, stamps, max, status, created_at
  FROM cards
  WHERE (LOWER(id) LIKE LOWER(@like) OR LOWER(name) LIKE LOWER(@like))
  ORDER BY created_at DESC
  LIMIT @limit OFFSET @offset
`);
const countCardsStmt = db.prepare(`
  SELECT COUNT(*) AS n
  FROM cards
  WHERE (LOWER(id) LIKE LOWER(@like) OR LOWER(name) LIKE LOWER(@like))
`);

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

// Eventos por tarjeta
const listEventsByCard = db.prepare(`
  SELECT id, type, meta, created_at
  FROM events
  WHERE card_id = ?
  ORDER BY id DESC
  LIMIT 200
`);

app.get("/api/admin/events", adminAuth, (req, res) => {
  try {
    const { cardId } = req.query || {};
    if (!cardId) return res.status(400).json({ error: "missing_cardId" });
    const items = listEventsByCard.all(cardId);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Acciones admin
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

    return res.json({ ok: true, cardId, stamps: newStamps });
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
    if (card.stamps < card.max) return res.status(400).json({ error: "not_enough_stamps" });

    updStamps.run(0, cardId);
    logEvent.run(cardId, "REDEEM", JSON.stringify({ by: "admin" }));
    return res.json({ ok: true, cardId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Métricas
const countAllCards = db.prepare(`SELECT COUNT(*) AS n FROM cards`);
const countFullCards = db.prepare(`SELECT COUNT(*) AS n FROM cards WHERE stamps >= max`);
const countEventsToday = db.prepare(`
  SELECT type, COUNT(*) AS n
  FROM events
  WHERE DATE(created_at) = DATE('now','localtime')
  GROUP BY type
`);

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

// ==== Olvidé / Reset password ====
app.post("/api/admin/forgot", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "missing_email" });

    const admin = getAdminByEmail.get(email.trim().toLowerCase());
    // No revelamos existencia (seguridad)
    if (!admin) return res.json({ ok: true });

    deleteResetsByEmail.run(admin.email);

    const token = crypto.randomBytes(48).toString("hex");
    const expires = new Date(Date.now() + 1000 * 60 * 30); // 30 min
    insertReset.run({
      token,
      admin_id: admin.id,
      email: admin.email,
      expires_at: expires.toISOString().slice(0,19).replace("T"," ")
    });

    const base = process.env.APP_BASE_URL || process.env.BASE_URL || "";
    const link = `${base}/admin-login.html#reset?token=${token}`;

    await transporter.sendMail({
      from: smtpFrom,
      to: admin.email,
      subject: "Restablecer contraseña — Venus Admin",
      html: `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
          <h2>Restablecer contraseña</h2>
          <p>Recibimos una solicitud para restablecer tu contraseña.</p>
          <p><a href="${link}" style="background:#8c9668;color:#fff;padding:10px 14px;border-radius:10px;text-decoration:none;display:inline-block">Restablecer ahora</a></p>
          <p style="font-size:12px;color:#6b7280">El enlace expira en 30 minutos. Si no fuiste tú, ignora este correo.</p>
        </div>
      `
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/reset", async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: "missing_fields" });

    const row = getResetByToken.get(token);
    if (!row) return res.status(400).json({ error: "invalid_token" });

    const now = new Date();
    const exp = new Date(row.expires_at + "Z");
    if (now > exp) {
      deleteResetByToken.run(token);
      return res.status(400).json({ error: "expired_token" });
    }

    const hash = await bcrypt.hash(password, 10);
    updateAdminPass.run(hash, row.admin_id);
    deleteResetByToken.run(token);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =====================
// SERVER
// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Servidor activo en http://localhost:${PORT}`)
);