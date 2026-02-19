// server.js - COMPLETO CON TODAS LAS CORRECCIONES APPLICADAS
// VERSION: 2026-01-08-TIMEZONE-FIX-V2
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
import { EmailService } from './src/services/emailService.js';
import fs from "fs";

// Database - Prisma con repositorios
import { prisma } from './src/db/index.js';
import { firestore } from './src/db/compat.js';
import { CardsRepo, AppointmentsRepo, ServicesRepo, ProductsRepo, SalesRepo, NotificationsRepo, BlockedSlotsRepo } from './src/db/repositories.js';

// WhatsApp Service - USANDO V2 PARA FORZAR RECARGA
import { WhatsAppService } from './src/services/whatsapp-v2.js';

// Firebase legacy (solo para migración - remover después)
// import { firestore } from "./lib/firebase.js";

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
import { config } from './src/config/config.js';

// 📱 WhatsApp Webhook (Twilio)
import whatsappWebhook from './src/routes/whatsappWebhook.js';

// 📱 WhatsApp Webhook (Evolution API)
import webhookEvolution from './src/routes/webhookEvolution.js';
import { getEvolutionClient } from './src/services/whatsapp-evolution.js';

// 📋 Expedientes de Clientas
import clientRecordsRouter from './src/routes/clientRecords.js';


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
  return fsUpdateCard(cardId, {
    stamps,
    lastVisit: new Date().toISOString()
  });
}

async function fsAddEvent(cardId, type, meta = {}) {
  // Normalizar tipo a minúsculas (Prisma espera 'stamp' o 'redeem')
  const normalizedType = type.toLowerCase();

  try {
    await firestore.collection(COL_EVENTS).add({
      cardId,
      type: normalizedType,
      staffName: meta.by || null,
      note: meta.note || null,
    });
  } catch (error) {
    console.error('[fsAddEvent] Error:', error.message);
    // No lanzar error para no bloquear el flujo principal
  }
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
    .where("type", "==", "stamp") // minúsculas para coincidir con Prisma
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

  // Comparar solo el día calendario (ignorar hora)
  const lastDay = lastDate.toDateString(); // "Mon Nov 25 2024"
  const today = now.toDateString();

  // Permitir sello si es un día diferente
  return lastDay !== today;
}

async function fsDeleteCard(cardId) {
  try {
    // 1. Eliminar todos los eventos asociados a la tarjeta
    await prisma.event.deleteMany({
      where: { cardId: cardId }
    });
    console.log(`[DELETE CARD] Eventos eliminados para ${cardId}`);

    // 2. Desasociar citas (poner cardId en null en lugar de eliminar)
    await prisma.appointment.updateMany({
      where: { cardId: cardId },
      data: { cardId: null }
    });
    console.log(`[DELETE CARD] Citas desasociadas para ${cardId}`);

    // 3. Eliminar la tarjeta
    const deleted = await prisma.card.delete({
      where: { id: cardId }
    });

    console.log(`[DELETE CARD] ✅ Tarjeta ${cardId} eliminada exitosamente`);
    return true;
  } catch (error) {
    console.error(`[DELETE CARD] Error eliminando ${cardId}:`, error.message);

    // Si la tarjeta no existe, retornar false
    if (error.code === 'P2025') {
      return false;
    }

    throw error;
  }
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

  const counts = { stamp: 0, redeem: 0 };
  evSnap.forEach((doc) => {
    const t = (doc.data().type || '').toLowerCase();
    if (t === "stamp") counts.stamp++;
    if (t === "redeem") counts.redeem++;
  });

  return {
    total,
    full,
    stampsToday: counts.stamp,
    redeemsToday: counts.redeem,
  };
}

// ⭐ NUEVO: Métricas del mes actual
async function fsMetricsMonth() {
  const cardsSnap = await firestore.collection(COL_CARDS).get();
  let total = cardsSnap.size;
  let activeClients = 0;

  cardsSnap.forEach((doc) => {
    const c = doc.data();
    if ((c.stamps || 0) > 0 || (c.cycles || 0) > 0) activeClients++;
  });

  // Inicio del mes actual
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthIso = startOfMonth.toISOString();

  // Contar eventos del mes
  const evSnap = await firestore
    .collection(COL_EVENTS)
    .where("createdAt", ">=", startOfMonthIso)
    .get();

  const counts = { stamp: 0, redeem: 0 };
  evSnap.forEach((doc) => {
    const t = (doc.data().type || '').toLowerCase();
    if (t === "stamp") counts.stamp++;
    if (t === "redeem") counts.redeem++;
  });

  // Calcular tasa de retorno (clientes con más de 1 sello total)
  let returningClients = 0;
  cardsSnap.forEach((doc) => {
    const c = doc.data();
    const totalStamps = (c.stamps || 0) + ((c.cycles || 0) * 8);
    if (totalStamps > 1) returningClients++;
  });
  const returnRate = total > 0 ? Math.round((returningClients / total) * 100) : 0;

  return {
    total,
    activeClients,
    stampsThisMonth: counts.stamp,
    redeemsThisMonth: counts.redeem,
    returnRate
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

// ✅ WhatsApp Webhook (Twilio)
app.use('/api/whatsapp', whatsappWebhook);

// ✅ WhatsApp Webhook (Evolution API) - público, sin auth
app.use('/api/webhook/evolution', webhookEvolution);

// ✅ Expedientes de Clientas
app.use('/api/client-records', clientRecordsRouter);

// ========== EVOLUTION API ADMIN ROUTES ==========

// GET /api/evolution/status - Estado de conexión WhatsApp
app.get('/api/evolution/status', adminAuth, async (req, res) => {
  try {
    if (config.whatsappProvider !== 'evolution') {
      return res.json({ provider: 'twilio', connected: true, state: 'twilio-mode' });
    }
    const client = getEvolutionClient();
    const status = await client.getStatus();
    res.json({
      provider: 'evolution',
      connected: status.connected,
      state: status.state,
      number: status.number || null,
      instanceName: config.evolution.instanceName
    });
  } catch (error) {
    console.error('[Evolution] Error obteniendo estado:', error.message);
    res.status(500).json({ error: 'Error obteniendo estado', details: error.message });
  }
});

// POST /api/evolution/connect - Crear instancia y generar QR
app.post('/api/evolution/connect', adminAuth, async (req, res) => {
  try {
    const client = getEvolutionClient();

    // Intentar crear instancia si no existe
    try {
      await client.createInstance();
      console.log('[Evolution] Instancia creada');
    } catch (e) {
      console.log('[Evolution] Instancia ya existe, conectando...');
    }

    const result = await client.connectInstance();
    res.json({
      success: true,
      qrCode: result.base64 || null,
    });
  } catch (error) {
    console.error('[Evolution] Error conectando:', error.message);
    res.status(500).json({ error: 'Error conectando', details: error.message });
  }
});

// POST /api/evolution/logout - Desvincular WhatsApp
app.post('/api/evolution/logout', adminAuth, async (req, res) => {
  try {
    const client = getEvolutionClient();
    await client.logout();
    res.json({ success: true });
  } catch (error) {
    console.error('[Evolution] Error desvinculando:', error.message);
    res.status(500).json({ error: 'Error desvinculando', details: error.message });
  }
});

// POST /api/evolution/test - Enviar mensaje de prueba
app.post('/api/evolution/test', adminAuth, async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Se requiere phone' });
  }
  try {
    const client = getEvolutionClient();
    await client.sendText(phone, '✅ Mensaje de prueba desde Evolution API - Venus Cosmetología');
    res.json({ success: true });
  } catch (error) {
    console.error('[Evolution] Error enviando prueba:', error.message);
    res.status(500).json({ error: 'Error enviando mensaje', details: error.message });
  }
});

// 🏥 Health Check con versión
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2026-01-08-TIMEZONE-FIX-V2',
    timestamp: new Date().toISOString()
  });
});

// 🧪 Test endpoint para WhatsApp
app.post('/api/test/whatsapp', async (req, res) => {
  try {
    const { phone, name, service } = req.body;

    if (!phone || !name) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere phone y name'
      });
    }

    // Calcular fecha y hora de mañana en formato México
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const testDate = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD
    const testTime = '10:00'; // Hora fija para prueba

    const testAppt = {
      clientName: name,
      clientPhone: phone,
      serviceName: service || 'Servicio de prueba',
      date: testDate,
      time: testTime,
      startDateTime: new Date(`${testDate}T${testTime}:00-06:00`).toISOString(),
      location: 'Cactus 50, San Juan del Río'
    };

    const result = await WhatsAppService.sendConfirmation(testAppt);

    res.json({
      success: result.success,
      messageSid: result.messageSid,
      error: result.error,
      testData: testAppt
    });
  } catch (error) {
    console.error('Error en test WhatsApp:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/whatsapp/confirmation - Enviar confirmación de cita(s) por WhatsApp
app.post('/api/whatsapp/confirmation', adminAuth, async (req, res) => {
  try {
    const { clientName, clientPhone, services, date, time } = req.body;

    if (!clientName || !clientPhone || !services || !date || !time) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos'
      });
    }

    // Construir nombre de servicios (uno o múltiples)
    let serviceName;
    if (Array.isArray(services) && services.length > 1) {
      serviceName = services.join(' + ');
    } else if (Array.isArray(services)) {
      serviceName = services[0];
    } else {
      serviceName = services;
    }

    // Construir startDateTime para el formato (timezone México UTC-6)
    const startDateTime = new Date(`${date}T${time}:00-06:00`).toISOString();

    const appointmentData = {
      clientName,
      clientPhone: clientPhone.replace(/\D/g, ''),
      serviceName,
      date,      // Campo date para WhatsApp (sin conversión)
      time,      // Campo time para WhatsApp (sin conversión)
      startDateTime
    };

    console.log('[WHATSAPP] Enviando confirmación:', appointmentData);

    const result = await WhatsAppService.sendConfirmation(appointmentData);

    console.log('[WHATSAPP] Resultado:', result);

    res.json({
      success: result.success,
      messageSid: result.messageSid,
      error: result.error
    });
  } catch (error) {
    console.error('[WHATSAPP] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* ========== PRODUCTOS ========== */

// GET /api/products - Listar todos los productos
app.get('/api/products', adminAuth, async (req, res) => {
  try {
    const snapshot = await firestore.collection('products')
      .orderBy('name', 'asc')
      .get();

    const products = [];
    snapshot.forEach(doc => {
      products.push({ id: doc.id, ...doc.data() });
    });

    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/products - Crear producto
app.post('/api/products', adminAuth, async (req, res) => {
  try {
    const { name, category, presentation, price, cost, stock, minStock, description } = req.body;

    if (!name || price === undefined) {
      return res.json({ success: false, error: 'Nombre y precio son requeridos' });
    }

    const productData = {
      name,
      category: category || 'otro',
      presentation: presentation || '',
      price: parseFloat(price),
      cost: cost ? parseFloat(cost) : null,
      stock: parseInt(stock) || 0,
      minStock: parseInt(minStock) || 5,
      description: description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await firestore.collection('products').add(productData);

    res.json({ success: true, id: docRef.id, data: productData });
  } catch (error) {
    console.error('Error creating product:', error);
    res.json({ success: false, error: error.message });
  }
});

// PUT /api/products/:id - Actualizar producto
app.put('/api/products/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, presentation, price, cost, stock, minStock, description } = req.body;

    const updateData = {
      name,
      category,
      presentation,
      price: parseFloat(price),
      cost: cost ? parseFloat(cost) : null,
      stock: parseInt(stock),
      minStock: parseInt(minStock) || 5,
      description,
      updatedAt: new Date().toISOString()
    };

    await firestore.collection('products').doc(id).update(updateData);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating product:', error);
    res.json({ success: false, error: error.message });
  }
});

// DELETE /api/products/:id - Eliminar producto
app.delete('/api/products/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await firestore.collection('products').doc(id).delete();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.json({ success: false, error: error.message });
  }
});

// PATCH /api/products/:id/stock - Actualizar solo stock (para ventas)
app.patch('/api/products/:id/stock', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { change } = req.body; // +1 o -1

    const docRef = firestore.collection('products').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.json({ success: false, error: 'Producto no encontrado' });
    }

    const currentStock = doc.data().stock || 0;
    const newStock = Math.max(0, currentStock + change);

    await docRef.update({
      stock: newStock,
      updatedAt: new Date().toISOString()
    });

    res.json({ success: true, newStock });
  } catch (error) {
    console.error('Error updating stock:', error);
    res.json({ success: false, error: error.message });
  }
});

