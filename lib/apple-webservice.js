// lib/apple-webservice.js - Web Service para Apple Wallet con APNs + PostgreSQL
import { firestore } from '../src/db/compat.js';
import { buildApplePassBuffer } from './apple.js';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import * as http2 from 'node:http2';

/* =========================================================
   COLECCIONES (PostgreSQL via capa de compatibilidad)
   ========================================================= */

const COL_CARDS = "cards";
const COL_APPLE_DEVICES = "apple_devices";
const COL_APPLE_UPDATES = "apple_updates";

console.log('[APPLE WEB SERVICE] ✅ Configurado para PostgreSQL');

// ⭐ AUTH TOKEN
const APPLE_AUTH_TOKEN = process.env.APPLE_AUTH_TOKEN;

/* =========================================================
   HELPERS FIRESTORE
   ========================================================= */

async function fsGetCard(cardId) {
  try {
    const snap = await firestore.collection(COL_CARDS).doc(cardId).get();
    if (!snap.exists) {
      console.log(`[APPLE] ❌ Tarjeta no encontrada en Firestore: ${cardId}`);
      return null;
    }
    
    const cardData = { id: snap.id, ...snap.data() };
    console.log(`[APPLE] ✅ Tarjeta recuperada:`, {
      id: cardData.id,
      name: cardData.name,
      stamps: cardData.stamps,
      max: cardData.max,
      latestMessage: cardData.latestMessage,
      hasAllFields: !!(cardData.id && cardData.name)
    });
    
    return cardData;
  } catch (error) {
    console.error(`[APPLE] Error obteniendo tarjeta ${cardId}:`, error);
    return null;
  }
}

