// lib/apple-webservice.js - Web Service para Apple Wallet con APNs + FIRESTORE - CORREGIDO
import { firestore } from './firebase.js';
import { buildApplePassBuffer } from './apple.js';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import * as http2 from 'node:http2'; // ⭐ MODIFICACIÓN CLAVE: Importamos HTTP/2 nativo

/* =========================================================
   COLECCIONES FIRESTORE
   ========================================================= */

const COL_CARDS = "cards";
const COL_APPLE_DEVICES = "apple_devices";
const COL_APPLE_UPDATES = "apple_updates";

console.log('[APPLE WEB SERVICE] ✅ Configurado para Firestore');

// ⭐ AUTH TOKEN
const APPLE_AUTH_TOKEN = process.env.APPLE_AUTH_TOKEN;

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
    console.error('[APPLE] Error desregistrando (posiblemente ya borrado):', error);
    // No lanzamos error para que el handler pueda responder 200 OK.
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
  // Usamos APPLE_APNS_KEY_BASE64 en lugar de APPLE_APNS_KEY_PATH para Render
  const keyBase64 = process.env.APPLE_APNS_KEY_BASE64; 
  
  if (!keyId || !teamId || !keyBase64) {
    throw new Error('Faltan credenciales de APNs: APPLE_KEY_ID, APPLE_TEAM_ID, APPLE_APNS_KEY_BASE64');
  }
  
  // Decodificar Base64 a string de clave P8
  const key = Buffer.from(keyBase64, 'base64').toString('utf8');
  
  return {
    keyId,
    teamId,
    key: key
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
   ENVIAR NOTIFICACIÓN PUSH APNs (CORREGIDO CON HTTP/2)
   ========================================================= */

async function sendAPNsPushNotification(pushToken) {
  const apnsHost = 'api.push.apple.com'; // Production host
  const apnsPort = 443;
  
  try {
    const token = generateAPNsToken();
    const apnsTopic = process.env.APPLE_PASS_TYPE_ID;
    
    // Payload vacío para Wallet (solo despierta el pase)
    const apnsPayload = {};
    const jsonPayload = JSON.stringify(apnsPayload);
    
    // Configuración de la conexión HTTP/2
    const client = http2.connect(`https://${apnsHost}:${apnsPort}`);
    
    return new Promise((resolve, reject) => {
      client.on('error', (err) => {
        client.close();
        console.error('[APNs/HTTP2] Client Error:', err);
        reject(new Error(`APNs client connection failed: ${err.message}`));
      });
      
      const req = client.request({
        // Standard headers for APNs
        [http2.constants.HTTP2_HEADER_METHOD]: http2.constants.HTTP2_METHOD_POST,
        [http2.constants.HTTP2_HEADER_PATH]: `/3/device/${pushToken}`,
        
        // APNs Headers
        'authorization': `bearer ${token}`,
        'apns-topic': apnsTopic,
        'apns-push-type': 'alert', // 'alert' o 'background' - 'alert' a menudo es más estable para trigger
        'apns-priority': '10', // Alta prioridad
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(jsonPayload)
      });
      
      req.on('response', (headers) => {
        const statusCode = headers[http2.constants.HTTP2_HEADER_STATUS];
        
        // Colectar cuerpo de la respuesta para reportar errores
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        
        req.on('end', () => {
          client.close();
          
          if (statusCode === 200) {
            console.log('[APNs] ✅ Push enviado:', pushToken.substring(0, 10) + '...');
            resolve(true);
          } else {
            // Intentar parsear el cuerpo del error APNs (generalmente JSON)
            let errorBody = data;
            try {
              errorBody = JSON.parse(data);
            } catch (e) {
              errorBody = { reason: 'Unknown', body: data };
            }

            console.error(`[APNs] Error ${statusCode}:`, errorBody);
            reject(new Error(`APNs failed with status ${statusCode}: ${errorBody.reason || 'Unknown error'}`));
          }
        });
      });

      req.on('error', (err) => {
        client.close();
        console.error('[APNs/HTTP2] Request Error:', err);
        reject(new Error(`APNs request failed: ${err.message}`));
      });
      
      req.end(jsonPayload); // Enviar el cuerpo de la solicitud
    });
    
  } catch (error) {
    console.error('[APNs] Error general enviando push:', error);
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
   ⭐ HELPER DE AUTH INLINE (CORREGIDO PARA GET)
   ========================================================= */

function checkAuth(req, res) {
  const authHeader = req.headers.authorization;
  
  console.log('[APPLE AUTH] 🔐 Verificando autenticación...');
  console.log('[APPLE AUTH] Header:', authHeader ? authHeader.substring(0, 20) + '...' : 'undefined...');
  
  if (!authHeader || !authHeader.startsWith('ApplePass ')) {
    console.warn('[APPLE AUTH] ❌ Missing or invalid auth header');
    res.status(401).send('Unauthorized');
    return false;
  }
  
  const token = authHeader.substring('ApplePass '.length).trim();
  
  if (!APPLE_AUTH_TOKEN) {
    console.error('[APPLE AUTH] ❌ APPLE_AUTH_TOKEN no configurado');
    res.status(500).send('Server configuration error');
    return false;
  }
  
  if (token !== APPLE_AUTH_TOKEN) {
    console.warn('[APPLE AUTH] ❌ Invalid token');
    res.status(401).send('Unauthorized');
    return false;
  }
  
  console.log('[APPLE AUTH] ✅ Auth OK');
  return true;
}

/* =========================================================
   ENDPOINTS DEL WEB SERVICE - CORREGIDOS
   ========================================================= */

// 1. REGISTRAR DISPOSITIVO
export async function registerDeviceHandler(req, res) {
  console.log('[APPLE HANDLER] 🎯 registerDeviceHandler EJECUTÁNDOSE');
  console.log('[APPLE HANDLER] URL:', req.url);
  console.log('[APPLE HANDLER] Method:', req.method);
  console.log('[APPLE HANDLER] Params:', req.params);
  console.log('[APPLE HANDLER] Body:', req.body);
  
  // ⭐ AUTH INLINE
  if (!checkAuth(req, res)) return;
  
  try {
    const { deviceId, passTypeId, serial } = req.params;
    const { pushToken } = req.body;
    
    if (!pushToken) {
      console.warn('[APPLE] ⚠️ Missing pushToken');
      return res.status(400).send('Missing pushToken');
    }
    
    console.log('[APPLE] 📱 Registrando dispositivo:', {
      deviceId: deviceId?.substring(0, 10) + '...',
      serial,
      passTypeId
    });
    
    // Verificar que la tarjeta existe en Firestore
    const card = await fsGetCard(serial);
    if (!card) {
      console.warn(`[APPLE] ⚠️ Tarjeta no encontrada en Firestore: ${serial}`);
      return res.status(404).send('Pass not found');
    }
    
    console.log(`[APPLE] ✅ Tarjeta encontrada: ${card.name} (${card.stamps}/${card.max})`);
    
    // Registrar dispositivo
    await fsRegisterDevice(deviceId, pushToken, passTypeId, serial);
    
    console.log('[APPLE] ✅ Dispositivo registrado exitosamente:', serial);
    res.status(201).send();
    
  } catch (error) {
    console.error('[APPLE] ❌ Error registrando dispositivo:', error);
    console.error('[APPLE] Stack:', error.stack);
    res.status(500).send('Internal error');
  }
}

// 2. OBTENER PASES ACTUALIZABLES
export async function getUpdatablePassesHandler(req, res) {
  console.log('[APPLE HANDLER] 📋 getUpdatablePassesHandler EJECUTÁNDOSE');
  console.log('[APPLE HANDLER] Params:', req.params);
  console.log('[APPLE HANDLER] Query:', req.query);
  
  // ⭐ AUTH INLINE
  // if (!checkAuth(req, res)) return;
  
  try {
    const { deviceId, passTypeId } = req.params;
    const passesUpdatedSince = req.query.passesUpdatedSince;
    
    console.log('[APPLE] 🔍 Consultando pases actualizables:', {
      deviceId: deviceId?.substring(0, 10) + '...',
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
export async function getLatestPassHandler(req, res) {
  console.log('[APPLE HANDLER] 📥 getLatestPassHandler EJECUTÁNDOSE');
  console.log('[APPLE HANDLER] Params:', req.params);
  
  // ⭐ AUTH INLINE
  if (!checkAuth(req, res)) return;
  
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
export async function unregisterDeviceHandler(req, res) {
  console.log('[APPLE HANDLER] 🗑️ unregisterDeviceHandler EJECUTÁNDOSE');
  console.log('[APPLE HANDLER] Params:', req.params);
  
  // ⭐ FIX ZOMBIE: Reemplazamos checkAuth con lógica de advertencia
  const authHeader = req.headers.authorization;
  const expectedToken = APPLE_AUTH_TOKEN;

  if (authHeader && authHeader.startsWith('ApplePass ')) {
    const receivedToken = authHeader.substring('ApplePass '.length).trim();
    if (receivedToken !== expectedToken) {
      console.warn('[APPLE AUTH] ⚠️ Token inválido. Permitiendo desregistro de "Pase Zombie" (para evitar 401 loop).');
    } else {
      console.log('[APPLE AUTH] ✅ Auth OK (Desregistro)');
    }
  } else {
      console.warn('[APPLE AUTH] ⚠️ Missing or invalid token. Permitiendo desregistro de "Pase Zombie".');
  }
  
  try {
    const { deviceId, passTypeId, serial } = req.params;
    
    console.log('[APPLE] 🗑️ Desregistrando dispositivo:', {
      deviceId: deviceId?.substring(0, 10) + '...',
      serial
    });
    
    await fsUnregisterDevice(deviceId, passTypeId, serial);
    
    console.log('[APPLE] ✅ Dispositivo desregistrado');
    // IMPORTANTE: Siempre responder 200 OK para que el iPhone deje de reintentar.
    res.status(200).send();
    
  } catch (error) {
    console.error('[APPLE] ❌ Error desregistrando dispositivo:', error);
    // Incluso si falla la DB, respondemos 200 OK.
    res.status(200).send(); 
  }
}

// 5. LOG (SIN AUTH - Apple no envía auth en /log)
export async function logHandler(req, res) {
  console.log('[APPLE HANDLER] 📝 logHandler EJECUTÁNDOSE');
  
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
   MIDDLEWARE DE AUTENTICACIÓN (PARA ENDPOINTS /api/apple/v1)
   ========================================================= */

export function appleAuthMiddleware(req, res, next) {
  console.log('[APPLE AUTH] 🔐 Middleware ejecutándose...');
  
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('ApplePass ')) {
    console.warn('[APPLE AUTH] ❌ Missing or invalid auth header');
    return res.status(401).send('Unauthorized');
  }
  
  const receivedToken = authHeader.substring('ApplePass '.length).trim();
  
  if (!APPLE_AUTH_TOKEN) {
    console.error('[APPLE AUTH] ❌ APPLE_AUTH_TOKEN no configurado');
    return res.status(500).send('Server configuration error');
  }
  
  if (receivedToken !== APPLE_AUTH_TOKEN) {
    console.warn('[APPLE AUTH] ❌ Token no coincide');
    return res.status(401).send('Unauthorized');
  }
  
  console.log('[APPLE AUTH] ✅ Autenticación exitosa');
  next();
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