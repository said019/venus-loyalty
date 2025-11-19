// lib/apple-webservice.js - Web Service para Apple Wallet con APNs + FIRESTORE
import { firestore } from './firebase.js';
import { buildApplePassBuffer } from './apple.js';
import jwt from 'jsonwebtoken';
import fs from 'fs';

/* =========================================================
   COLECCIONES FIRESTORE
   ========================================================= */

const COL_CARDS = "cards";
const COL_APPLE_DEVICES = "apple_devices";
const COL_APPLE_UPDATES = "apple_updates";

console.log('[APPLE WEB SERVICE] ✅ Configurado para Firestore');

/* =========================================================
   HELPERS FIRESTORE
   ========================================================= */

async function fsGetCard(cardId) {
  try {
    const snap = await firestore.collection(COL_CARDS).doc(cardId).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.error(`[APPLE] Error obteniendo tarjeta ${cardId}:`, error);
    return null;
  }
}

async function fsRegisterDevice(deviceId, pushToken, passTypeId, serialNumber) {
  try {
    const deviceKey = `${deviceId}_${passTypeId}_${serialNumber}`;
    await firestore.collection(COL_APPLE_DEVICES).doc(deviceKey).set({
      device_id: deviceId,
      push_token: pushToken,
      pass_type_id: passTypeId,
      serial_number: serialNumber,
      registered_at: new Date().toISOString(),
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    console.error('[APPLE] Error registrando dispositivo:', error);
    throw error;
  }
}

async function fsUnregisterDevice(deviceId, passTypeId, serialNumber) {
  try {
    const deviceKey = `${deviceId}_${passTypeId}_${serialNumber}`;
    await firestore.collection(COL_APPLE_DEVICES).doc(deviceKey).delete();
  } catch (error) {
    console.error('[APPLE] Error desregistrando:', error);
    throw error;
  }
}

async function fsGetDevicesBySerial(serialNumber) {
  try {
    const snap = await firestore
      .collection(COL_APPLE_DEVICES)
      .where('serial_number', '==', serialNumber)
      .get();
    
    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('[APPLE] Error obteniendo dispositivos:', error);
    return [];
  }
}

async function fsGetSerialsForDevice(deviceId, passTypeId) {
  try {
    const snap = await firestore
      .collection(COL_APPLE_DEVICES)
      .where('device_id', '==', deviceId)
      .where('pass_type_id', '==', passTypeId)
      .get();
    
    return snap.docs.map(doc => ({
      serial_number: doc.data().serial_number,
      last_updated: doc.data().last_updated
    }));
  } catch (error) {
    console.error('[APPLE] Error obteniendo serials:', error);
    return [];
  }
}

async function fsLogUpdate(serialNumber, stampsOld, stampsNew) {
  try {
    await firestore.collection(COL_APPLE_UPDATES).add({
      serial_number: serialNumber,
      stamps_old: stampsOld,
      stamps_new: stampsNew,
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('[APPLE] Error guardando actualización:', error);
  }
}

async function fsGetLastUpdate(serialNumber) {
  try {
    const snap = await firestore
      .collection(COL_APPLE_UPDATES)
      .where('serial_number', '==', serialNumber)
      .orderBy('updated_at', 'desc')
      .limit(1)
      .get();
    
    if (snap.empty) return null;
    return snap.docs[0].data();
  } catch (error) {
    console.error('[APPLE] Error obteniendo última actualización:', error);
    return null;
  }
}

/* =========================================================
   CONFIGURACIÓN APNs
   ========================================================= */

function getAPNsConfig() {
  const keyId = process.env.APPLE_KEY_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyPath = process.env.APPLE_APNS_KEY_PATH;
  
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

async function sendAPNsPushNotification(pushToken) {
  try {
    const token = generateAPNsToken();
    
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
    const devices = await fsGetDevicesBySerial(cardId);
    
    if (devices.length === 0) {
      console.log(`[APPLE] No hay dispositivos registrados para ${cardId}`);
      return { sent: 0, errors: 0, total: 0 };
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
   MIDDLEWARE DE AUTENTICACIÓN - CORREGIDO
   ========================================================= */

export function appleAuthMiddleware(req, res, next) {
  console.log('[APPLE AUTH] 🔐 Middleware ejecutándose...');
  
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.APPLE_AUTH_TOKEN;
  
  console.log('[APPLE AUTH] Header completo:', authHeader);
  console.log('[APPLE AUTH] Token esperado:', expectedToken?.substring(0, 10) + '...');
  
  // Verificar que el header existe y tiene el formato correcto
  if (!authHeader) {
    console.warn('[APPLE AUTH] ❌ Header Authorization faltante');
    return res.status(401).send('Unauthorized');
  }
  
  if (!authHeader.startsWith('ApplePass ')) {
    console.warn('[APPLE AUTH] ❌ Formato incorrecto. Debe empezar con "ApplePass "');
    console.warn('[APPLE AUTH] Header recibido:', authHeader);
    return res.status(401).send('Unauthorized');
  }
  
  // Extraer el token (remover "ApplePass ")
  const receivedToken = authHeader.substring(10).trim();
  
  console.log('[APPLE AUTH] Token recibido:', receivedToken.substring(0, 10) + '...');
  console.log('[APPLE AUTH] Token esperado:', expectedToken?.substring(0, 10) + '...');
  
  // Verificar que el token esperado existe
  if (!expectedToken) {
    console.error('[APPLE AUTH] ❌ APPLE_AUTH_TOKEN no está configurado en las variables de entorno');
    return res.status(500).send('Server configuration error');
  }
  
  // Comparar tokens (case-sensitive)
  if (receivedToken !== expectedToken) {
    console.warn('[APPLE AUTH] ❌ Token no coincide');
    console.warn('[APPLE AUTH] Comparación:');
    console.warn('[APPLE AUTH]   Recibido:', receivedToken);
    console.warn('[APPLE AUTH]   Esperado:', expectedToken);
    console.warn('[APPLE AUTH]   Coinciden?:', receivedToken === expectedToken);
    return res.status(401).send('Unauthorized');
  }
  
  console.log('[APPLE AUTH] ✅ Autenticación exitosa - Pasando al handler');
  next();
}

/* =========================================================
   ENDPOINTS DEL WEB SERVICE
   ========================================================= */

// 1. REGISTRAR DISPOSITIVO
// POST /api/apple/v1/devices/:deviceId/registrations/:passTypeId/:serial
export async function registerDeviceHandler(req, res) {
  console.log('[APPLE HANDLER] 🎯 registerDeviceHandler EJECUTÁNDOSE');
  console.log('[APPLE HANDLER] Params:', req.params);
  console.log('[APPLE HANDLER] Body:', req.body);
  
  try {
    const { deviceId, passTypeId, serial } = req.params;
    const { pushToken } = req.body;
    
    if (!pushToken) {
      console.warn('[APPLE] ⚠️ Missing pushToken');
      return res.status(400).send('Missing pushToken');
    }
    
    console.log('[APPLE] 📱 Registrando dispositivo:', {
      deviceId: deviceId.substring(0, 10) + '...',
      serial,
      passTypeId
    });
    
    // Verificar que la tarjeta existe en Firestore
    const card = await fsGetCard(serial);
    if (!card) {
      console.warn(`[APPLE] ⚠️ Tarjeta no encontrada en Firestore: ${serial}`);
      return res.status(404).send('Pass not found');
    }
    
    console.log(`[APPLE] ✅ Tarjeta encontrada: ${card.name}`);
    
    // Registrar dispositivo
    await fsRegisterDevice(deviceId, pushToken, passTypeId, serial);
    
    console.log('[APPLE] ✅ Dispositivo registrado exitosamente:', serial);
    res.status(201).send();
    
  } catch (error) {
    console.error('[APPLE] ❌ Error registrando dispositivo:', error);
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
    const rows = await fsGetSerialsForDevice(deviceId, passTypeId);
    
    if (rows.length === 0) {
      console.log('[APPLE] 📭 No hay pases para este dispositivo');
      return res.status(204).send();
    }
    
    // Filtrar por fecha si se proporciona
    let serialNumbers = rows.map(r => r.serial_number);
    
    if (passesUpdatedSince) {
      const sinceDate = new Date(parseInt(passesUpdatedSince) * 1000);
      const filtered = [];
      
      for (const serial of serialNumbers) {
        const lastUpdate = await fsGetLastUpdate(serial);
        if (!lastUpdate || new Date(lastUpdate.updated_at) > sinceDate) {
          filtered.push(serial);
        }
      }
      
      serialNumbers = filtered;
    }
    
    if (serialNumbers.length === 0) {
      console.log('[APPLE] ✨ Todos los pases están actualizados');
      return res.status(204).send();
    }
    
    console.log(`[APPLE] 📋 ${serialNumbers.length} pase(s) actualizables`);
    
    const lastModified = new Date().toISOString();
    
    res.json({
      serialNumbers,
      lastModified
    });
    
  } catch (error) {
    console.error('[APPLE] ❌ Error obteniendo pases actualizables:', error);
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
    
    // Obtener tarjeta desde Firestore
    const card = await fsGetCard(serial);
    if (!card) {
      console.warn(`[APPLE] ⚠️ Pase no encontrado: ${serial}`);
      return res.status(404).send('Pass not found');
    }
    
    // Verificar si fue modificado
    if (modifiedSince) {
      const lastUpdate = await fsGetLastUpdate(serial);
      if (lastUpdate) {
        const lastModDate = new Date(lastUpdate.updated_at);
        const sinceDate = new Date(modifiedSince);
        
        if (lastModDate <= sinceDate) {
          console.log('[APPLE] ⏭️ Pase no modificado (304)');
          return res.status(304).send();
        }
      }
    }
    
    // Generar pase actualizado
    console.log('[APPLE] 🔨 Generando pase actualizado:', {
      name: card.name,
      stamps: card.stamps,
      max: card.max
    });
    
    const buffer = await buildApplePassBuffer({
      cardId: card.id,
      name: card.name,
      stamps: card.stamps || 0,
      max: card.max || 8
    });
    
    const lastModified = new Date().toUTCString();
    
    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Last-Modified': lastModified,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    
    console.log('[APPLE] ✅ Pase enviado');
    res.send(buffer);
    
  } catch (error) {
    console.error('[APPLE] ❌ Error generando pase:', error);
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
    
    await fsUnregisterDevice(deviceId, passTypeId, serial);
    
    console.log('[APPLE] ✅ Dispositivo desregistrado');
    res.status(200).send();
    
  } catch (error) {
    console.error('[APPLE] ❌ Error desregistrando dispositivo:', error);
    res.status(500).send('Internal error');
  }
}

// 5. LOG
// POST /api/apple/v1/log
export async function logHandler(req, res) {
  try {
    const logs = req.body?.logs || [];
    
    if (logs.length > 0) {
      console.log('[APPLE LOG] 📝', JSON.stringify(logs, null, 2));
    }
    
    res.status(200).send();
    
  } catch (error) {
    console.error('[APPLE] ❌ Error en log:', error);
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
    await fsLogUpdate(cardId, oldStamps, newStamps);
    
    // Notificar a todos los dispositivos registrados
    const result = await notifyCardUpdate(cardId);
    
    console.log(`[APPLE] ✅ Notificación completada:`, result);
    return result;
    
  } catch (error) {
    console.error('[APPLE] ❌ Error en updatePassAndNotify:', error);
    return { sent: 0, errors: 1, total: 0 };
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