// lib/apple-webservice.js - Web Service completo para Apple Wallet con APNs
import db from './db.js';
import { buildApplePassBuffer } from './apple.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import fs from 'fs';

/* =========================================================
   CREAR TABLAS PARA APPLE WALLET
   ========================================================= */

// Tabla para registrar dispositivos Apple
db.exec(`
  CREATE TABLE IF NOT EXISTS apple_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    push_token TEXT NOT NULL,
    pass_type_id TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_id, pass_type_id, serial_number)
  )
`);

// Tabla para tracking de actualizaciones
db.exec(`
  CREATE TABLE IF NOT EXISTS apple_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial_number TEXT NOT NULL,
    stamps_old INTEGER,
    stamps_new INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('[APPLE WEB SERVICE] ✅ Tablas creadas/verificadas');

/* =========================================================
   PREPARED STATEMENTS
   ========================================================= */

const registerDeviceStmt = db.prepare(`
  INSERT OR REPLACE INTO apple_devices 
  (device_id, push_token, pass_type_id, serial_number, last_updated)
  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

const unregisterDeviceStmt = db.prepare(`
  DELETE FROM apple_devices 
  WHERE device_id = ? AND pass_type_id = ? AND serial_number = ?
`);

const getDevicesBySerialStmt = db.prepare(`
  SELECT * FROM apple_devices 
  WHERE serial_number = ?
`);

const getSerialsForDeviceStmt = db.prepare(`
  SELECT serial_number FROM apple_devices 
  WHERE device_id = ? AND pass_type_id = ?
`);

const getCardStmt = db.prepare(`
  SELECT * FROM cards WHERE id = ?
`);

const logUpdateStmt = db.prepare(`
  INSERT INTO apple_updates (serial_number, stamps_old, stamps_new)
  VALUES (?, ?, ?)
`);

const getLastUpdateStmt = db.prepare(`
  SELECT updated_at FROM apple_updates 
  WHERE serial_number = ?
  ORDER BY id DESC LIMIT 1
`);

/* =========================================================
   CONFIGURACIÓN APNs
   ========================================================= */

function getAPNsConfig() {
  const keyId = process.env.APPLE_KEY_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyPath = process.env.APPLE_APNS_KEY_PATH || process.env.APPLE_PASS_KEY;
  
  if (!keyId || !teamId || !keyPath) {
    throw new Error('Faltan credenciales de APNs: APPLE_KEY_ID, APPLE_TEAM_ID, APPLE_APNS_KEY_PATH');
  }
  
  if (!fs.existsSync(keyPath)) {
    throw new Error(`No se encuentra el archivo de clave APNs: ${keyPath}`);
  }
  
  return {
    keyId,
    teamId,
    key: fs.readFileSync(keyPath, 'utf8')
  };
}

/* =========================================================
   GENERAR JWT PARA APNs
   ========================================================= */

function generateAPNsToken() {
  const config = getAPNsConfig();
  
  const token = jwt.sign(
    {
      iss: config.teamId,
      iat: Math.floor(Date.now() / 1000)
    },
    config.key,
    {
      algorithm: 'ES256',
      header: {
        alg: 'ES256',
        kid: config.keyId
      }
    }
  );
  
  return token;
}

/* =========================================================
   ENVIAR NOTIFICACIÓN PUSH APNs
   ========================================================= */

async function sendAPNsPushNotification(pushToken, payload = {}) {
  try {
    const token = generateAPNsToken();
    const config = getAPNsConfig();
    
    // APNs endpoint (production)
    const apnsUrl = `https://api.push.apple.com/3/device/${pushToken}`;
    
    // Payload vacío para Wallet (solo despierta el pase)
    const apnsPayload = {};
    
    const response = await fetch(apnsUrl, {
      method: 'POST',
      headers: {
        'authorization': `bearer ${token}`,
        'apns-topic': process.env.APPLE_PASS_TYPE_ID,
        'apns-push-type': 'background',
        'apns-priority': '5',
        'content-type': 'application/json'
      },
      body: JSON.stringify(apnsPayload)
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[APNs] Error:', response.status, errorText);
      throw new Error(`APNs failed: ${response.status}`);
    }
    
    console.log('[APNs] ✅ Push enviado:', pushToken.substring(0, 10) + '...');
    return true;
    
  } catch (error) {
    console.error('[APNs] Error enviando push:', error);
    throw error;
  }
}

/* =========================================================
   NOTIFICAR A TODOS LOS DISPOSITIVOS DE UNA TARJETA
   ========================================================= */

export async function notifyCardUpdate(cardId) {
  try {
    const devices = getDevicesBySerialStmt.all(cardId);
    
    if (devices.length === 0) {
      console.log(`[APPLE] No hay dispositivos registrados para ${cardId}`);
      return { sent: 0, errors: 0 };
    }
    
    console.log(`[APPLE] Notificando a ${devices.length} dispositivo(s) para ${cardId}`);
    
    let sent = 0;
    let errors = 0;
    
    for (const device of devices) {
      try {
        await sendAPNsPushNotification(device.push_token);
        sent++;
      } catch (error) {
        console.error(`[APPLE] Error notificando dispositivo ${device.device_id}:`, error);
        errors++;
      }
      
      // Pequeña pausa entre notificaciones
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return { sent, errors, total: devices.length };
    
  } catch (error) {
    console.error('[APPLE] Error en notifyCardUpdate:', error);
    return { sent: 0, errors: 1, total: 0 };
  }
}

/* =========================================================
   MIDDLEWARE DE AUTENTICACIÓN
   ========================================================= */

export function appleAuthMiddleware(req, res, next) {
  // Apple envía un header de autenticación
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.APPLE_AUTH_TOKEN || 'your-secret-token-here';
  
  if (!authHeader || authHeader !== `ApplePass ${expectedToken}`) {
    console.warn('[APPLE AUTH] Token inválido');
    return res.status(401).send('Unauthorized');
  }
  
  next();
}

/* =========================================================
   ENDPOINTS DEL WEB SERVICE
   ========================================================= */

// 1. REGISTRAR DISPOSITIVO
// POST /api/apple/v1/devices/:deviceId/registrations/:passTypeId/:serial
export async function registerDeviceHandler(req, res) {
  try {
    const { deviceId, passTypeId, serial } = req.params;
    const { pushToken } = req.body;
    
    if (!pushToken) {
      return res.status(400).send('Missing pushToken');
    }
    
    console.log('[APPLE] 📱 Registrando dispositivo:', {
      deviceId: deviceId.substring(0, 10) + '...',
      serial,
      passTypeId
    });
    
    // Verificar que la tarjeta existe
    const card = getCardStmt.get(serial);
    if (!card) {
      console.warn(`[APPLE] Tarjeta no encontrada: ${serial}`);
      return res.status(404).send('Pass not found');
    }
    
    // Registrar dispositivo
    registerDeviceStmt.run(deviceId, pushToken, passTypeId, serial);
    
    console.log('[APPLE] ✅ Dispositivo registrado:', serial);
    res.status(201).send();
    
  } catch (error) {
    console.error('[APPLE] Error registrando dispositivo:', error);
    res.status(500).send('Internal error');
  }
}

// 2. OBTENER PASES ACTUALIZABLES
// GET /api/apple/v1/devices/:deviceId/registrations/:passTypeId
export async function getUpdatablePassesHandler(req, res) {
  try {
    const { deviceId, passTypeId } = req.params;
    const passesUpdatedSince = req.query.passesUpdatedSince;
    
    console.log('[APPLE] 🔍 Consultando pases actualizables:', {
      deviceId: deviceId.substring(0, 10) + '...',
      passTypeId,
      since: passesUpdatedSince
    });
    
    // Obtener todos los serials para este dispositivo
    const rows = getSerialsForDeviceStmt.all(deviceId, passTypeId);
    
    if (rows.length === 0) {
      return res.status(204).send();
    }
    
    // Filtrar por fecha si se proporciona
    let serialNumbers = rows.map(r => r.serial_number);
    
    if (passesUpdatedSince) {
      const sinceDate = new Date(parseInt(passesUpdatedSince) * 1000);
      serialNumbers = serialNumbers.filter(serial => {
        const lastUpdate = getLastUpdateStmt.get(serial);
        if (!lastUpdate) return true;
        return new Date(lastUpdate.updated_at) > sinceDate;
      });
    }
    
    if (serialNumbers.length === 0) {
      return res.status(204).send();
    }
    
    console.log(`[APPLE] 📋 ${serialNumbers.length} pase(s) actualizables`);
    
    // Calcular última actualización
    const lastModified = new Date().toISOString();
    
    res.json({
      serialNumbers,
      lastModified
    });
    
  } catch (error) {
    console.error('[APPLE] Error obteniendo pases actualizables:', error);
    res.status(500).send('Internal error');
  }
}

// 3. OBTENER PASE ACTUALIZADO
// GET /api/apple/v1/passes/:passTypeId/:serial
export async function getLatestPassHandler(req, res) {
  try {
    const { passTypeId, serial } = req.params;
    const modifiedSince = req.headers['if-modified-since'];
    
    console.log('[APPLE] 📥 Solicitando pase:', {
      passTypeId,
      serial,
      modifiedSince
    });
    
    // Obtener tarjeta
    const card = getCardStmt.get(serial);
    if (!card) {
      console.warn(`[APPLE] Pase no encontrado: ${serial}`);
      return res.status(404).send('Pass not found');
    }
    
    // Verificar si fue modificado
    if (modifiedSince) {
      const lastUpdate = getLastUpdateStmt.get(serial);
      if (lastUpdate) {
        const lastModDate = new Date(lastUpdate.updated_at);
        const sinceDate = new Date(modifiedSince);
        
        if (lastModDate <= sinceDate) {
          console.log('[APPLE] Pase no modificado');
          return res.status(304).send();
        }
      }
    }
    
    // Generar pase actualizado
    console.log('[APPLE] 🔨 Generando pase actualizado:', {
      stamps: card.stamps,
      max: card.max
    });
    
    const buffer = await buildApplePassBuffer({
      cardId: card.id,
      name: card.name,
      stamps: card.stamps,
      max: card.max
    });
    
    // Headers importantes para Apple
    const lastModified = new Date().toUTCString();
    
    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Last-Modified': lastModified,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    
    console.log('[APPLE] ✅ Pase enviado');
    res.send(buffer);
    
  } catch (error) {
    console.error('[APPLE] Error generando pase:', error);
    res.status(500).send('Internal error');
  }
}

// 4. DESREGISTRAR DISPOSITIVO
// DELETE /api/apple/v1/devices/:deviceId/registrations/:passTypeId/:serial
export async function unregisterDeviceHandler(req, res) {
  try {
    const { deviceId, passTypeId, serial } = req.params;
    
    console.log('[APPLE] 🗑️ Desregistrando dispositivo:', {
      deviceId: deviceId.substring(0, 10) + '...',
      serial
    });
    
    unregisterDeviceStmt.run(deviceId, passTypeId, serial);
    
    console.log('[APPLE] ✅ Dispositivo desregistrado');
    res.status(200).send();
    
  } catch (error) {
    console.error('[APPLE] Error desregistrando dispositivo:', error);
    res.status(500).send('Internal error');
  }
}

// 5. LOG (opcional pero útil para debugging)
// POST /api/apple/v1/log
export async function logHandler(req, res) {
  try {
    const logs = req.body?.logs || [];
    
    if (logs.length > 0) {
      console.log('[APPLE LOG]', JSON.stringify(logs, null, 2));
    }
    
    res.status(200).send();
    
  } catch (error) {
    console.error('[APPLE] Error en log:', error);
    res.status(500).send('Internal error');
  }
}

/* =========================================================
   HELPER: ACTUALIZAR PASE Y NOTIFICAR
   ========================================================= */

export async function updatePassAndNotify(cardId, oldStamps, newStamps) {
  try {
    console.log(`[APPLE] 🔔 Actualizando pase ${cardId}: ${oldStamps} → ${newStamps}`);
    
    // Log de actualización
    logUpdateStmt.run(cardId, oldStamps, newStamps);
    
    // Notificar a todos los dispositivos registrados
    const result = await notifyCardUpdate(cardId);
    
    console.log(`[APPLE] ✅ Notificación completada:`, result);
    return result;
    
  } catch (error) {
    console.error('[APPLE] Error en updatePassAndNotify:', error);
    return { sent: 0, errors: 1 };
  }
}

/* =========================================================
   EXPORTS
   ========================================================= */

export default {
  registerDeviceHandler,
  getUpdatablePassesHandler,
  getLatestPassHandler,
  unregisterDeviceHandler,
  logHandler,
  appleAuthMiddleware,
  notifyCardUpdate,
  updatePassAndNotify
};