async function fsRegisterDevice(deviceId, pushToken, passTypeId, serialNumber) {
  try {
    const deviceKey = `${deviceId}_${passTypeId}_${serialNumber}`;
    await firestore.collection(COL_APPLE_DEVICES).doc(deviceKey).set({
      deviceId: deviceId,
      pushToken: pushToken,
      passTypeId: passTypeId,
      serialNumber: serialNumber,
      createdAt: new Date().toISOString()
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
      .where('serialNumber', '==', serialNumber)
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
      .where('deviceId', '==', deviceId)
      .where('passTypeId', '==', passTypeId)
      .get();
    
    return snap.docs.map(doc => ({
      serial_number: doc.data().serialNumber,
      last_updated: doc.data().updatedAt || doc.data().createdAt
    }));
  } catch (error) {
    console.error('[APPLE] Error obteniendo serials:', error);
    return [];
  }
}

async function fsLogUpdate(serialNumber, stampsOld, stampsNew) {
  try {
    await firestore.collection(COL_APPLE_UPDATES).add({
      serialNumber: serialNumber,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[APPLE] Error guardando actualización:', error);
  }
}

async function fsGetLastUpdate(serialNumber) {
  // La bitácora apple_updates es frágil para decidir frescura: la ruta de
  // recepción (/api/stamp) manda push pero nunca la escribía, y en las rutas
  // que sí escriben el log cae DESPUÉS del push, cuando el iPhone ya pudo
  // preguntar. El iPhone entonces recibía "no hay pases nuevos", marcaba el
  // push como espurio y el pase se quedaba viejo para siempre (causa del
  // reporte "no se sincronizan las wallets", 20-ago-2026).
  // La verdad de fondo es cards.updatedAt: Prisma lo actualiza en el MISMO
  // write del sello, antes de cualquier push, sin importar la ruta. Se
  // responde con el más reciente de ambos.
  let logDate = null;
  try {
    const snap = await firestore
      .collection(COL_APPLE_UPDATES)
      .where('serialNumber', '==', serialNumber)
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();
    if (!snap.empty) {
      const d = new Date(snap.docs[0].data().updatedAt);
      if (!Number.isNaN(d.getTime())) logDate = d;
    }
  } catch (error) {
    console.error('[APPLE] Error obteniendo última actualización:', error);
  }

  let cardDate = null;
  try {
    const cardId = serialNumber.endsWith('-massage') ? serialNumber.slice(0, -8) : serialNumber;
    const card = await fsGetCard(cardId);
    if (card && card.updatedAt) {
      const d = new Date(card.updatedAt);
      if (!Number.isNaN(d.getTime())) cardDate = d;
    }
  } catch (error) {
    console.error('[APPLE] Error leyendo updatedAt de la tarjeta:', error);
  }

  const best = logDate && cardDate ? (logDate > cardDate ? logDate : cardDate) : (logDate || cardDate);
  return best ? { updatedAt: best.toISOString() } : null;
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
   ⭐ FUNCIÓN: ENVIAR PUSH VACÍO A APPLE WALLET (para que Wallet actualice el pase)
   ========================================================= */

function sendWalletPush(pushToken) {
  const apnsHost = 'api.push.apple.com';
  const apnsPort = 443;

  try {
    const token = generateAPNsToken();
    const apnsTopic = process.env.APPLE_PASS_TYPE_ID;

    // Apple Wallet espera un push vacío — Wallet intercepta y pide el pase actualizado
    const jsonPayload = JSON.stringify({});

    console.log(`[APNs/WALLET] 📤 Push vacío para actualizar wallet: ${pushToken.substring(0, 15)}...`);

    const client = http2.connect(`https://${apnsHost}:${apnsPort}`);

    return new Promise((resolve, reject) => {
      client.on('error', (err) => {
        client.close();
        reject(new Error(`APNs wallet push connection failed: ${err.message}`));
      });

      const req = client.request({
        [http2.constants.HTTP2_HEADER_METHOD]: http2.constants.HTTP2_METHOD_POST,
        [http2.constants.HTTP2_HEADER_PATH]: `/3/device/${pushToken}`,
        'authorization': `bearer ${token}`,
        'apns-topic': apnsTopic,
        'apns-push-type': 'background',
        'apns-priority': '5',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(jsonPayload)
      });

      req.on('response', (headers) => {
        const statusCode = headers[http2.constants.HTTP2_HEADER_STATUS];
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => {
          client.close();
          if (statusCode === 200) {
            console.log(`[APNs/WALLET] ✅ Push wallet enviado`);
            resolve(true);
          } else {
            console.error(`[APNs/WALLET] ❌ Error ${statusCode}:`, data);
            reject(new Error(`APNs wallet push failed ${statusCode}`));
          }
        });
      });

      req.on('error', (err) => { client.close(); reject(err); });
      req.end(jsonPayload);
    });
  } catch (error) {
    console.error('[APNs/WALLET] ❌ Error:', error);
    throw error;
  }
}

/* =========================================================
   ⭐ FUNCIÓN PRINCIPAL CORREGIDA: ENVIAR NOTIFICACIÓN APNs (ALERTA VISIBLE)
   ========================================================= */

export async function sendAPNsAlertNotification(pushToken, title, body) {
  const apnsHost = 'api.push.apple.com'; // Producción
  const apnsPort = 443;

  try {
    const token = generateAPNsToken();
    const apnsTopic = process.env.APPLE_PASS_TYPE_ID;
    
    // ✅ PAYLOAD CORREGIDO PARA ALERTAS VISIBLES EN PANTALLA DE BLOQUEO
    const apnsPayload = {
      "aps": {
        "alert": {
          "title": title || "Venus Cosmetología",
          "body": body || "Tienes una nueva actualización"
        },
        "sound": "default",       // ⭐ CRÍTICO: Sonido
        "badge": 1,               // ⭐ CRÍTICO: Badge en ícono
        "mutable-content": 1,     // ⭐ NUEVO: Permite modificación
        "content-available": 0    // ⭐ NUEVO: NO es background
      }
    };
    
    const jsonPayload = JSON.stringify(apnsPayload);
    
    console.log(`[APNs/ALERT] 📤 Enviando ALERTA VISIBLE a: ${pushToken.substring(0, 15)}...`);
    console.log(`[APNs/ALERT] 📝 Payload:`, apnsPayload);
    
    const client = http2.connect(`https://${apnsHost}:${apnsPort}`);
    
    return new Promise((resolve, reject) => {
      client.on('error', (err) => {
        client.close();
        console.error('[APNs/ALERT] ❌ Client Error:', err);
        reject(new Error(`APNs connection failed: ${err.message}`));
      });
      
      const req = client.request({
        [http2.constants.HTTP2_HEADER_METHOD]: http2.constants.HTTP2_METHOD_POST,
        [http2.constants.HTTP2_HEADER_PATH]: `/3/device/${pushToken}`,
        
        // ✅ HEADERS CRÍTICOS PARA ALERTAS VISIBLES
        'authorization': `bearer ${token}`,
        'apns-topic': apnsTopic,
        'apns-push-type': 'alert',        // ⭐ CRÍTICO: 'alert'
        'apns-priority': '10',            // ⭐ CRÍTICO: Prioridad alta
        'apns-expiration': '0',           // ⭐ NUEVO: Entregar inmediatamente
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(jsonPayload)
      });
      
      req.on('response', (headers) => {
        const statusCode = headers[http2.constants.HTTP2_HEADER_STATUS];
        let data = '';
        
        req.on('data', (chunk) => { data += chunk; });
        
        req.on('end', () => {
          client.close();
          
          if (statusCode === 200) {
            console.log(`[APNs/ALERT] ✅ ENVIADO: "${title}" - "${body}"`);
            resolve(true);
          } else {
            let errorBody = data;
            try {
              errorBody = JSON.parse(data);
            } catch (e) {
              errorBody = { reason: 'Unknown', body: data };
            }

            console.error(`[APNs/ALERT] ❌ Error ${statusCode}:`, errorBody);
            
            // ⭐ NUEVO: Detalles del error
            if (statusCode === 400) {
              console.error(`[APNs/ALERT] 💡 Bad request - Verifica payload y headers`);
            } else if (statusCode === 403) {
              console.error(`[APNs/ALERT] 💡 Forbidden - Verifica certificado y topic`);
            } else if (statusCode === 410) {
              console.error(`[APNs/ALERT] 💡 Token inválido - El dispositivo debe reinstalar el pase`);
            }
            
            reject(new Error(`APNs failed ${statusCode}: ${errorBody.reason || 'Unknown'}`));
          }
        });
      });

      req.on('error', (err) => {
        client.close();
        console.error('[APNs/ALERT] ❌ Request Error:', err);
        reject(new Error(`APNs request failed: ${err.message}`));
      });
      
      req.end(jsonPayload);
    });
    
  } catch (error) {
    console.error('[APNs/ALERT] ❌ Error general:', error);
    throw error;
  }
}

/* =========================================================
   ⭐ FUNCIÓN MEJORADA: ENVIAR ALERTA A TODOS LOS DISPOSITIVOS DE UNA TARJETA
   ========================================================= */

export async function sendAlertToCardDevices(serialNumber, title, message) {
  const result = { sent: 0, errors: 0, total: 0, errorDetails: [] };
  
  try {
    const devices = await fsGetDevicesBySerial(serialNumber);
    result.total = devices.length;

    if (result.total === 0) {
      console.log(`[APPLE ALERT] 📭 No hay dispositivos para: ${serialNumber}`);
      return result;
    }

    console.log(`[APPLE ALERT] 🔔 Notificando a ${result.total} dispositivo(s) para: ${serialNumber}`);
    console.log(`[APPLE ALERT] 📨 Título: "${title}"`);
    console.log(`[APPLE ALERT] 📨 Mensaje: "${message}"`);

    for (const device of devices) {
      try {
        console.log(`[APPLE ALERT] 📤 Enviando a dispositivo: ${device.device_id.substring(0, 15)}...`);
        
        // 1) Push vacío para que Apple Wallet actualice el pase
        try {
          await sendWalletPush(device.push_token);
        } catch (wpErr) {
          console.warn(`[APPLE ALERT] ⚠️ Wallet push falló (no crítico):`, wpErr.message);
        }
        
        // Pausa breve entre pushes
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 2) Alerta visible con mensaje personalizado
        await sendAPNsAlertNotification(device.push_token, title, message);
        result.sent++;
        console.log(`[APPLE ALERT] ✅ Enviado exitosamente (wallet push + alerta)`);
      } catch (error) {
        result.errors++;
        result.errorDetails.push({
          deviceId: device.device_id.substring(0, 15) + '...',
          error: error.message
        });
        console.error(`[APPLE ALERT] ❌ Error en dispositivo ${device.device_id}:`, error.message);
        
        // ⭐ MEJORADO: Limpiar tokens inválidos automáticamente
        if (error.message.includes('410') || error.message.includes('BadDeviceToken')) {
          console.log(`[APPLE ALERT] 🗑️ Eliminando token inválido: ${device.device_id}`);
          try {
            await fsUnregisterDevice(device.device_id, device.pass_type_id, serialNumber);
          } catch (deleteError) {
            console.error(`[APPLE ALERT] ⚠️ No se pudo eliminar token:`, deleteError);
          }
        }
      }
      
      // Pausa entre notificaciones
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    console.log(`[APPLE ALERT] 📊 Resultado: ${result.sent}/${result.total} enviadas, ${result.errors} errores`);
    return result;

  } catch (error) {
    console.error('[APPLE ALERT] ❌ Error crítico:', error);
    result.errors++;
    result.errorDetails.push({
      deviceId: 'GENERAL',
      error: error.message
    });
    return result;
  }
}

/* =========================================================
   ⭐ FUNCIÓN SIMPLIFICADA: NOTIFICAR ACTUALIZACIÓN DE TARJETA
   ========================================================= */

export async function notifyCardUpdate(cardId, title = "Venus Cosmetología", message = "Tu tarjeta ha sido actualizada") {
  try {
    console.log(`[APPLE UPDATE] 🔔 Iniciando notificación para: ${cardId}`);
    console.log(`[APPLE UPDATE] 📨 "${title}" - "${message}"`);
    
    // ✅ SIMPLIFICADO: Usar directamente sendAlertToCardDevices
    const result = await sendAlertToCardDevices(cardId, title, message);
    
    if (result.sent > 0) {
      console.log(`[APPLE UPDATE] ✅ Notificación enviada a ${result.sent} dispositivo(s)`);
    } else if (result.total === 0) {
      console.log(`[APPLE UPDATE] 📭 Sin dispositivos registrados para: ${cardId}`);
    } else {
      console.log(`[APPLE UPDATE] ⚠️ Falló el envío a todos los dispositivos`);
    }
    
    return result;
    
  } catch (error) {
    console.error('[APPLE UPDATE] ❌ Error:', error);
    return { sent: 0, errors: 1, total: 0, errorDetails: [{ error: error.message }] };
  }
}

/* =========================================================
   ⭐ FUNCIÓN MEJORADA: ACTUALIZAR PASE Y NOTIFICAR
   ========================================================= */

export async function updatePassAndNotify(cardId, oldStamps, newStamps, customMessage = null) {
  try {
    console.log(`[APPLE] 🔄 Actualizando pase ${cardId}: ${oldStamps} → ${newStamps}`);
    
    // ✅ MEJORADO: Mensaje personalizado según el contexto
    let title = "Venus Cosmetología";
    let message = customMessage;
    
    if (!message) {
      if (newStamps === 0 && oldStamps > 0) {
        title = "¡Canje realizado! 🎉";
        message = "Has canjeado tu recompensa. Comienza a acumular nuevos sellos.";
      } else if (newStamps > oldStamps) {
        title = "¡Nuevo sello! 🎉";
        message = `Tienes ${newStamps} sellos acumulados.`;
      } else {
        title = "Actualización";
        message = "Tu tarjeta ha sido actualizada.";
      }
    }
    
    // Notificar (envía push vacío + alerta visible)
    const result = await notifyCardUpdate(cardId, title, message);
    
    // ⭐ CRÍTICO: Registrar el log DESPUÉS del push para evitar race condition
    // Wallet pregunta "¿hay algo nuevo desde X?" — el log debe ser posterior a X
    await fsLogUpdate(cardId, oldStamps, newStamps);
    
    console.log(`[APPLE] ✅ Resultado: ${result.sent} notificaciones enviadas`);
    return result;
    
  } catch (error) {
    console.error('[APPLE] ❌ Error en updatePassAndNotify:', error);
    return { sent: 0, errors: 1, total: 0 };
  }
}

/* =========================================================
   ⭐ HELPER DE AUTH INLINE
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
    
    // Resolver el cardId real (quitar sufijo -massage si existe)
    const isMassage = serial.endsWith('-massage');
    const cardId = isMassage ? serial.slice(0, -8) : serial;
    
    console.log('[APPLE] 📱 Registrando dispositivo:', {
      deviceId: deviceId?.substring(0, 10) + '...',
      serial,
      cardId,
      isMassage,
      passTypeId
    });
    
    // Verificar que la tarjeta existe en Firestore
    const card = await fsGetCard(cardId);
    if (!card) {
      console.warn(`[APPLE] ⚠️ Tarjeta no encontrada en Firestore: ${cardId}`);
      return res.status(404).send('Pass not found');
    }
    
    console.log(`[APPLE] ✅ Tarjeta encontrada: ${card.name} (${card.stamps}/${card.max})`);
    
    // Registrar dispositivo usando el serial completo (con sufijo si aplica)
    await fsRegisterDevice(deviceId, pushToken, passTypeId, serial);
    
    console.log('[APPLE] ✅ Dispositivo registrado exitosamente:', serial);
    res.status(201).send();
    
  } catch (error) {
    console.error('[APPLE] ❌ Error registrando dispositivo:', error);
    console.error('[APPLE] Stack:', error.stack);
    res.status(500).send('Internal error');
  }
}

export async function getUpdatablePassesHandler(req, res) {
  console.log('[APPLE HANDLER] 📋 getUpdatablePassesHandler EJECUTÁNDOSE');
  console.log('[APPLE HANDLER] Params:', req.params);
  console.log('[APPLE HANDLER] Query:', req.query);
  
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
    
    console.log(`[APPLE] 📋 Dispositivo tiene ${rows.length} pases registrados`);
    
    if (rows.length === 0) {
      console.log('[APPLE] 📭 No hay pases para este dispositivo');
      return res.status(204).send();
    }
    
    // Filtrar por fecha si se proporciona
    let serialNumbers = rows.map(r => r.serial_number);
    console.log('[APPLE] 📋 Serials encontrados:', serialNumbers);
    
    if (passesUpdatedSince) {
      // passesUpdatedSince puede ser ISO string o Unix timestamp
      let sinceDate;
      if (passesUpdatedSince.includes('T') || passesUpdatedSince.includes('-')) {
        // Es ISO string
        sinceDate = new Date(passesUpdatedSince);
      } else {
        // Es Unix timestamp
        sinceDate = new Date(parseInt(passesUpdatedSince) * 1000);
      }
      
      console.log('[APPLE] 📅 Filtrando desde:', sinceDate.toISOString());
      
      // ⭐ Restar 2 segundos de margen para evitar race condition con milisegundos
      const sinceDateWithMargin = new Date(sinceDate.getTime() - 2000);
      console.log('[APPLE] 📅 Con margen de 2s:', sinceDateWithMargin.toISOString());
      
      const filtered = [];
      
      for (const serial of serialNumbers) {
        const lastUpdate = await fsGetLastUpdate(serial);
        console.log(`[APPLE] 🔍 Update para ${serial}:`, lastUpdate ? lastUpdate.updatedAt : 'NO HAY');
        
        if (lastUpdate) {
          const updateDate = new Date(lastUpdate.updatedAt);
          if (updateDate >= sinceDateWithMargin) {
            console.log(`[APPLE] ✅ ${serial} tiene actualización más reciente`);
            filtered.push(serial);
          }
        } else {
          // Si no hay registro de update, incluirlo (puede ser nuevo)
          console.log(`[APPLE] ⚠️ ${serial} sin registro de update, incluyendo`);
          filtered.push(serial);
        }
      }
      
      serialNumbers = filtered;
    }
    
    if (serialNumbers.length === 0) {
      console.log('[APPLE] ✨ Todos los pases están actualizados');
      return res.status(204).send();
    }
    
    console.log(`[APPLE] 📋 ${serialNumbers.length} pase(s) actualizables:`, serialNumbers);
    
    const lastUpdated = new Date().toISOString();
    
    res.json({
      serialNumbers,
      lastUpdated
    });
    
    console.log(`[APPLE] ✅ Respuesta enviada con lastUpdated: ${lastUpdated}`);
    
  } catch (error) {
    console.error('[APPLE] ❌ Error obteniendo pases actualizables:', error);
    res.status(500).send('Internal error');
  }
}

export async function getLatestPassHandler(req, res) {
  console.log('[APPLE HANDLER] 📥 getLatestPassHandler EJECUTÁNDOSE');
  
  // ⭐ AUTH INLINE - REQUERIDO
  if (!checkAuth(req, res)) return;
  
  try {
    const { passTypeId, serial } = req.params;
    const modifiedSince = req.headers['if-modified-since'];
    
    console.log('[APPLE] 📥 Solicitando pase:', { passTypeId, serial });

    // Resolver cardId y cardType desde el serial
    const isMassage = serial.endsWith('-massage');
    const cardId = isMassage ? serial.slice(0, -8) : serial;
    const cardType = isMassage ? 'massage' : 'loyalty';

    // Obtener tarjeta desde Firestore usando el cardId real
    const card = await fsGetCard(cardId);
    if (!card) {
      console.warn(`[APPLE] ⚠️ Pase no encontrado: ${cardId}`);
      return res.status(404).send('Pass not found');
    }

    // ⭐ DEBUG: Verificar qué datos tiene la tarjeta
    console.log(`[APPLE] 🔍 Datos de tarjeta recuperados:`, {
      id: card.id,
      name: card.name,
      stamps: card.stamps,
      max: card.max,
      cardType: card.cardType || cardType,
      latestMessage: card.latestMessage,
      hasLatestMessage: !!card.latestMessage
    });

    

    // ✅ INCLUIR EL MENSAJE Y cardType EN LOS DATOS DEL PASE
    const resolvedCardType = isMassage ? 'massage' : (card.cardType || 'loyalty');
    const passData = {
      cardId: card.id,
      name: card.name,
      stamps: isMassage ? (card.massageStamps || 0) : (card.stamps || 0),
      max: isMassage ? (card.massageMax || 10) : (card.max || 8),
      cardType: resolvedCardType,
      latestMessage: card.latestMessage || null
    };

    console.log(`[APPLE] 🔨 Generando pase con datos completos:`, passData);
    
    const buffer = await buildApplePassBuffer(passData);
    
    const lastModified = new Date().toUTCString();
    
    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Last-Modified': lastModified,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    
    console.log(`[APPLE] ✅ Pase enviado con mensaje: ${card.latestMessage ? 'SÍ' : 'NO'}`);
    res.send(buffer);
    
  } catch (error) {
    console.error('[APPLE] ❌ Error generando pase:', error);
    res.status(500).send('Internal error');
  }
}

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
   EXPORTS ACTUALIZADOS
   ========================================================= */

export default {
  registerDeviceHandler,
  getUpdatablePassesHandler,
  getLatestPassHandler,
  unregisterDeviceHandler,
  logHandler,
  appleAuthMiddleware,
  notifyCardUpdate,
  sendAPNsAlertNotification,
  sendAlertToCardDevices,
  updatePassAndNotify
};