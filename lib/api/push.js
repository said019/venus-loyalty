// lib/api/push.js - Endpoints para notificaciones push a Wallets
import { updateLoyaltyObject, getWalletAccessToken } from '../google.js';
import db from '../db.js';

/* =========================================================
   CREAR TABLA DE NOTIFICACIONES PRIMERO
   ========================================================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    cards_sent INTEGER DEFAULT 0,
    apple_sent INTEGER DEFAULT 0,
    google_sent INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('[PUSH] Tabla notifications verificada/creada');

/* =========================================================
   PREPARED STATEMENTS (DESPUÉS de crear la tabla)
   ========================================================= */

// Obtener todas las tarjetas activas
const getAllActiveCards = db.prepare(`
  SELECT id, name, stamps, max, google_object_id, apple_serial, status
  FROM cards
  WHERE status = 'active'
`);

// Guardar notificación en historial
const saveNotification = db.prepare(`
  INSERT INTO notifications (title, message, type, cards_sent, apple_sent, google_sent, errors, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

// Obtener historial de notificaciones
const getNotificationsHistory = db.prepare(`
  SELECT id, title, message, type, cards_sent, apple_sent, google_sent, errors, created_at
  FROM notifications
  ORDER BY id DESC
  LIMIT 50
`);

/* =========================================================
   HELPER: AGREGAR MENSAJE A GOOGLE WALLET
   ========================================================= */

async function addMessageToGoogleObject(cardId, title, message) {
  try {
    const token = await getWalletAccessToken();
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const safeCardId = cardId.replace(/[^a-zA-Z0-9._+-]/g, '_');
    const objectId = `${issuerId}.${safeCardId}`;

    // Primero actualizar el objeto para asegurar que existe
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
    if (card) {
      await updateLoyaltyObject(cardId, card.name, card.stamps, card.max);
    }

    // Luego agregar el mensaje
    const messagePayload = {
      message: {
        header: title,
        body: message,
        displayInterval: {
          start: { date: new Date().toISOString() },
          end: { 
            date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() 
          }
        }
      }
    };

    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}/addMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messagePayload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[GOOGLE PUSH] Error:', errorData);
      throw new Error(`Google Wallet message failed: ${response.status}`);
    }

    console.log('[GOOGLE PUSH] ✓ Mensaje agregado a:', objectId);
    return true;

  } catch (error) {
    console.error('[GOOGLE PUSH] Error:', error);
    throw error;
  }
}

/* =========================================================
   ENDPOINT: ENVIAR NOTIFICACIÓN PUSH MASIVA
   POST /api/admin/push-notification
   ========================================================= */

export async function sendMassPushNotification(req, res) {
  try {
    const { title, message, type } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Título y mensaje son requeridos'
      });
    }

    console.log('[PUSH] Enviando notificación masiva:', { title, type });

    // 1. Obtener todas las tarjetas activas
    const cards = getAllActiveCards.all();

    if (cards.length === 0) {
      return res.json({
        success: true,
        passCount: 0,
        googleSent: 0,
        appleSent: 0,
        errors: 0,
        message: 'No hay tarjetas activas para notificar'
      });
    }

    let googleSent = 0;
    let appleSent = 0;
    let errors = 0;

    // 2. Enviar a cada tarjeta (Google Wallet)
    for (const card of cards) {
      try {
        // Google Wallet: Agregar mensaje al objeto
        await addMessageToGoogleObject(card.id, title, message);
        googleSent++;

      } catch (error) {
        console.error(`[PUSH] Error enviando a ${card.id}:`, error);
        errors++;
      }

      // Pequeña pausa para no saturar la API de Google
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 3. Guardar en historial
    saveNotification.run(
      title,
      message,
      type,
      cards.length,
      appleSent,
      googleSent,
      errors
    );

    console.log('[PUSH] ✓ Notificación masiva completada:', {
      total: cards.length,
      googleSent,
      appleSent,
      errors
    });

    res.json({
      success: true,
      passCount: cards.length,
      googleSent,
      appleSent,
      errors,
      message: 'Notificación enviada exitosamente'
    });

  } catch (error) {
    console.error('[PUSH] Error en notificación masiva:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/* =========================================================
   ENDPOINT: ENVIAR NOTIFICACIÓN DE PRUEBA
   POST /api/admin/push-test
   ========================================================= */

export async function sendTestPushNotification(req, res) {
  try {
    const { title, message, type, testCardId } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Título y mensaje son requeridos'
      });
    }

    // Usar tarjeta específica o la primera disponible
    let card;
    if (testCardId) {
      card = db.prepare('SELECT * FROM cards WHERE id = ?').get(testCardId);
    } else {
      card = db.prepare('SELECT * FROM cards WHERE status = ? LIMIT 1').get('active');
    }

    if (!card) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró tarjeta de prueba. Crea al menos una tarjeta primero.'
      });
    }

    console.log('[PUSH TEST] Enviando a tarjeta:', card.id);

    // Enviar a Google Wallet
    await addMessageToGoogleObject(card.id, title, message);

    res.json({
      success: true,
      cardId: card.id,
      cardName: card.name,
      message: 'Notificación de prueba enviada exitosamente'
    });

  } catch (error) {
    console.error('[PUSH TEST] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/* =========================================================
   ENDPOINT: HISTORIAL DE NOTIFICACIONES
   GET /api/admin/notifications
   ========================================================= */

export async function getNotifications(req, res) {
  try {
    const notifications = getNotificationsHistory.all();

    res.json({
      success: true,
      notifications: notifications.map(n => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        cardsSent: n.cards_sent,
        appleSent: n.apple_sent,
        googleSent: n.google_sent,
        errors: n.errors,
        createdAt: n.created_at
      }))
    });

  } catch (error) {
    console.error('[NOTIFICATIONS] Error obteniendo historial:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}