/* ========== APPOINTMENTS ========== */

// GET /api/appointments - Obtener citas por fecha
app.get('/api/appointments', adminAuth, async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.json({ success: false, error: 'Fecha requerida' });
    }

    console.log(`[APPOINTMENTS] Buscando citas para ${date}`);
    console.log(`[APPOINTMENTS] AppointmentsRepo:`, typeof AppointmentsRepo);

    // Usar repositorio de Prisma
    const data = await AppointmentsRepo.findByDate(date);

    console.log(`[APPOINTMENTS] Encontradas ${data.length} citas`);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[APPOINTMENTS] Error completo:', error);
    console.error('[APPOINTMENTS] Stack:', error.stack);
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
});

// DEBUG: Ver todas las citas completadas con pagos
app.get('/api/debug/completed-payments', adminAuth, async (req, res) => {
  try {
    const snapshot = await firestore.collection('appointments')
      .where('status', '==', 'completed')
      .orderBy('paidAt', 'desc')
      .limit(20)
      .get();

    const appointments = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      appointments.push({
        id: doc.id,
        clientName: data.clientName,
        serviceName: data.serviceName,
        startDateTime: data.startDateTime,
        status: data.status,
        paymentMethod: data.paymentMethod,
        totalPaid: data.totalPaid,
        paidAt: data.paidAt
      });
    });

    res.json({ success: true, count: appointments.length, data: appointments });
  } catch (error) {
    console.error('[DEBUG] Error:', error);
    res.json({ success: false, error: error.message });
  }
});

// GET /api/appointments/month - Obtener citas del mes
app.get('/api/appointments/month', adminAuth, async (req, res) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.json({ success: false, error: 'Año y mes requeridos' });
    }

    const y = parseInt(year);
    const m = parseInt(month);
    const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const lastDayStr = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;

    // Usar repositorio de Prisma
    const data = await AppointmentsRepo.findByDateRange(
      `${firstDay}T00:00:00-06:00`,
      `${lastDayStr}T23:59:59-06:00`
    );

    res.json({ success: true, data });
  } catch (error) {
    console.error('[APPOINTMENTS MONTH] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/appointments/range - Obtener citas en un rango de fechas (para reportes)
// IMPORTANTE: Esta ruta debe estar ANTES de /api/appointments/:id para que no sea interceptada
app.get('/api/appointments/range', adminAuth, async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.json({ success: false, error: 'Se requieren parámetros from y to' });
    }

    console.log('[REPORTS] Buscando citas desde', from, 'hasta', to);

    // Usar repositorio de Prisma
    const appointments = await AppointmentsRepo.findByDateRange(from, to);

    console.log('[REPORTS] Encontradas', appointments.length, 'citas en el rango');

    res.json({ success: true, data: appointments });
  } catch (error) {
    console.error('[REPORTS] Error:', error);
    res.json({ success: false, error: error.message });
  }
});

// GET /api/appointments/:id - Obtener una cita por ID
app.get('/api/appointments/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await AppointmentsRepo.findById(id);

    if (!appointment) {
      return res.json({ success: false, error: 'Cita no encontrada' });
    }

    console.log('[API] Appointment data:', appointment);

    res.json({ success: true, data: appointment });
  } catch (error) {
    console.error('Error getting appointment:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/appointments/:id/payment - Registrar pago con productos y descuento
app.post('/api/appointments/:id/payment', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      paymentMethod,
      serviceAmount,
      productsAmount,
      subtotal,
      discountType,
      discountValue,
      discountAmount,
      totalAmount,
      productsSold
    } = req.body;

    // Obtener cita usando Prisma
    const appointment = await AppointmentsRepo.findById(id);

    if (!appointment) {
      return res.json({ success: false, error: 'Cita no encontrada' });
    }

    // Actualizar cita con datos de pago
    const paymentData = {
      status: 'completed',
      paymentMethod,
      serviceAmount: parseFloat(serviceAmount) || 0,
      productsAmount: parseFloat(productsAmount) || 0,
      subtotal: parseFloat(subtotal) || 0,
      discountType: discountType || null,
      discountValue: discountValue || 0,
      discountAmount: parseFloat(discountAmount) || 0,
      totalPaid: parseFloat(totalAmount) || 0,
      productsSold: productsSold || []
    };

    console.log('[PAYMENT] Guardando pago para cita', id, ':', paymentData);

    // Actualizar cita a completada con datos de pago
    await AppointmentsRepo.complete(id, {
      total: parseFloat(totalAmount) || 0,
      method: paymentMethod,
      discount: discountAmount ? parseFloat(discountAmount) : null,
      products: productsSold || []
    });

    // Descontar stock de productos vendidos usando Prisma
    if (productsSold && productsSold.length > 0) {
      for (const product of productsSold) {
        await ProductsRepo.updateStock(product.productId, -product.qty);
      }
    }

    // Registrar en colección de ventas (para reportes) usando Prisma
    await SalesRepo.create({
      appointmentId: id,
      clientName: appointment.clientName,
      serviceName: appointment.serviceName,
      serviceAmount: parseFloat(serviceAmount) || 0,
      productsAmount: parseFloat(productsAmount) || 0,
      subtotal: parseFloat(subtotal) || 0,
      discountType: discountType || null,
      discountValue: discountValue || 0,
      discountAmount: parseFloat(discountAmount) || 0,
      totalAmount: parseFloat(totalAmount) || 0,
      productsSold: productsSold || [],
      paymentMethod,
      date: new Date()
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving payment:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/direct-sales - Registrar venta directa (sin cita)
app.post('/api/direct-sales', adminAuth, async (req, res) => {
  try {
    const {
      clientName,
      paymentMethod,
      productsAmount,
      discountType,
      discountValue,
      discountAmount,
      totalAmount,
      productsSold
    } = req.body;

    if (!productsSold || productsSold.length === 0) {
      return res.json({ success: false, error: 'Se requiere al menos un producto' });
    }

    console.log('[DIRECT SALE] Procesando venta directa:', { clientName, productsAmount, totalAmount });

    // Descontar stock de productos vendidos
    const batch = firestore.batch();
    for (const product of productsSold) {
      const productRef = firestore.collection('products').doc(product.productId);
      const productDoc = await productRef.get();

      if (productDoc.exists) {
        const currentStock = productDoc.data().stock || 0;
        const newStock = Math.max(0, currentStock - product.qty);
        batch.update(productRef, {
          stock: newStock,
          updatedAt: new Date().toISOString()
        });
        console.log(`[DIRECT SALE] Stock actualizado: ${product.name} ${currentStock} -> ${newStock}`);
      }
    }
    await batch.commit();

    // Registrar en colección de ventas
    const saleRef = await firestore.collection('sales').add({
      type: 'direct', // Venta directa (sin cita)
      clientName: clientName || 'Venta directa',
      serviceName: null,
      serviceAmount: 0,
      productsAmount: parseFloat(productsAmount) || 0,
      subtotal: parseFloat(productsAmount) || 0,
      discountType,
      discountValue,
      discountAmount: parseFloat(discountAmount) || 0,
      totalAmount: parseFloat(totalAmount) || 0,
      productsSold,
      paymentMethod,
      createdAt: new Date().toISOString()
    });

    // También en Prisma
    try {
      await SalesRepo.create({
        appointmentId: null,
        clientName: clientName || 'Venta Pasajero',
        serviceName: null,
        serviceAmount: 0,
        productsAmount: parseFloat(productsAmount) || 0,
        subtotal: parseFloat(productsAmount) || 0,
        discountType,
        discountValue: discountValue || 0,
        discountAmount: parseFloat(discountAmount) || 0,
        totalAmount: parseFloat(totalAmount) || 0,
        productsSold,
        paymentMethod,
        date: new Date()
      });
    } catch (e) { console.error('Error registrando venta directa en prisma:', e); }

    console.log('[DIRECT SALE] ✅ Venta registrada:', saleRef.id);

    res.json({ success: true, saleId: saleRef.id });
  } catch (error) {
    console.error('[DIRECT SALE] Error:', error);
    res.json({ success: false, error: error.message });
  }
});

// GET /api/transactions - Obtener historial de ventas (directas y mixtas)
app.get('/api/transactions', adminAuth, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.json({ success: false, error: 'Fecha requerida' });

    const startDate = new Date(date + 'T00:00:00');
    const endDate = new Date(date + 'T23:59:59');

    // Buscar en SalesRepo (Prisma)
    // Asumiendo que Prisma maneja fechas ISO
    try {
      const sales = await prisma.sale.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        }
      });

      if (sales && sales.length > 0) return res.json({ success: true, data: sales });
    } catch (e) { console.warn('Error fetching prismas sales:', e); }

    // Fallback a Firestore para ventas directas
    const snapshot = await firestore.collection('sales')
      .where('createdAt', '>=', startDate.toISOString())
      .where('createdAt', '<=', endDate.toISOString())
      .get();

    const fsSales = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    return res.json({ success: true, data: fsSales });

  } catch (e) {
    console.error('Error obteniendo transacciones:', e);
    res.json({ success: false, error: e.message });
  }
});

