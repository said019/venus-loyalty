// lib/api/push.js - Notificaciones push para Google Wallet + Apple Wallet (APNs)
import { updateLoyaltyObject, getWalletAccessToken } from '../google.js';
import { notifyCardUpdate } from '../apple-webservice.js';
import db from '../db.js';

/* =========================================================
   CREAR TABLA DE NOTIFICACIONES
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

console.log('[PUSH] ✅ Tabla notifications verificada/creada');

/* =========================================================
   PREPARED STATEMENTS
   ========================================================= */

const getAllActiveCards = db.prepare(`
  SELECT id, name, stamps, max, status
  FROM cards
  WHERE status = 'active'
`);

const saveNotification = db.prepare(`
  INSERT INTO notifications (title, message, type, cards_sent, apple_sent, google_sent, errors, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

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
    
    if (!issuerId) {
      throw new Error('GOOGLE_ISSUER_ID no configurado');
    }
    
    const safeCardId = cardId.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectId = `${issuerId}.${safeCardId}`;

    console.log(`[GOOGLE PUSH] Enviando a: ${objectId}`);

    // Actualizar objeto primero para asegurar que existe
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
    if (card) {
      try {
        await updateLoyaltyObject(cardId, card.name, card.stamps, card.max);
      } catch (updateError) {
        console.warn(`[GOOGLE PUSH] ⚠️ No se pudo actualizar objeto:`, updateError.message);
      }
    }

    // Agregar mensaje
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
      
      if (response.status === 404) {
        console.warn(`[GOOGLE PUSH] ⚠️ Objeto no existe: ${objectId}`);
        return false;
      }
      
      throw new Error(`Google API ${response.status}: ${errorData.error?.message || response.statusText}`);
    }

    console.log(`[GOOGLE PUSH] ✅ Mensaje enviado: ${objectId}`);
    return true;

  } catch (error) {
    console.error(`[GOOGLE PUSH] ❌ Error en ${cardId}:`, error.message);
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

    console.log('[PUSH MASIVO] 📢 Iniciando:', { title, type });

    const cards = getAllActiveCards.all();

    if (cards.length === 0) {
      console.log('[PUSH MASIVO] ⚠️ No hay tarjetas activas');
      return res.json({
        success: true,
        passCount: 0,
        googleSent: 0,
        appleSent: 0,
        errors: 0,
        message: 'No hay tarjetas activas'
      });
    }

    console.log(`[PUSH MASIVO] 📋 Procesando ${cards.length} tarjetas...`);

    let googleSent = 0;
    let googleAttempted = 0;
    let appleSent = 0;
    let appleAttempted = 0;
    let errors = 0;

    for (const card of cards) {
      try {
        // 1. Google Wallet
        googleAttempted++;
        try {
          const googleSuccess = await addMessageToGoogleObject(card.id, title, message);
          if (googleSuccess) googleSent++;
        } catch (googleError) {
          console.error(`[PUSH MASIVO] ❌ Google falló para ${card.id}:`, googleError.message);
          errors++;
        }

        // 2. Apple Wallet (APNs)
        appleAttempted++;
        try {
          const appleResult = await notifyCardUpdate(card.id);
          if (appleResult.sent > 0) {
            appleSent += appleResult.sent;
          }
        } catch (appleError) {
          console.error(`[PUSH MASIVO] ❌ Apple falló para ${card.id}:`, appleError.message);
          // No incrementar errors porque puede no tener dispositivos registrados
        }

        // Pausa para no saturar APIs
        await new Promise(resolve => setTimeout(resolve, 150));

      } catch (error) {
        console.error(`[PUSH MASIVO] ❌ Error en ${card.id}:`, error.message);
        errors++;
      }
    }

    // Guardar en historial
    saveNotification.run(
      title,
      message,
      type || 'general',
      cards.length,
      appleSent,
      googleSent,
      errors
    );

    const summary = {
      total: cards.length,
      googleSent,
      appleSent,
      errors,
      successRate: googleAttempted > 0 
        ? `${Math.round((googleSent / googleAttempted) * 100)}%` 
        : '0%'
    };

    console.log('[PUSH MASIVO] ✅ Completado:', summary);

    res.json({
      success: true,
      passCount: cards.length,
      googleSent,
      appleSent,
      errors,
      successRate: summary.successRate,
      message: errors === 0 
        ? 'Notificación enviada exitosamente' 
        : `Notificación enviada con ${errors} error(es)`,
      note: appleSent === 0 && googleSent > 0 
        ? 'Apple: usuarios deben agregar pase a wallet primero' 
        : undefined
    });

  } catch (error) {
    console.error('[PUSH MASIVO] ❌ Error crítico:', error);
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

    console.log('[PUSH TEST] 🧪 Iniciando prueba...');

    // Buscar tarjeta
    let card;
    if (testCardId) {
      card = db.prepare('SELECT * FROM cards WHERE id = ?').get(testCardId);
      if (!card) {
        return res.status(404).json({
          success: false,
          error: `Tarjeta ${testCardId} no encontrada`
        });
      }
    } else {
      card = db.prepare('SELECT * FROM cards WHERE status = ? LIMIT 1').get('active');
      if (!card) {
        return res.status(404).json({
          success: false,
          error: 'No hay tarjetas activas'
        });
      }
    }

    console.log(`[PUSH TEST] 🎯 Enviando a: ${card.id} (${card.name})`);

    const results = {
      cardId: card.id,
      cardName: card.name,
      google: { sent: false, error: null },
      apple: { sent: 0, error: null }
    };

    // Google Wallet
    try {
      const googleSuccess = await addMessageToGoogleObject(card.id, title, message);
      results.google.sent = googleSuccess;
      if (googleSuccess) {
        console.log('[PUSH TEST] ✅ Google Wallet: enviado');
      } else {
        console.log('[PUSH TEST] ⚠️ Google Wallet: objeto no existe');
        results.google.error = 'Objeto no existe en Google Wallet';
      }
    } catch (error) {
      console.error('[PUSH TEST] ❌ Google Wallet:', error.message);
      results.google.error = error.message;
    }

    // Apple Wallet
    try {
      const appleResult = await notifyCardUpdate(card.id);
      results.apple.sent = appleResult.sent;
      
      if (appleResult.sent > 0) {
        console.log(`[PUSH TEST] ✅ Apple Wallet: ${appleResult.sent} dispositivo(s)`);
      } else if (appleResult.total === 0) {
        console.log('[PUSH TEST] ℹ️ Apple Wallet: sin dispositivos registrados');
        results.apple.error = 'Sin dispositivos registrados';
      }
    } catch (error) {
      console.error('[PUSH TEST] ❌ Apple Wallet:', error.message);
      results.apple.error = error.message;
    }

    const success = results.google.sent || results.apple.sent > 0;

    res.json({
      success,
      cardId: card.id,
      cardName: card.name,
      results,
      message: success 
        ? 'Notificación de prueba enviada' 
        : 'No se pudo enviar a ninguna plataforma',
      note: !success 
        ? 'Usuarios deben agregar la tarjeta a sus wallets primero' 
        : undefined
    });

  } catch (error) {
    console.error('[PUSH TEST] ❌ Error:', error);
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
    console.error('[NOTIFICATIONS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