// POST /api/appointments - Crear nueva cita
app.post('/api/appointments', adminAuth, async (req, res) => {
  try {
    const {
      name,
      phone,
      serviceId,
      serviceName,
      date,
      time,
      durationMinutes,
      sendWhatsAppConfirmation,
      sendWhatsApp24h,
      sendWhatsApp2h
    } = req.body;

    // Validaciones
    if (!name || !phone || !serviceName || !date || !time) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos'
      });
    }

    const phoneClean = phone.replace(/\D/g, '');

    console.log('[APPOINTMENT] Creando cita:', {
      name,
      phone: phoneClean,
      serviceName,
      date,
      time
    });

    // Buscar o crear tarjeta de lealtad por teléfono usando Prisma
    let card = await CardsRepo.findByPhone(phoneClean);

    if (!card) {
      console.log(`[APPOINTMENT] 🆕 Creando nueva tarjeta para ${phoneClean}`);
      card = await CardsRepo.create({
        name: name,
        phone: phoneClean,
        email: null,
        birthday: null,
        stamps: 0,
        max: 8,
        cycles: 0,
        status: 'active',
        source: 'admin-appointment'
      });
      console.log(`[APPOINTMENT] ✅ Tarjeta creada: ${card.id}`);
    } else {
      console.log(`[APPOINTMENT] ✅ Tarjeta existente encontrada: ${card.id}`);
    }

    // Crear cita usando repositorio de Prisma
    const appointmentData = {
      cardId: card.id,
      clientName: name,
      clientPhone: phoneClean,
      serviceId: serviceId || null,
      serviceName,
      date,
      time,
      durationMinutes: parseInt(durationMinutes) || 60,
      status: 'scheduled',
      location: 'Venus Cosmetología',
      source: 'admin-panel',
      // Flags para recordatorios WhatsApp automáticos
      sendWhatsApp24h: sendWhatsApp24h !== false, // Por defecto true
      sendWhatsApp2h: sendWhatsApp2h !== false    // Por defecto true
    };

    // CREAR EVENTOS EN GOOGLE CALENDAR (Said y Alondra)
    const duration = parseInt(durationMinutes) || 60;
    const startDateTime = `${date}T${time}:00-06:00`;

    // Calcular hora de fin sumando duración a la hora de inicio (en minutos locales)
    const [startHour, startMin] = time.split(':').map(Number);
    const totalMinutes = startHour * 60 + startMin + duration;
    const endHours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const endMinutes = (totalMinutes % 60).toString().padStart(2, '0');
    const endDateTime = `${date}T${endHours}:${endMinutes}:00-06:00`;

    const eventData = {
      title: `${serviceName} - ${name}`,
      description: `Cliente: ${name}\nTel: ${phoneClean}\nServicio: ${serviceName}`,
      location: 'Cactus 50, San Juan del Río',
      startISO: startDateTime,
      endISO: endDateTime
    };

    try {
      const { createEvent } = await import('./src/services/googleCalendarService.js');

      console.log('[APPOINTMENT] 📅 Creando eventos en Google Calendar...');

      // Crear en calendario 1 (Said)
      try {
        const eventId1 = await createEvent({
          ...eventData,
          calendarId: config.google.calendarOwner1
        });
        appointmentData.googleCalendarEventId = eventId1;
        console.log(`[APPOINTMENT] ✅ Evento creado en calendar Said: ${eventId1}`);
      } catch (err1) {
        console.error(`[APPOINTMENT] ❌ Error en calendar Said:`, err1.message);
      }

      // Crear en calendario 2 (Alondra)
      try {
        const eventId2 = await createEvent({
          ...eventData,
          calendarId: config.google.calendarOwner2
        });
        appointmentData.googleCalendarEventId2 = eventId2;
        console.log(`[APPOINTMENT] ✅ Evento creado en calendar Alondra: ${eventId2}`);
      } catch (err2) {
        console.error(`[APPOINTMENT] ❌ Error en calendar Alondra:`, err2.message);
      }

    } catch (calErr) {
      console.error('[APPOINTMENT] ⚠️ Error creating calendar events:', calErr.message);
    }

    const appointment = await AppointmentsRepo.create(appointmentData);

    console.log('[APPOINTMENT] ✅ Cita creada y vinculada a tarjeta:', appointment.id, 'cardId:', card.id, {
      sendWhatsApp24h: appointmentData.sendWhatsApp24h,
      sendWhatsApp2h: appointmentData.sendWhatsApp2h
    });

    // Enviar confirmación WhatsApp si está activado
    if (sendWhatsAppConfirmation) {
      try {
        console.log('[APPOINTMENT] Enviando WhatsApp con datos:', {
          id: appointment.id,
          clientName: appointment.clientName,
          date: appointment.date,
          time: appointment.time,
          startDateTime: appointment.startDateTime
        });
        const result = await WhatsAppService.sendConfirmation(appointment);
        if (result.success) {
          console.log('[APPOINTMENT] ✅ WhatsApp confirmación enviado:', result.messageSid);
        } else {
          console.log('[APPOINTMENT] ⚠️ WhatsApp confirmación falló:', result.error);
        }
      } catch (whatsappError) {
        console.error('[APPOINTMENT] ❌ Error enviando WhatsApp:', whatsappError.message);
      }
    }

    // Enviar confirmación Email si el cliente tiene correo
    if (card && card.email) {
      EmailService.sendConfirmation({
        ...appointment,
        clientEmail: card.email
      }).catch(err => console.error('[APPOINTMENT] ❌ Error enviando Email:', err.message));
    }

    res.json({
      success: true,
      appointmentId: appointment.id
    });

  } catch (error) {
    console.error('[APPOINTMENT] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PATCH /api/appointments/:id - Actualizar cita (fecha, hora, servicio)
app.patch('/api/appointments/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Manejar completado/pago si viene status='completed' (Fix para completar cita desde admin)
    if (req.body.status === 'completed' && req.body.totalPaid !== undefined) {
      const { totalPaid, paymentMethod, discount, productsSold } = req.body;

      console.log(`[PATCH] Completando cita ${id} (Cobro desde Admin)`);

      const appointment = await AppointmentsRepo.findById(id);
      if (!appointment) return res.status(404).json({ success: false, error: 'Cita no encontrada' });

      // Actualizar cita a completada
      await AppointmentsRepo.complete(id, {
        total: parseFloat(totalPaid) || 0,
        method: paymentMethod,
        discount: discount ? parseFloat(discount) : null,
        products: productsSold || [] // productsSold tiene quantity, name, etc.
      });

      // Calcular montos para reporte de ventas
      const productsTotal = (productsSold || []).reduce((sum, p) => sum + (p.subtotal || 0), 0);
      const totalP = parseFloat(totalPaid) || 0;
      const discountP = discount ? parseFloat(discount) : 0;
      // Estimación del precio servicio base
      const serviceAmount = Math.max(0, (totalP + discountP) - productsTotal);

      // Registrar venta
      try {
        await SalesRepo.create({
          appointmentId: id,
          clientName: appointment.clientName,
          serviceName: appointment.serviceName,
          serviceAmount: serviceAmount,
          productsAmount: productsTotal,
          subtotal: totalP + discountP,
          discountType: null,
          discountValue: 0,
          discountAmount: discountP,
          totalAmount: totalP,
          productsSold: productsSold || [],
          paymentMethod,
          date: new Date()
        });
      } catch (saleErr) {
        console.error('[PATCH] Error creando registro de venta:', saleErr);
        // No fallamos el request si falla el registro de venta auxiliar
      }

      return res.json({ success: true });
    }

    const { serviceId, serviceName, date, time, durationMinutes } = req.body;

    if (!date || !time) {
      return res.status(400).json({ success: false, error: 'Fecha y hora son requeridos' });
    }

    // Obtener cita actual
    const appointment = await AppointmentsRepo.findById(id);

    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada' });
    }

    console.log(`[PATCH] Verificando conflictos para ${date} ${time}`);

    // Verificar conflictos usando repositorio
    const conflicts = await AppointmentsRepo.findConflicts(
      date,
      time,
      durationMinutes || 60,
      id  // Excluir la cita actual
    );

    if (conflicts.length > 0) {
      const conflict = conflicts[0];
      console.log(`[PATCH] ❌ Conflicto detectado con ${conflict.clientName} a las ${conflict.time}`);
      return res.status(409).json({
        success: false,
        error: `Conflicto: ${conflict.clientName} tiene cita a las ${conflict.time}`
      });
    }

    console.log(`[PATCH] ✅ No hay conflictos, actualizando cita`);

    // Preparar datos para actualizar
    const updateData = {
      date,
      time,
      durationMinutes: durationMinutes || appointment.durationMinutes
    };

    if (serviceId) updateData.serviceId = serviceId;
    if (serviceName) updateData.serviceName = serviceName;

    // Actualizar en BD usando repositorio
    await AppointmentsRepo.update(id, updateData);

    // ⭐ ACTUALIZAR GOOGLE CALENDAR si hay eventos asociados
    const startDateTimeMX = `${date}T${time}:00-06:00`;
    const duration = durationMinutes || 60;
    // Calcular endDateTime correctamente: partir del start en UTC y sumar minutos
    const startUTC = new Date(startDateTimeMX); // interpreta -06:00 correctamente
    const endUTC = new Date(startUTC.getTime() + duration * 60000);
    // Formatear end como hora México: restar 6h a UTC para obtener hora local, luego etiquetar -06:00
    const endMXHour = new Date(endUTC.getTime());
    const endDateTimeMX = `${date}T${String(endMXHour.getUTCHours() - 0).padStart(2, '0')}:${String(endMXHour.getUTCMinutes()).padStart(2, '0')}:00Z`;
    // Usar ISO UTC directamente para Google Calendar (acepta Z)
    const startISO = startUTC.toISOString();
    const endISO = endUTC.toISOString();

    if (appointment.googleCalendarEventId || appointment.googleCalendarEventId2) {
      try {
        const { updateEvent } = await import('./src/services/googleCalendarService.js');

        console.log('[PATCH] 📅 Actualizando eventos en Google Calendar...');

        // Actualizar en calendario 1 (Said)
        if (appointment.googleCalendarEventId) {
          try {
            await updateEvent(appointment.googleCalendarEventId, {
              calendarId: config.google.calendarOwner1,
              title: `${serviceName || appointment.serviceName} - ${appointment.clientName}`,
              description: `Cliente: ${appointment.clientName}\nTel: ${appointment.clientPhone}\nServicio: ${serviceName || appointment.serviceName}`,
              location: 'Cactus 50, San Juan del Río',
              startISO: startISO,
              endISO: endISO
            });
            console.log(`[PATCH] ✅ Evento actualizado en calendar Said`);
          } catch (err1) {
            console.error(`[PATCH] ⚠️ Error actualizando calendar Said:`, err1.message);
          }
        }

        // Actualizar en calendario 2 (Alondra)
        if (appointment.googleCalendarEventId2) {
          try {
            await updateEvent(appointment.googleCalendarEventId2, {
              calendarId: config.google.calendarOwner2,
              title: `${serviceName || appointment.serviceName} - ${appointment.clientName}`,
              description: `Cliente: ${appointment.clientName}\nTel: ${appointment.clientPhone}\nServicio: ${serviceName || appointment.serviceName}`,
              location: 'Cactus 50, San Juan del Río',
              startISO: startISO,
              endISO: endISO
            });
            console.log(`[PATCH] ✅ Evento actualizado en calendar Alondra`);
          } catch (err2) {
            console.error(`[PATCH] ⚠️ Error actualizando calendar Alondra:`, err2.message);
          }
        }
      } catch (calErr) {
        console.error('[PATCH] ⚠️ Error con Google Calendar:', calErr.message);
        // No falla la operación si Google Calendar falla
      }
    }

    // Crear notificación usando Prisma
    await NotificationsRepo.create({
      type: 'cita',
      icon: 'edit',
      title: 'Cita modificada',
      message: `${appointment.clientName} - ${serviceName || appointment.serviceName} reprogramada para ${date} a las ${time}`,
      read: false,
      entityId: id
    });

    console.log(`[API] Appointment ${id} updated: ${date} ${time}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/appointments/:id/status - Actualizar estado de cita
app.patch('/api/appointments/:id/status', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status es requerido' });
    }

    const validStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Status inválido' });
    }

    // Obtener cita usando Prisma
    const appointment = await AppointmentsRepo.findById(id);

    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada' });
    }

    const oldStatus = appointment.status;

    // Actualizar estado usando repositorio
    await AppointmentsRepo.update(id, { status });

    // Crear notificación de cambio manual de estado usando Prisma
    const statusLabels = {
      'scheduled': 'Agendada',
      'confirmed': 'Confirmada',
      'completed': 'Completada',
      'cancelled': 'Cancelada',
      'no_show': 'No asistió'
    };

    const statusIcons = {
      'scheduled': 'calendar',
      'confirmed': 'calendar-check',
      'completed': 'check-circle',
      'cancelled': 'times-circle',
      'no_show': 'user-times'
    };

    await NotificationsRepo.create({
      type: 'cita',
      icon: statusIcons[status] || 'calendar',
      title: `Estado actualizado: ${statusLabels[status]}`,
      message: `${appointment.clientName} - ${appointment.serviceName} (${statusLabels[oldStatus]} → ${statusLabels[status]})`,
      read: false,
      entityId: id
    });

    console.log(`[API] Appointment ${id} status updated to: ${status}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating appointment status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/appointments/:id/cancel - Cancelar cita y eliminar de Google Calendar
app.patch('/api/appointments/:id/cancel', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener la cita antes de eliminarla para tener los eventIds
    const appointment = await AppointmentsRepo.findById(id);

    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada' });
    }

    console.log(`[CANCEL] Eliminando cita ${id} - ${appointment.clientName}`);

    // Eliminar de Google Calendar ANTES de eliminar de la base de datos
    if (appointment.googleCalendarEventId || appointment.googleCalendarEventId2) {
      try {
        const { deleteEvent } = await import('./src/services/googleCalendarService.js');

        // Eliminar evento 1 si existe
        if (appointment.googleCalendarEventId) {
          try {
            await deleteEvent(appointment.googleCalendarEventId, config.google.calendarOwner1);
            console.log(`[CANCEL] ✅ Evento eliminado del calendar 1: ${appointment.googleCalendarEventId}`);
          } catch (err) {
            console.error(`[CANCEL] ❌ Error eliminando evento del calendar 1:`, err.message);
          }
        }

        // Eliminar evento 2 si existe
        if (appointment.googleCalendarEventId2) {
          try {
            await deleteEvent(appointment.googleCalendarEventId2, config.google.calendarOwner2);
            console.log(`[CANCEL] ✅ Evento eliminado del calendar 2: ${appointment.googleCalendarEventId2}`);
          } catch (err) {
            console.error(`[CANCEL] ❌ Error eliminando evento del calendar 2:`, err.message);
          }
        }
      } catch (calErr) {
        console.error('[CANCEL] ⚠️ Error con Google Calendar:', calErr.message);
        // No falla la operación si Google Calendar falla
      }
    }

    // ELIMINAR completamente de la base de datos usando Prisma (no solo marcar como cancelada)
    await AppointmentsRepo.delete(id);

    // Crear notificación
    await NotificationsRepo.create({
      type: 'cita',
      icon: 'times-circle',
      title: 'Cita eliminada',
      message: `${appointment.clientName} - ${appointment.serviceName} eliminada`,
      read: false,
      entityId: id
    });

    console.log(`[CANCEL] ✅ Cita ${id} eliminada exitosamente`);
    res.json({ success: true });
  } catch (error) {
    console.error('[CANCEL] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ========== GIFT CARDS ========== */

// Generar código único
function generateGiftCardCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'VGC-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// GET /api/giftcards - Listar todas
app.get('/api/giftcards', adminAuth, async (req, res) => {
  try {
    const snapshot = await firestore.collection('giftcards')
      .orderBy('createdAt', 'desc')
      .get();

    const giftcards = [];
    snapshot.forEach(doc => {
      giftcards.push({ id: doc.id, ...doc.data() });
    });

    res.json({ success: true, data: giftcards });
  } catch (error) {
    console.error('Error fetching gift cards:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/giftcards - Crear
app.post('/api/giftcards', adminAuth, async (req, res) => {
  try {
    const { recipientName, serviceId, serviceName, servicePrice, message, validityDays } = req.body;

    if (!serviceName || servicePrice === undefined) {
      return res.json({ success: false, error: 'Servicio requerido' });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (validityDays || 30) * 24 * 60 * 60 * 1000);

    const giftcardData = {
      code: generateGiftCardCode(),
      recipientName: recipientName || null,
      serviceId,
      serviceName,
      servicePrice: parseFloat(servicePrice),
      message: message || null,
      validityDays: validityDays || 30,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      redeemedAt: null,
      redeemedBy: null,
      appointmentId: null
    };

    const docRef = await firestore.collection('giftcards').add(giftcardData);

    res.json({ success: true, id: docRef.id, code: giftcardData.code });
  } catch (error) {
    console.error('Error creating gift card:', error);
    res.json({ success: false, error: error.message });
  }
});

// GET /api/giftcards/code/:code - Obtener por código
app.get('/api/giftcards/code/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const snapshot = await firestore.collection('giftcards')
      .where('code', '==', code.toUpperCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.json({ success: false, error: 'Gift card no encontrada' });
    }

    const doc = snapshot.docs[0];
    const gc = { id: doc.id, ...doc.data() };

    // Verificar si expiró
    if (gc.status === 'pending' && new Date(gc.expiresAt) <= new Date()) {
      gc.status = 'expired';
    }

    res.json({ success: true, data: gc });
  } catch (error) {
    console.error('Error fetching gift card:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/giftcards/:id/redeem - Canjear
app.post('/api/giftcards/:id/redeem', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { redeemedBy, appointmentId } = req.body;

    const docRef = firestore.collection('giftcards').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.json({ success: false, error: 'Gift card no encontrada' });
    }

    const gc = doc.data();

    if (gc.status === 'redeemed') {
      return res.json({ success: false, error: 'Esta gift card ya fue canjeada' });
    }

    if (new Date(gc.expiresAt) <= new Date()) {
      return res.json({ success: false, error: 'Esta gift card ha expirado' });
    }

    await docRef.update({
      status: 'redeemed',
      redeemedAt: new Date().toISOString(),
      redeemedBy: redeemedBy || null,
      appointmentId: appointmentId || null
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error redeeming gift card:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/giftcards/:id/renew - Renovar
app.post('/api/giftcards/:id/renew', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { days } = req.body;

    const docRef = firestore.collection('giftcards').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.json({ success: false, error: 'Gift card no encontrada' });
    }

    const gc = doc.data();

    if (gc.status === 'redeemed') {
      return res.json({ success: false, error: 'No se puede renovar una gift card canjeada' });
    }

    const newExpiry = new Date(Date.now() + (days || 30) * 24 * 60 * 60 * 1000);

    await docRef.update({
      status: 'pending',
      expiresAt: newExpiry.toISOString()
    });

    res.json({ success: true, newExpiresAt: newExpiry.toISOString() });
  } catch (error) {
    console.error('Error renewing gift card:', error);
    res.json({ success: false, error: error.message });
  }
});

// DELETE /api/giftcards/:id - Eliminar
app.delete('/api/giftcards/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await firestore.collection('giftcards').doc(id).delete();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting gift card:', error);
    res.json({ success: false, error: error.message });
  }
});

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
    if (!card) {
      return res.json({ success: false, error: "not_found" });
    }
    res.json({ success: true, data: card });
  } catch (e) {
    console.error("[GET /api/card]", e);
    res.json({ success: false, error: e.message });
  }
});

/* =========================================================
   BUSCAR TARJETA POR TELÉFONO
   ========================================================= */
app.get("/api/card/by-phone/:phone", async (req, res) => {
  try {
    const phone = req.params.phone.replace(/\D/g, '');
    if (!phone || phone.length < 10) {
      return res.status(400).json({ success: false, error: "Teléfono inválido" });
    }

    const card = await CardsRepo.findByPhone(phone);
    if (!card) {
      return res.status(404).json({ success: false, error: "No se encontró ninguna tarjeta con ese teléfono" });
    }

    res.json({ success: true, data: card });
  } catch (e) {
    console.error("[GET /api/card/by-phone]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* =========================================================
   OBTENER CITAS POR TELÉFONO
   ========================================================= */
app.get("/api/appointments/by-phone/:phone", async (req, res) => {
  try {
    const phone = req.params.phone.replace(/\D/g, '');
    if (!phone || phone.length < 10) {
      return res.status(400).json({ success: false, error: "Teléfono inválido" });
    }

    // Buscar citas por teléfono
    const appointments = await AppointmentsRepo.findByPhone(phone);

    res.json({ success: true, appointments: appointments || [] });
  } catch (e) {
    console.error("[GET /api/appointments/by-phone]", e);
    res.status(500).json({ success: false, error: e.message });
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

/* =========================================================
   GASTOS (EXPENSES)
   ========================================================= */

// GET /api/expenses - Listar gastos en un rango de fechas
app.get('/api/expenses', adminAuth, async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ success: false, error: 'Se requieren fechas from y to' });
    }

    const snapshot = await firestore.collection('expenses')
      .where('date', '>=', from)
      .where('date', '<=', to)
      .orderBy('date', 'desc')
      .get();

    const data = [];
    snapshot.forEach(doc => {
      data.push({ id: doc.id, ...doc.data() });
    });

    console.log(`[EXPENSES] Listando ${data.length} gastos de ${from} a ${to}`);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[EXPENSES] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/expenses/:id - Obtener un gasto por ID
app.get('/api/expenses/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await firestore.collection('expenses').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Gasto no encontrado' });
    }

    res.json({ success: true, data: { id: doc.id, ...doc.data() } });
  } catch (error) {
    console.error('[EXPENSES] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/expenses - Crear nuevo gasto
app.post('/api/expenses', adminAuth, async (req, res) => {
  try {
    const { date, category, description, amount } = req.body;

    if (!date || !category || !description || !amount) {
      return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
    }

    const expenseData = {
      date,
      category,
      description,
      amount: parseFloat(amount),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await firestore.collection('expenses').add(expenseData);
    console.log(`[EXPENSES] Gasto creado: ${docRef.id}`);

    res.json({ success: true, id: docRef.id });
  } catch (error) {
    console.error('[EXPENSES] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/expenses/:id - Actualizar gasto
app.put('/api/expenses/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, category, description, amount } = req.body;

    if (!date || !category || !description || !amount) {
      return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
    }

    const updateData = {
      date,
      category,
      description,
      amount: parseFloat(amount),
      updatedAt: new Date().toISOString()
    };

    await firestore.collection('expenses').doc(id).update(updateData);
    console.log(`[EXPENSES] Gasto actualizado: ${id}`);

    res.json({ success: true });
  } catch (error) {
    console.error('[EXPENSES] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/expenses/:id - Eliminar gasto
app.delete('/api/expenses/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await firestore.collection('expenses').doc(id).delete();
    console.log(`[EXPENSES] Gasto eliminado: ${id}`);

    res.json({ success: true });
  } catch (error) {
    console.error('[EXPENSES] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* =========================================================
   CLIENTES
   ========================================================= */

// POST /api/clients - Crear cliente nuevo desde admin (sin cumpleaños requerido)
app.post("/api/clients", adminAuth, async (req, res) => {
  try {
    const { name, phone, birthday } = req.body;

    console.log('[CREATE CLIENT] 📝 Intentando crear cliente:', { name, phone, hasBirthday: !!birthday });

    // Validar campos requeridos
    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        error: "Nombre y teléfono son requeridos"
      });
    }

    const cleanPhone = String(phone).replace(/\D/g, '');
    const cleanName = String(name).trim();

    // Verificar si ya existe un cliente con este teléfono
    const existingSnap = await firestore.collection(COL_CARDS)
      .where('phone', '==', cleanPhone)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      return res.status(400).json({
        success: false,
        error: "Ya existe un cliente con este teléfono"
      });
    }

    // Crear tarjeta de lealtad
    const cardId = `card_${Date.now()}`;
    const cardData = {
      id: cardId,
      name: cleanName,
      phone: cleanPhone,
      birthday: birthday || null,  // ✅ cumpleaños es OPCIONAL
      stamps: 0,
      max: 8,
      cycles: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastVisit: new Date().toISOString(),
      source: 'admin-panel'
    };

    await firestore.collection(COL_CARDS).doc(cardId).set(cardData);

    // Registrar evento
    await fsAddEvent(cardId, "ISSUE", {
      name: cleanName,
      phone: cleanPhone,
      birthday: birthday || null,
      by: "admin"
    });

    console.log(`[CREATE CLIENT] ✅ Cliente creado exitosamente: ${cardId}`, {
      name: cleanName,
      phone: cleanPhone,
      hasBirthday: !!birthday
    });

    res.json({
      success: true,
      client: {
        id: cardId,
        name: cleanName,
        phone: cleanPhone,
        birthday: birthday || null,
        stamps: 0,
        max: 8
      }
    });
  } catch (error) {
    console.error("[CREATE CLIENT] ❌ Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Error al crear cliente"
    });
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
   CONFIGURACIÓN DEL NEGOCIO Y SOLICITUD DE CITAS
   ========================================================= */

// GET /api/config/maps-key - Obtener API key de Google Maps (solo para admin)
app.get('/api/config/maps-key', adminAuth, async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({ success: true, apiKey });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// GET /api/config/firebase - Obtener configuración pública de Firebase (solo para admin)
app.get('/api/config/firebase', adminAuth, async (req, res) => {
  try {
    const firebaseConfig = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID
    };
    res.json({ success: true, config: firebaseConfig });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// GET /api/settings/business - Obtener configuración del negocio
app.get('/api/settings/business', async (req, res) => {
  try {
    const doc = await firestore.collection('settings').doc('business').get();

    if (!doc.exists) {
      return res.json({
        success: true,
        data: {
          businessHours: {
            start: '09:00',
            end: '20:00',
            interval: 60,
            closedDays: [0]
          },
          whatsappBusiness: '524271657595'
        }
      });
    }

    res.json({ success: true, data: doc.data() });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// POST /api/settings/business - Guardar configuración del negocio
app.post('/api/settings/business', adminAuth, async (req, res) => {
  try {
    await firestore.collection('settings').doc('business').set(req.body, { merge: true });
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// GET /api/public/services - Servicios disponibles (público)
app.get('/api/public/services', async (req, res) => {
  try {
    const snapshot = await firestore.collection('services')
      .orderBy('category')
      .orderBy('name')
      .get();

    const services = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.active !== false && data.bookable !== false) {
        services.push({
          id: doc.id,
          name: data.name,
          category: data.category || 'Otros',
          price: data.price || 0,
          duration: data.duration || 60,
          description: data.description || [],
          discount: data.discount || null
        });
      }
    });

    res.json({ success: true, data: services });
  } catch (error) {
    // Si falla por índice, intentar sin ordenar por categoría
    try {
      const snapshot2 = await firestore.collection('services').orderBy('name').get();
      const services2 = [];
      snapshot2.forEach(doc => {
        const data = doc.data();
        if (data.active !== false && data.bookable !== false) {
          services2.push({
            id: doc.id,
            name: data.name,
            category: data.category || 'Otros',
            price: data.price || 0,
            duration: data.duration || 60,
            description: data.description || [],
            discount: data.discount || null
          });
        }
      });
      res.json({ success: true, data: services2 });
    } catch (e2) {
      res.json({ success: false, error: e2.message });
    }
  }
});

// GET /api/public/services - Servicios disponibles (público)
app.get('/api/public/services', async (req, res) => {
  // ... existing code ...
});

// ──────────────────────────────────────────────
//  DIGITAL WALLET ROUTES
// ──────────────────────────────────────────────

// Serve card page at /card/:id
app.get('/card/:id', (req, res) => {
  res.sendFile('card.html', { root: path.join(process.cwd(), 'public') });
});

// GET /api/public/card/:id — card data for the client card page
app.get('/api/public/card/:id', async (req, res) => {
  try {
    const card = await prisma.card.findUnique({ where: { id: req.params.id } });
    if (!card) return res.status(404).json({ error: 'Tarjeta no encontrada' });

    // Check if Apple certs are configured
    const applePassAvailable = !!(
      process.env.APPLE_CERT_PEM &&
      process.env.APPLE_KEY_PEM &&
      (process.env.APPLE_WWDR_PEM || true) // wwdr_rsa.pem exists in repo
    );

    res.json({
      id: card.id,
      name: card.name,
      phone: card.phone,
      stamps: card.stamps,
      max: card.max,
      cycles: card.cycles,
      cardType: card.cardType || 'loyalty',
      cardColor: card.cardColor || '#8C9668',
      sessionsTotal: card.sessionsTotal || 0,
      sessionsUsed: card.sessionsUsed || 0,
      googleWalletUrl: card.walletPassUrl || null,
      applePassAvailable,
    });
  } catch (e) {
    console.error('[WALLET] Error getting card:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/public/card/:id/apple.pkpass — download Apple Wallet pass
app.get('/api/public/card/:id/apple.pkpass', async (req, res) => {
  try {
    const card = await prisma.card.findUnique({ where: { id: req.params.id } });
    if (!card) return res.status(404).json({ error: 'Tarjeta no encontrada' });

    const { generateApplePass } = await import('./src/services/appleWallet.js');
    const buffer = await generateApplePass(card);

    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="venus-${card.id}.pkpass"`,
    });
    res.send(buffer);
  } catch (e) {
    console.error('[WALLET] Apple pass error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/cards/:id/issue-wallet — issue/regenerate wallet for a card
app.post('/api/admin/cards/:id/issue-wallet', adminAuth, async (req, res) => {
  try {
    const { cardType, cardColor, sessionsTotal } = req.body;
    const card = await prisma.card.update({
      where: { id: req.params.id },
      data: {
        cardType: cardType || 'loyalty',
        cardColor: cardColor || '#8C9668',
        sessionsTotal: parseInt(sessionsTotal) || 0,
        sessionsUsed: 0,
      },
    });

    // Try to generate Google Wallet URL
    let googleWalletUrl = null;
    if (process.env.GOOGLE_WALLET_ISSUER_ID && process.env.GOOGLE_WALLET_SERVICE_ACCOUNT) {
      try {
        const { generateGoogleWalletUrl } = await import('./src/services/googleWallet.js');
        googleWalletUrl = await generateGoogleWalletUrl({ ...card, cardType: cardType || card.cardType });
        await prisma.card.update({ where: { id: card.id }, data: { walletPassUrl: googleWalletUrl } });
      } catch (gErr) {
        console.warn('[WALLET] Google Wallet generation failed:', gErr.message);
      }
    }

    const cardLink = `${process.env.BASE_URL || 'https://venus-loyalty.onrender.com'}/card/${card.id}`;

    res.json({ success: true, cardLink, googleWalletUrl });
  } catch (e) {
    console.error('[WALLET] Issue wallet error:', e);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/admin/cards/:id/redeem-session — redeem 1 session (Venus Constancia Anual)
app.patch('/api/admin/cards/:id/redeem-session', adminAuth, async (req, res) => {
  try {
    const card = await prisma.card.findUnique({ where: { id: req.params.id } });
    if (!card) return res.status(404).json({ error: 'Tarjeta no encontrada' });
    if (card.sessionsTotal === 0) return res.status(400).json({ error: 'Esta tarjeta no tiene sesiones prepagadas' });
    if (card.sessionsUsed >= card.sessionsTotal) return res.status(400).json({ error: 'No hay sesiones disponibles' });

    const updated = await prisma.card.update({
      where: { id: card.id },
      data: { sessionsUsed: { increment: 1 } },
    });

    res.json({
      success: true,
      sessionsUsed: updated.sessionsUsed,
      sessionsTotal: updated.sessionsTotal,
      sessionsLeft: updated.sessionsTotal - updated.sessionsUsed,
    });
  } catch (e) {
    console.error('[WALLET] Redeem session error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/public/config - Configuración pública (información del negocio)
app.get('/api/public/config', async (req, res) => {
  try {
    const doc = await firestore.collection('settings').doc('business').get();

    const businessConfig = doc.exists ? doc.data() : {
      businessName: 'Venus Cosmetología',
      address: 'San Juan del Río, Querétaro',
      mapsUrl: '',
      openTime: '09:00',
      closeTime: '19:00',
      workDays: [1, 2, 3, 4, 5, 6],
      businessHours: {
        start: '09:00',
        end: '20:00',
        interval: 60,
        closedDays: [0]
      }
    };

    res.json({
      success: true,
      data: {
        businessName: businessConfig.businessName || 'Venus Cosmetología',
        address: businessConfig.address || 'San Juan del Río, Querétaro',
        mapsUrl: businessConfig.mapsUrl || '',
        openTime: businessConfig.openTime || '09:00',
        closeTime: businessConfig.closeTime || '19:00',
        workDays: businessConfig.workDays || [1, 2, 3, 4, 5, 6],
        businessHours: businessConfig.businessHours || {
          start: businessConfig.openTime || '09:00',
          end: businessConfig.closeTime || '19:00',
          interval: 60,
          closedDays: businessConfig.workDays ? [0, 1, 2, 3, 4, 5, 6].filter(d => !businessConfig.workDays.includes(d)) : [0]
        }
      }
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// GET /api/public/availability?date=2025-12-04 - Horarios ocupados
app.get('/api/public/availability', async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.json({ success: false, error: 'Fecha requerida' });
    }

    console.log(`[AVAILABILITY] ============================================`);
    console.log(`[AVAILABILITY] Buscando disponibilidad para: ${date}`);

    // Las citas se crean con new Date('YYYY-MM-DDT09:00:00')
    // En México (UTC-6), esto automáticamente se convierte a UTC al usar toISOString()
    // Ejemplo: 2025-12-31T09:00:00 local -> 2025-12-31T15:00:00.000Z en UTC

    // Para buscar todas las citas del día en hora local de México:
    // - El día en México va de 00:00 a 23:59 hora local
    // - En UTC esto es de 06:00Z a 05:59Z del día siguiente

    const busy = [];
    const processedIds = new Set();

    // ESTRATEGIA 1: Buscar citas que empiezan con la fecha (formato sin Z)
    // Esto captura citas guardadas como "2025-12-31T09:00:00" sin conversión a UTC
    console.log(`[AVAILABILITY] Buscando citas con formato local (${date}T...)`);

    const localSnapshot = await firestore.collection('appointments')
      .where('startDateTime', '>=', date + 'T00:00:00')
      .where('startDateTime', '<=', date + 'T23:59:59')
      .get();

    console.log(`[AVAILABILITY] Encontradas ${localSnapshot.size} citas con startDateTime local`);

    localSnapshot.forEach(doc => {
      if (processedIds.has(doc.id)) return;
      processedIds.add(doc.id);

      const data = doc.data();
      console.log(`[AVAILABILITY] Local - ID: ${doc.id}, startDateTime: ${data.startDateTime}, status: ${data.status}`);

      if (data.status === 'cancelled') return;

      // Extraer hora directamente del string
      const timePart = data.startDateTime.split('T')[1] || '';
      const timeMatch = timePart.match(/^(\d{2}):(\d{2})/);
      if (timeMatch) {
        const timeSlot = `${timeMatch[1]}:${timeMatch[2]}`;
        if (!busy.includes(timeSlot)) {
          busy.push(timeSlot);
          console.log(`[AVAILABILITY] ✅ Agregando slot ocupado: ${timeSlot}`);
        }
      }
    });

    // ESTRATEGIA 2: Buscar citas en formato UTC (terminan en Z)
    // El día 2025-12-31 en México (UTC-6) corresponde a:
    // Desde 2025-12-31T06:00:00.000Z hasta 2026-01-01T05:59:59.999Z
    const startUTC = date + 'T06:00:00.000Z';
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split('T')[0];
    const endUTC = nextDayStr + 'T05:59:59.999Z';

    console.log(`[AVAILABILITY] Buscando citas UTC entre ${startUTC} y ${endUTC}`);

    const utcSnapshot = await firestore.collection('appointments')
      .where('startDateTime', '>=', startUTC)
      .where('startDateTime', '<=', endUTC)
      .get();

    console.log(`[AVAILABILITY] Encontradas ${utcSnapshot.size} citas en formato UTC`);

    utcSnapshot.forEach(doc => {
      if (processedIds.has(doc.id)) return;
      processedIds.add(doc.id);

      const data = doc.data();
      console.log(`[AVAILABILITY] UTC - ID: ${doc.id}, startDateTime: ${data.startDateTime}, status: ${data.status}`);

      if (data.status === 'cancelled') return;

      // Convertir de UTC a hora local de México (restar 6 horas)
      const utcDate = new Date(data.startDateTime);
      const localHours = utcDate.getUTCHours() - 6;
      const adjustedHour = localHours < 0 ? localHours + 24 : localHours;
      const minutes = utcDate.getUTCMinutes();

      const timeSlot = `${adjustedHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      if (!busy.includes(timeSlot)) {
        busy.push(timeSlot);
        console.log(`[AVAILABILITY] ✅ Agregando slot ocupado (UTC -> Local): ${timeSlot}`);
      }
    });

    // ESTRATEGIA 3: También buscar usando el campo 'date' directamente si existe
    console.log(`[AVAILABILITY] Buscando citas con campo date = ${date}`);

    const dateFieldSnapshot = await firestore.collection('appointments')
      .where('date', '==', date)
      .get();

    console.log(`[AVAILABILITY] Encontradas ${dateFieldSnapshot.size} citas con campo date`);

    dateFieldSnapshot.forEach(doc => {
      if (processedIds.has(doc.id)) return;
      processedIds.add(doc.id);

      const data = doc.data();
      console.log(`[AVAILABILITY] DateField - ID: ${doc.id}, time: ${data.time}, status: ${data.status}`);

      if (data.status === 'cancelled') return;

      // Usar el campo 'time' directamente
      if (data.time) {
        const timeSlot = data.time.substring(0, 5); // Tomar solo HH:MM
        if (!busy.includes(timeSlot)) {
          busy.push(timeSlot);
          console.log(`[AVAILABILITY] ✅ Agregando slot ocupado (campo time): ${timeSlot}`);
        }
      }
    });

    // ESTRATEGIA 3: Verificar Bloqueos de Horario (BlockedSlots)
    const requestDate = new Date(date + 'T00:00:00');
    const dayOfWeek = requestDate.getDay(); // 0-6

    const blockedSlots = await BlockedSlotsRepo.findAll();

    blockedSlots.forEach(block => {
      // Verificar si el bloqueo aplica a esta fecha
      let applies = false;

      if (block.date === date) {
        applies = true; // Bloqueo de fecha específica
      } else if (block.dayOfWeek !== null && block.dayOfWeek === dayOfWeek) {
        applies = true; // Bloqueo recurrente (mismo día de la semana)
      }

      if (applies) {
        // Agregar todos los slots en el rango
        const startH = parseInt(block.startTime.split(':')[0]);
        const startM = parseInt(block.startTime.split(':')[1]);
        const endH = parseInt(block.endTime.split(':')[0]);
        const endM = parseInt(block.endTime.split(':')[1]);

        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        // Generar slots de 08:00 a 21:00 (o el rango que sea)
        // Aquí simplificamos y marcamos los slots exactos que caen en el rango
        // Asumiendo slots cada 60 mins por defecto, pero el frontend maneja la lógica de visualización
        // Mejor enfoque: Marcar todas las horas "en punto" dentro del rango como ocupadas

        for (let h = startH; h < endH; h++) {
          const timeSlot = `${h.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;
          if (!busy.includes(timeSlot)) {
            busy.push(timeSlot);
            console.log(`[AVAILABILITY] 🚫 Bloqueo administrativo (${block.reason}): ${timeSlot}`);
          }
        }
        // Si termina en media hora (ej 10:30), también bloquear la hora de inicio (10:00 ya cubierto)
        if (endM > 0) {
          const timeSlot = `${endH.toString().padStart(2, '0')}:00`;
          if (!busy.includes(timeSlot)) {
            busy.push(timeSlot);
          }
        }
      }
    });

    // Ordenar los slots
    busy.sort();

    console.log(`[AVAILABILITY] ============================================`);
    console.log(`[AVAILABILITY] RESULTADO: ${date} tiene ${busy.length} horarios ocupados:`, busy);
    console.log(`[AVAILABILITY] ============================================`);

    res.json({ success: true, busy });
  } catch (error) {
    console.error('[AVAILABILITY] Error:', error);
    res.json({ success: false, error: error.message });
  }
});

/* ========== BLOCKED SLOTS ========== */

// GET /api/calendar/blocks - Listar bloqueos
app.get('/api/calendar/blocks', adminAuth, async (req, res) => {
  try {
    const blocks = await BlockedSlotsRepo.findAll();
    res.json({ success: true, data: blocks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/calendar/blocks - Crear bloqueo
app.post('/api/calendar/blocks', adminAuth, async (req, res) => {
  try {
    const { startTime, endTime, date, dayOfWeek, reason } = req.body;

    if (!startTime || !endTime) {
      return res.status(400).json({ success: false, error: 'Hora inicio y fin requeridas' });
    }

    const block = await BlockedSlotsRepo.create({
      startTime,
      endTime,
      date: date || null,
      dayOfWeek: dayOfWeek !== undefined ? parseInt(dayOfWeek) : null,
      reason
    });

    res.json({ success: true, data: block });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/calendar/blocks/:id - Eliminar bloqueo
app.delete('/api/calendar/blocks/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await BlockedSlotsRepo.delete(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/public/request - Solicitar cita (NO agenda, solo solicita)
app.post('/api/public/request', async (req, res) => {
  try {
    const {
      serviceId,
      serviceName,
      servicePrice,
      serviceDuration,
      date,
      time,
      clientName,
      clientPhone,
      clientEmail,
      clientBirthday
    } = req.body;

    // Validaciones
    if (!serviceName || !date || !time || !clientName || !clientPhone) {
      return res.json({ success: false, error: 'Faltan campos requeridos' });
    }

    const phoneClean = clientPhone.replace(/\D/g, '');

    // 1. BUSCAR O CREAR TARJETA DE LEALTAD
    let cardId = null;
    let isNewClient = false;

    console.log(`[BOOKING REQUEST] 🔍 Buscando tarjeta para teléfono: ${phoneClean}`);

    const existingCard = await firestore.collection(COL_CARDS)
      .where('phone', '==', phoneClean)
      .limit(1)
      .get();

    if (!existingCard.empty) {
      cardId = existingCard.docs[0].id;
      const existingData = existingCard.docs[0].data();
      console.log(`[BOOKING REQUEST] ✅ Tarjeta existente encontrada: ${cardId}`, {
        name: existingData.name,
        hasEmail: !!existingData.email,
        hasBirthday: !!existingData.birthday
      });

      const updates = {};
      if (clientEmail && !existingData.email) {
        updates.email = clientEmail;
        console.log(`[BOOKING REQUEST] 📧 Agregando email a tarjeta existente`);
      }
      if (clientBirthday && !existingData.birthday) {
        updates.birthday = clientBirthday;
        console.log(`[BOOKING REQUEST] 🎂 Agregando cumpleaños a tarjeta existente`);
      }
      if (Object.keys(updates).length > 0) {
        await firestore.collection(COL_CARDS).doc(cardId).update(updates);
        console.log(`[BOOKING REQUEST] 🔄 Tarjeta actualizada con:`, updates);
      }
    } else {
      // Generar ID único para la tarjeta
      const newCardRef = firestore.collection(COL_CARDS).doc();
      cardId = newCardRef.id;

      const cardData = {
        id: cardId,
        name: clientName,
        phone: phoneClean,
        email: clientEmail || null,
        birthday: clientBirthday || null,
        stamps: 0,
        max: 8,
        cycles: 0,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'online-request'
      };

      console.log(`[BOOKING REQUEST] 🆕 Creando nueva tarjeta:`, {
        cardId,
        name: clientName,
        phone: phoneClean,
        hasEmail: !!clientEmail,
        hasBirthday: !!clientBirthday
      });

      await newCardRef.set(cardData);
      isNewClient = true;
      console.log(`[BOOKING REQUEST] ✅ Nueva tarjeta creada exitosamente: ${cardId}`);
    }

    // 2. GUARDAR SOLICITUD
    const requestData = {
      serviceId: serviceId || null,
      serviceName,
      servicePrice: parseFloat(servicePrice) || 0,
      serviceDuration: parseInt(serviceDuration) || 60,
      date,
      time,
      clientName,
      clientPhone: phoneClean,
      clientEmail: clientEmail || null,
      cardId,
      isNewClient,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const requestRef = await firestore.collection('booking_requests').add(requestData);
    console.log(`[BOOKING REQUEST] ✅ Solicitud guardada con ID: ${requestRef.id}`);

    // 2.1 ENVIAR NOTIFICACIONES POR EMAIL
    // Notificar al Admin
    EmailService.sendNewRequestNotification(requestData).catch(err =>
      console.error('[BOOKING REQUEST] ❌ Error enviando email al admin:', err.message)
    );

    // Notificar al Cliente (Confirmación de recibida)
    if (clientEmail) {
      EmailService.sendConfirmation({
        clientName,
        clientEmail,
        serviceName,
        date,
        time
      }).catch(err =>
        console.error('[BOOKING REQUEST] ❌ Error enviando email al cliente:', err.message)
      );
    }

    // 3. CREAR MENSAJE PARA WHATSAPP
    const settingsDoc = await firestore.collection('settings').doc('business').get();
    const businessWhatsapp = settingsDoc.exists ? settingsDoc.data().whatsappBusiness : '524271657595';

    const dateObj = new Date(date + 'T00:00:00');
    const dateStr = dateObj.toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long'
    });

    const hour = parseInt(time.split(':')[0]);
    const timeStr = hour === 12 ? '12:00 PM' : hour > 12 ? `${hour - 12}:00 PM` : `${hour}:00 AM`;

    const message = `*NUEVA SOLICITUD DE CITA*

*Cliente:* ${clientName}
*Tel:* ${phoneClean}
${clientEmail ? `*Email:* ${clientEmail}` : ''}

*Servicio:* ${serviceName}
*Precio:* $${servicePrice}
*Fecha:* ${dateStr}
*Hora:* ${timeStr}

${isNewClient ? '_Cliente nueva - Ya registrada en tarjetas_' : '_Cliente existente_'}

#${requestRef.id.slice(-6)}`;

    const whatsappUrl = `https://wa.me/${businessWhatsapp}?text=${encodeURIComponent(message)}`;

    // 4. CREAR NOTIFICACIÓN EN ADMIN
    await firestore.collection('notifications').add({
      type: 'cita',
      icon: 'calendar-plus',
      title: 'Nueva solicitud',
      message: `${clientName} quiere ${serviceName} - ${date} ${time}`,
      entityId: requestRef.id,
      read: false,
      createdAt: new Date().toISOString()
    });

    console.log(`[BOOKING REQUEST] Nueva solicitud de ${clientName} para ${serviceName}`);

    res.json({
      success: true,
      requestId: requestRef.id,
      cardId,
      isNewClient,
      whatsappUrl
    });

  } catch (error) {
    console.error('Error creating request:', error);
    res.json({ success: false, error: error.message });
  }
});

// GET /api/booking-requests - Listar solicitudes pendientes
app.get('/api/booking-requests', adminAuth, async (req, res) => {
  try {
    const snapshot = await firestore.collection('booking_requests')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const data = [];
    snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

    console.log(`[BOOKING REQUESTS] 📋 Listando ${data.length} solicitudes`);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[BOOKING REQUESTS] ❌ Error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/booking-requests/:id/contacted - Marcar como contactada
app.post('/api/booking-requests/:id/contacted', adminAuth, async (req, res) => {
  try {
    await firestore.collection('booking_requests').doc(req.params.id).update({
      status: 'contacted',
      contactedAt: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// POST /api/booking-requests/:id/booked - Marcar como agendada (crea la cita real con calendario y WhatsApp)
app.post('/api/booking-requests/:id/booked', adminAuth, async (req, res) => {
  try {
    const requestDoc = await firestore.collection('booking_requests').doc(req.params.id).get();

    if (!requestDoc.exists) {
      return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
    }

    const requestData = requestDoc.data();

    // Construir startDateTime y endDateTime con timezone de México
    const startDateTime = `${requestData.date}T${requestData.time}:00-06:00`;
    const duration = requestData.serviceDuration || 60;

    // Calcular endDateTime sumando duración a la hora de inicio (en minutos locales)
    const [startHour, startMin] = requestData.time.split(':').map(Number);
    const totalMinutes = startHour * 60 + startMin + duration;
    const endHours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const endMinutes = (totalMinutes % 60).toString().padStart(2, '0');
    const endDateTime = `${requestData.date}T${endHours}:${endMinutes}:00-06:00`;

    // Crear la cita en appointments
    const appointmentData = {
      serviceId: requestData.serviceId || null,
      serviceName: requestData.serviceName,
      price: requestData.servicePrice || 0,
      duration: duration,
      clientId: requestData.cardId || null,
      clientName: requestData.clientName,
      clientPhone: requestData.clientPhone,
      clientEmail: requestData.clientEmail || null,
      cardId: requestData.cardId || null,
      date: requestData.date,    // Campo date para WhatsApp
      time: requestData.time,    // Campo time para WhatsApp (sin conversión de timezone)
      startDateTime,
      endDateTime,
      location: 'Venus Cosmetología',
      status: 'confirmed', // Ya fue confirmada manualmente por admin
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'online-request',
      requestId: req.params.id,
      sendWhatsApp24h: true, // Enviar recordatorios automáticos
      sendWhatsApp2h: true,
      cosmetologistEmail: config.google.calendarOwner1 // Said por defecto
    };

    // 1. CREAR EVENTOS EN GOOGLE CALENDAR (Said y Alondra)
    const eventData = {
      title: `${requestData.serviceName} - ${requestData.clientName}`,
      description: `Cliente: ${requestData.clientName}\\nTel: ${requestData.clientPhone}\\nServicio: ${requestData.serviceName}\\nPrecio: $${requestData.servicePrice || 0}`,
      location: 'Cactus 50, San Juan del Río',
      startISO: startDateTime,
      endISO: endDateTime
    };

    try {
      const { createEvent } = await import('./src/services/googleCalendarService.js');

      console.log('[BOOKING] 📅 Creando eventos en calendarios...');

      // Crear en calendario 1 (Said)
      try {
        const eventId1 = await createEvent({
          ...eventData,
          calendarId: config.google.calendarOwner1
        });
        appointmentData.googleCalendarEventId = eventId1;
        console.log(`[BOOKING] ✅ Evento creado en calendar Said: ${eventId1}`);
      } catch (err1) {
        console.error(`[BOOKING] ❌ Error en calendar Said:`, err1.message);
      }

      // Crear en calendario 2 (Alondra)
      try {
        const eventId2 = await createEvent({
          ...eventData,
          calendarId: config.google.calendarOwner2
        });
        appointmentData.googleCalendarEventId2 = eventId2;
        console.log(`[BOOKING] ✅ Evento creado en calendar Alondra: ${eventId2}`);
      } catch (err2) {
        console.error(`[BOOKING] ❌ Error en calendar Alondra:`, err2.message);
      }

    } catch (calErr) {
      console.error('[BOOKING] ⚠️ Error creating calendar event:', calErr.message);
    }

    // 2. GUARDAR CITA EN FIRESTORE
    const appointmentRef = await firestore.collection('appointments').add(appointmentData);
    console.log(`[BOOKING] ✅ Cita creada desde solicitud: ${appointmentRef.id}`);

    // 3. ENVIAR WHATSAPP DE CONFIRMACIÓN
    try {
      const appointment = { id: appointmentRef.id, ...appointmentData };
      const whatsappResult = await WhatsAppService.sendConfirmation(appointment);

      if (whatsappResult.success) {
        console.log('[BOOKING] ✅ WhatsApp enviado:', whatsappResult.messageSid);
      } else {
        console.error('[BOOKING] ❌ Error enviando WhatsApp:', whatsappResult.error);
      }
    } catch (whatsappError) {
      console.error('[BOOKING] ❌ Error en WhatsApp service:', whatsappError);
    }

    // 4. ACTUALIZAR SOLICITUD
    await firestore.collection('booking_requests').doc(req.params.id).update({
      status: 'booked',
      bookedAt: new Date().toISOString(),
      appointmentId: appointmentRef.id
    });

    // 5. CREAR NOTIFICACIÓN
    await firestore.collection('notifications').add({
      type: 'cita',
      icon: 'calendar-check',
      title: 'Solicitud agendada',
      message: `${requestData.clientName} - ${requestData.serviceName} agendada para ${requestData.date}`,
      entityId: appointmentRef.id,
      read: false,
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, appointmentId: appointmentRef.id });
  } catch (error) {
    console.error('[BOOKING] Error:', error);
    res.json({ success: false, error: error.message });
  }
});

// DELETE /api/booking-requests - Borrar TODAS las solicitudes
app.delete('/api/booking-requests', adminAuth, async (req, res) => {
  try {
    const snapshot = await firestore.collection('booking_requests').get();

    const batch = firestore.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`[BOOKING] 🗑️ Se eliminaron ${snapshot.size} solicitudes`);

    res.json({ success: true, count: snapshot.size });
  } catch (error) {
    console.error('[BOOKING] Error deleting all requests:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/booking-requests/:id/rejected - Marcar como rechazada
app.post('/api/booking-requests/:id/rejected', adminAuth, async (req, res) => {
  try {
    await firestore.collection('booking_requests').doc(req.params.id).update({
      status: 'rejected',
      rejectedAt: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
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

// ⭐ NUEVO: Endpoint para métricas del mes (dashboard)
app.get("/api/admin/metrics-month", adminAuth, async (_req, res) => {
  try {
    const m = await fsMetricsMonth();
    res.json({ success: true, data: m });
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
        .where("type", "==", "stamp") // minúsculas
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

// ⭐ NUEVO: Endpoint para corregir campo lastVisit en tarjetas existentes
app.post("/api/admin/fix-lastvisit", adminAuth, async (req, res) => {
  try {
    console.log('🔧 Iniciando corrección de campo lastVisit...');

    const cardsSnap = await firestore.collection(COL_CARDS).get();
    let fixed = 0;
    let alreadyHave = 0;
    let noDate = 0;
    const total = cardsSnap.size;

    for (const doc of cardsSnap.docs) {
      const card = doc.data();

      // Si ya tiene lastVisit, skip
      if (card.lastVisit) {
        alreadyHave++;
        continue;
      }

      // Si no tiene lastVisit, usar updatedAt o createdAt
      const fallbackDate = card.updatedAt || card.createdAt;

      if (fallbackDate) {
        await firestore.collection(COL_CARDS).doc(doc.id).update({
          lastVisit: fallbackDate
        });

        console.log(`✅ ${card.name || doc.id}: lastVisit = ${fallbackDate}`);
        fixed++;
      } else {
        console.log(`⚠️  ${card.name || doc.id}: No hay fecha disponible`);
        noDate++;
      }
    }

    const result = {
      success: true,
      total,
      alreadyHave,
      fixed,
      noDate
    };

    console.log('📊 Resumen:', result);
    res.json(result);
  } catch (e) {
    console.error("[FIX-LASTVISIT]", e);
    res.status(500).json({ success: false, error: e.message });
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

// ⭐ NUEVO: Endpoint para estadísticas del dashboard (HOY)
app.get("/api/dashboard/today", adminAuth, async (req, res) => {
  try {
    // Obtener fecha de hoy en formato "YYYY-MM-DD"
    const today = new Date().toISOString().slice(0, 10);

    // Consultar citas del día actual usando el campo 'date'
    const snapshot = await firestore.collection('appointments')
      .where('date', '==', today)
      .get();

    let appointmentsCount = 0;
    let pendingCount = 0;
    let income = 0;

    snapshot.forEach(doc => {
      const data = doc.data();

      // Contar solo citas que no estén canceladas
      if (data.status !== 'cancelled') {
        appointmentsCount++;
      }

      if (data.status === 'scheduled' || data.status === 'confirmed') {
        pendingCount++;
      }

      if (data.status === 'completed' && data.totalPaid) {
        income += parseFloat(data.totalPaid) || 0;
      }
    });

    console.log(`[DASHBOARD TODAY] ${today} - Citas: ${appointmentsCount}, Pendientes: ${pendingCount}, Ingresos: $${income}`);

    res.json({
      success: true,
      data: {
        appointments: appointmentsCount,
        pending: pendingCount,
        income: income
      }
    });

  } catch (error) {
    console.error("Error fetching dashboard today stats:", error);
    res.json({ success: false, error: error.message });
  }
});

// ⭐ NUEVO: Endpoint para historial de actividad (7 días)
app.get("/api/dashboard/history", adminAuth, async (req, res) => {
  try {
    const history = [];
    const now = new Date();

    // Iterar últimos 7 días
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + 1);

      const snapshot = await firestore.collection('appointments')
        .where('startDateTime', '>=', date.toISOString())
        .where('startDateTime', '<', nextDate.toISOString())
        .get();

      let count = 0;
      let income = 0;

      snapshot.forEach(doc => {
        const data = doc.data();
        count++;
        if (data.status === 'completed' && data.totalPaid) {
          income += parseFloat(data.totalPaid) || 0;
        }
      });

      history.push({
        date: date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' }),
        appointments: count,
        income: income
      });
    }

    res.json({ success: true, data: history });
  } catch (error) {
    console.error("Error fetching dashboard history:", error);
    res.json({ success: false, error: error.message });
  }
});

/* =========================================================
   NOTIFICACIONES - API ENDPOINTS
   ========================================================= */

// GET /api/notifications - Listar notificaciones
app.get('/api/notifications', adminAuth, async (req, res) => {
  try {
    const { limit = 30 } = req.query;

    const snapshot = await firestore.collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get();

    const data = [];
    snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

    res.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.json({ success: false, error: error.message });
  }
});

// GET /api/notifications/new - Verificar nuevas notificaciones
app.get('/api/notifications/new', adminAuth, async (req, res) => {
  try {
    const { after } = req.query;
    let query = firestore.collection('notifications').orderBy('createdAt', 'desc').limit(10);

    if (after) {
      const afterDoc = await firestore.collection('notifications').doc(after).get();
      if (afterDoc.exists) {
        query = firestore.collection('notifications')
          .where('createdAt', '>', afterDoc.data().createdAt)
          .orderBy('createdAt', 'desc')
          .limit(10);
      }
    }

    const snapshot = await query.get();
    const data = [];
    snapshot.forEach(doc => {
      if (doc.id !== after) data.push({ id: doc.id, ...doc.data() });
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error("Error checking new notifications:", error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/notifications - Crear notificación
app.post('/api/notifications', adminAuth, async (req, res) => {
  try {
    const { type, icon, title, message, entityId } = req.body;

    const notifData = {
      type: type || 'info',
      icon: icon || 'bell',
      title: title || 'Notificación',
      message: message || '',
      entityId: entityId || null,
      read: false,
      createdAt: new Date().toISOString()
    };

    const docRef = await firestore.collection('notifications').add(notifData);

    res.json({ success: true, data: { id: docRef.id, ...notifData } });
  } catch (error) {
    console.error("Error creating notification:", error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/notifications/:id/read - Marcar como leída
app.post('/api/notifications/:id/read', adminAuth, async (req, res) => {
  try {
    await firestore.collection('notifications').doc(req.params.id).update({
      read: true,
      readAt: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/notifications/read-all - Marcar todas como leídas
app.post('/api/notifications/read-all', adminAuth, async (req, res) => {
  try {
    const snapshot = await firestore.collection('notifications').where('read', '==', false).get();
    const batch = firestore.batch();
    snapshot.forEach(doc => batch.update(doc.ref, { read: true, readAt: new Date().toISOString() }));
    await batch.commit();
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.json({ success: false, error: error.message });
  }
});

// DELETE /api/notifications/clear - Limpiar todas
app.delete('/api/notifications/clear', adminAuth, async (req, res) => {
  try {
    const snapshot = await firestore.collection('notifications').get();
    const batch = firestore.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    res.json({ success: true });
  } catch (error) {
    console.error("Error clearing notifications:", error);
    res.json({ success: false, error: error.message });
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

// ⭐ NUEVO: Borrar historial de notificaciones enviadas
app.delete("/api/admin/notifications/clear", adminAuth, async (req, res) => {
  try {
    // Usar la misma colección que lee getNotifications: 'notifications'
    const snapshot = await firestore.collection('notifications').get();

    if (snapshot.empty) {
      return res.json({ success: true, deleted: 0 });
    }

    const batch = firestore.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`[NOTIFICATIONS] ✅ Borradas ${snapshot.size} notificaciones del historial`);
    res.json({ success: true, deleted: snapshot.size });
  } catch (error) {
    console.error('[NOTIFICATIONS] Error borrando historial:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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

    // ⭐ Registrar actualización para Apple Wallet (upsert por serialNumber)
    const updateId = `update_${cardId}_${Date.now()}`;
    await firestore.collection(COL_UPDATES).doc(updateId).set({
      serialNumber: cardId,
      updatedAt: new Date().toISOString()
    });

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
    const now = new Date().toISOString();
    const updates = cardsSnap.docs.map(doc => {
      return doc.ref.set({
        latestMessage: message,
        updatedAt: now
      }, { merge: true });
    });

    await Promise.all(updates);

    // ⭐ Registrar actualizaciones para Apple Wallet
    console.log(`[PUSH ALL] 📲 Registrando actualizaciones Apple...`);
    const appleUpdates = cardsSnap.docs.map(doc => {
      const updateId = `update_${doc.id}_${Date.now()}`;
      return firestore.collection(COL_UPDATES).doc(updateId).set({
        serialNumber: doc.id,
        updatedAt: now
      });
    });
    await Promise.all(appleUpdates);

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
   ACTUALIZAR TARJETA
   ========================================================= */
app.patch("/api/cards/:cardId", adminAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { phone, name, email, birthday, notes } = req.body;

    if (!cardId) return res.status(400).json({ success: false, error: "Falta cardId" });

    // Construir objeto de actualización solo con campos proporcionados
    const updateData = {};
    if (phone !== undefined) updateData.phone = phone.replace(/\D/g, '');
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (birthday !== undefined) updateData.birthday = birthday;
    if (notes !== undefined) updateData.notes = notes;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: "No hay datos para actualizar" });
    }

    const updated = await CardsRepo.update(cardId, updateData);

    console.log(`[CARD] Tarjeta ${cardId} actualizada:`, updateData);
    res.json({ success: true, card: updated });
  } catch (e) {
    console.error("[PATCH CARD ERROR]", e);
    res.status(500).json({ success: false, error: e.message });
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

// Endpoint temporal para forzar actualización de pase
app.post("/api/admin/force-update-pass", adminAuth, async (req, res) => {
  try {
    const { cardId } = req.body || {};
    if (!cardId) return res.status(400).json({ error: "missing_cardId" });

    const card = await fsGetCard(cardId);
    if (!card) return res.status(404).json({ error: "card not found" });

    console.log(`[FORCE UPDATE] Actualizando pase para: ${card.name}`);
    console.log(`[FORCE UPDATE] Stamps: ${card.stamps}, Cycles: ${card.cycles || 0}`);

    // Actualizar Google Wallet
    try {
      const { updateLoyaltyObject } = await import("./lib/google.js");
      await updateLoyaltyObject(cardId, card.name, card.stamps || 0, card.max);
      console.log(`[GOOGLE WALLET] ✅ Pase actualizado`);
    } catch (googleError) {
      console.error(`[GOOGLE WALLET] ❌ Error:`, googleError.message);
    }

    // Actualizar Apple Wallet
    try {
      await appleWebService.notifyCardUpdate(cardId);
      console.log(`[APPLE WALLET] ✅ Pase actualizado`);
    } catch (err) {
      console.error("[APPLE WALLET] ❌ Error:", err);
    }

    res.json({
      ok: true,
      cardId,
      stamps: card.stamps,
      cycles: card.cycles || 0,
      message: 'Pase actualizado forzadamente'
    });
  } catch (e) {
    console.error('[FORCE UPDATE] Error:', e);
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

    // Incrementar ciclos y resetear sellos
    const newCycles = (card.cycles || 0) + 1;
    await fsUpdateCard(cardId, {
      stamps: 0,
      cycles: newCycles,
      lastVisit: new Date().toISOString()
    });

    await fsAddEvent(cardId, "REDEEM", { by: "admin", cycle: newCycles });

    console.log(`[REDEEM] Cliente ${card.name} completó ciclo ${newCycles}`);

    // Actualizar Google Wallet
    try {
      const { updateLoyaltyObject } = await import("./lib/google.js");
      await updateLoyaltyObject(cardId, card.name, 0, card.max);
      console.log(`[GOOGLE WALLET] ✅ Redeem admin actualizado para: ${cardId}`);
    } catch (googleError) {
      console.error(`[GOOGLE WALLET] ❌ Error actualizando redeem admin:`, googleError.message);
    }

    // Actualizar Apple Wallet
    try {
      await appleWebService.notifyCardUpdate(cardId);
      console.log(`[APPLE WALLET] ✅ Redeem admin actualizado para: ${cardId}`);
    } catch (err) {
      console.error("[APPLE WALLET] ❌ Error notificando:", err);
    }

    res.json({ ok: true, cardId, cycles: newCycles });
  } catch (e) {
    console.error('[REDEEM] Error:', e);
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
  console.log(`   📦 VERSION: 2026-01-08-TIMEZONE-FIX-V2`);
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