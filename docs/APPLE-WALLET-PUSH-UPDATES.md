# Apple Wallet - Push Notifications y Actualizaciones de Pases

Guia completa para implementar notificaciones push y actualizaciones automaticas de pases de Apple Wallet.

---

## Indice

1. [Como funciona (vision general)](#1-como-funciona)
2. [Flujo completo de actualizacion](#2-flujo-completo)
3. [Web Service Protocol de Apple](#3-web-service-protocol)
4. [APNs - Push Notifications](#4-apns-push-notifications)
5. [Registro de dispositivos](#5-registro-de-dispositivos)
6. [Triggers de actualizacion](#6-triggers-de-actualizacion)
7. [Certificados y configuracion](#7-certificados-y-configuracion)
8. [Implementacion paso a paso](#8-implementacion-paso-a-paso)
9. [Base de datos requerida](#9-base-de-datos)
10. [Troubleshooting](#10-troubleshooting)
11. [Checklist para nuevo proyecto](#11-checklist)

---

## 1. Como funciona

Apple Wallet **no permite modificar un pase directamente** desde el servidor. En su lugar, usa un sistema de "pull" con notificaciones push:

```
┌─────────┐    1. Push vacio     ┌──────────┐
│ Servidor │ ──────────────────► │  iPhone   │
└─────────┘                      └──────────┘
                                      │
     2. "¿Hay actualizaciones?"       │
┌─────────┐ ◄────────────────────────┘
│ Servidor │
└─────────┘ ─────────────────────────┐
     3. "Si, serial: abc123"         │
                                      ▼
     4. "Dame el pase nuevo"    ┌──────────┐
┌─────────┐ ◄───────────────── │  iPhone   │
│ Servidor │                    └──────────┘
└─────────┘ ──────────────────►
     5. Nuevo .pkpass
```

**Resumen:**
1. Tu servidor envia un **push vacio** via APNs al dispositivo
2. El dispositivo llama a tu servidor: "¿Que pases cambiaron?"
3. Tu servidor responde con la lista de serials actualizados
4. El dispositivo pide cada pase actualizado
5. Tu servidor genera y devuelve el nuevo `.pkpass`

---

## 2. Flujo completo de actualizacion

### Cuando se agrega un sello:

```
Cliente presenta tarjeta
        │
        ▼
POST /api/admin/stamp  (admin escanea QR)
        │
        ├──► 1. Actualizar DB: stamps + 1
        │
        ├──► 2. Actualizar Google Wallet (si tiene)
        │
        ├──► 3. Notificar Apple Wallet:
        │       a) Buscar dispositivos registrados para ese cardId
        │       b) Enviar push vacio a cada dispositivo via APNs
        │       c) Enviar alerta visible: "Nuevo sello registrado"
        │       d) Guardar timestamp de actualizacion
        │
        └──► 4. iPhone recibe push:
                a) GET /v1/devices/:deviceId/registrations/:passTypeId
                   → Servidor responde: ["card123"]
                b) GET /v1/passes/:passTypeId/card123
                   → Servidor genera nuevo .pkpass con stamps actualizado
                c) Wallet reemplaza el pase viejo con el nuevo
```

### Cuando se canjean sellos:

```
POST /api/admin/redeem
        │
        ├──► stamps = 0, cycles + 1
        ├──► Notificar: "Felicidades! Canjeaste tu recompensa"
        └──► Mismo flujo de push...
```

---

## 3. Web Service Protocol de Apple

Tu servidor debe implementar estos 5 endpoints. Apple Wallet los llama automaticamente.

### Endpoints requeridos

```
POST   /v1/devices/:deviceId/registrations/:passTypeId/:serial  → Registrar dispositivo
GET    /v1/devices/:deviceId/registrations/:passTypeId           → Consultar actualizaciones
GET    /v1/passes/:passTypeId/:serial                            → Descargar pase actualizado
DELETE /v1/devices/:deviceId/registrations/:passTypeId/:serial   → Desregistrar dispositivo
POST   /v1/log                                                   → Recibir logs de errores
```

### 3.1 Registrar Dispositivo

Cuando el usuario agrega un pase a su Wallet, Apple llama este endpoint.

```javascript
// POST /v1/devices/:deviceId/registrations/:passTypeId/:serial
// Header: Authorization: ApplePass <authToken>

async function registerDevice(req, res) {
  const { deviceId, passTypeId, serial } = req.params;
  const { pushToken } = req.body;

  // Validar auth token
  const authToken = req.headers.authorization?.replace('ApplePass ', '');
  if (authToken !== process.env.APPLE_AUTH_TOKEN) {
    return res.status(401).send('Unauthorized');
  }

  // Guardar registro
  const docId = `${deviceId}_${passTypeId}_${serial}`;
  await db.collection('apple_devices').doc(docId).set({
    deviceId,
    pushToken,
    passTypeId,
    serialNumber: serial,
    registeredAt: new Date(),
    updatedAt: new Date(),
  });

  // 200 = ya existia, 201 = nuevo registro
  const existed = /* verificar si ya existia */;
  res.status(existed ? 200 : 201).send();
}
```

### 3.2 Consultar Actualizaciones

El dispositivo pregunta: "¿Cuales de mis pases cambiaron desde X fecha?"

```javascript
// GET /v1/devices/:deviceId/registrations/:passTypeId
// Query: ?passesUpdatedSince=1234567890 (timestamp)

async function getUpdatablePasses(req, res) {
  const { deviceId, passTypeId } = req.params;
  const since = req.query.passesUpdatedSince;

  // Buscar pases registrados en este dispositivo
  const registrations = await db.collection('apple_devices')
    .where('deviceId', '==', deviceId)
    .where('passTypeId', '==', passTypeId)
    .get();

  if (registrations.empty) return res.status(204).send();

  // Filtrar los que se actualizaron despues de `since`
  const serialNumbers = [];
  let latestUpdate = 0;

  for (const doc of registrations.docs) {
    const data = doc.data();
    const updatedAt = data.updatedAt?.toMillis?.() || Date.now();

    if (!since || updatedAt > Number(since) * 1000) {
      serialNumbers.push(data.serialNumber);
    }
    latestUpdate = Math.max(latestUpdate, updatedAt);
  }

  if (serialNumbers.length === 0) return res.status(204).send();

  res.json({
    serialNumbers,
    lastUpdated: String(Math.floor(latestUpdate / 1000)),
  });
}
```

### 3.3 Descargar Pase Actualizado

El dispositivo pide el `.pkpass` mas reciente.

```javascript
// GET /v1/passes/:passTypeId/:serial
// Header: Authorization: ApplePass <authToken>

async function getLatestPass(req, res) {
  const { serial } = req.params;

  // Determinar tipo de tarjeta por el serial
  const isMassage = serial.endsWith('-massage');
  const cardId = isMassage ? serial.replace('-massage', '') : serial;
  const cardType = isMassage ? 'massage' : 'loyalty';

  // Obtener datos actuales de la tarjeta
  const card = await getCardById(cardId);
  if (!card) return res.status(404).send();

  // Generar nuevo .pkpass con datos actualizados
  const buffer = await buildApplePassBuffer({
    cardId: serial,
    name: card.name,
    stamps: isMassage ? card.massageStamps : card.stamps,
    max: isMassage ? card.massageMax : card.max,
    cardType,
    latestMessage: card.latestMessage,
  });

  res.set({
    'Content-Type': 'application/vnd.apple.pkpass',
    'Content-Disposition': `attachment; filename=${serial}.pkpass`,
    'Last-Modified': new Date().toUTCString(),
  });
  res.send(buffer);
}
```

### 3.4 Desregistrar Dispositivo

Cuando el usuario elimina el pase de su Wallet.

```javascript
// DELETE /v1/devices/:deviceId/registrations/:passTypeId/:serial

async function unregisterDevice(req, res) {
  const { deviceId, passTypeId, serial } = req.params;
  const docId = `${deviceId}_${passTypeId}_${serial}`;

  await db.collection('apple_devices').doc(docId).delete();
  res.status(200).send();
}
```

### 3.5 Recibir Logs

Apple envia errores del lado del dispositivo aqui.

```javascript
// POST /v1/log

function logHandler(req, res) {
  const { logs } = req.body;
  if (Array.isArray(logs)) {
    logs.forEach(log => console.log('[Apple Wallet Log]', log));
  }
  res.status(200).send();
}
```

### Montar las rutas en Express

```javascript
import * as appleWS from './lib/apple-webservice.js';

// Web Service Protocol v1
app.post('/v1/devices/:deviceId/registrations/:passTypeId/:serial',
  appleWS.appleAuthMiddleware, appleWS.registerDeviceHandler);

app.get('/v1/devices/:deviceId/registrations/:passTypeId',
  appleWS.getUpdatablePassesHandler);

app.get('/v1/passes/:passTypeId/:serial',
  appleWS.appleAuthMiddleware, appleWS.getLatestPassHandler);

app.delete('/v1/devices/:deviceId/registrations/:passTypeId/:serial',
  appleWS.appleAuthMiddleware, appleWS.unregisterDeviceHandler);

app.post('/v1/log', appleWS.logHandler);
```

---

## 4. APNs - Push Notifications

### 4.1 Tipos de push

| Tipo | Proposito | Visible? |
|------|-----------|----------|
| **Background push** | Decirle al dispositivo que pida el pase nuevo | No |
| **Alert push** | Mostrar notificacion visible al usuario | Si |

### 4.2 Generar JWT para autenticacion

APNs usa autenticacion por token JWT (no certificados p12).

```javascript
import jwt from 'jsonwebtoken';

function generateAPNsToken() {
  const keyId = process.env.APPLE_KEY_ID;         // ID de la key .p8
  const teamId = process.env.APPLE_TEAM_ID;       // Team ID
  const keyBase64 = process.env.APPLE_APNS_KEY_BASE64; // Key .p8 en base64

  const key = Buffer.from(keyBase64, 'base64').toString('utf8');

  return jwt.sign({}, key, {
    algorithm: 'ES256',
    keyid: keyId,
    issuer: teamId,
    expiresIn: '1h',
  });
}
```

### 4.3 Enviar push vacio (trigger de actualizacion)

Este push NO muestra nada al usuario. Solo le dice al dispositivo: "ve a buscar actualizaciones".

```javascript
import https from 'https';

async function sendWalletPush(pushToken) {
  const token = generateAPNsToken();

  const options = {
    hostname: 'api.push.apple.com',
    port: 443,
    path: `/3/device/${pushToken}`,
    method: 'POST',
    headers: {
      'authorization': `bearer ${token}`,
      'apns-topic': process.env.APPLE_PASS_TYPE_ID,
      'apns-push-type': 'background',      // Push silencioso
      'apns-priority': '5',                 // Prioridad baja (OK)
      'Content-Length': 2,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (res.statusCode === 200) resolve(true);
      else if (res.statusCode === 410) {
        // Token invalido - eliminar dispositivo
        cleanupInvalidToken(pushToken);
        resolve(false);
      } else {
        reject(new Error(`APNs responded ${res.statusCode}`));
      }
    });
    req.write('{}');  // Body vacio
    req.end();
  });
}
```

### 4.4 Enviar alerta visible

Muestra una notificacion real al usuario (titulo + mensaje).

```javascript
async function sendAlertNotification(pushToken, title, body) {
  const token = generateAPNsToken();

  const payload = JSON.stringify({
    aps: {
      alert: { title, body },
      sound: 'default',
      badge: 1,
      'mutable-content': 1,
      'content-available': 0,
    },
  });

  const options = {
    hostname: 'api.push.apple.com',
    port: 443,
    path: `/3/device/${pushToken}`,
    method: 'POST',
    headers: {
      'authorization': `bearer ${token}`,
      'apns-topic': process.env.APPLE_PASS_TYPE_ID,
      'apns-push-type': 'alert',           // Push visible
      'apns-priority': '10',               // Prioridad alta
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(true);
        else if (res.statusCode === 410) {
          cleanupInvalidToken(pushToken);
          resolve(false);
        } else {
          reject(new Error(`APNs ${res.statusCode}: ${data}`));
        }
      });
    });
    req.write(payload);
    req.end();
  });
}
```

### 4.5 Codigos de respuesta de APNs

| Codigo | Significado | Accion |
|--------|-------------|--------|
| 200 | Exito | Push enviado |
| 400 | Bad request | Revisar payload/headers |
| 403 | Certificado/token invalido | Regenerar credenciales |
| 405 | Metodo no permitido | Debe ser POST |
| 410 | Token inactivo | **Eliminar dispositivo** de tu DB |
| 413 | Payload muy grande | Max 4KB |
| 429 | Too many requests | Esperar y reintentar |

---

## 5. Registro de dispositivos

### Flujo de vida del dispositivo

```
Usuario agrega pase a Wallet
        │
        ▼
POST /v1/devices/{deviceId}/registrations/{passTypeId}/{serial}
  Body: { pushToken: "abc123..." }
        │
        ▼
  Servidor guarda: deviceId + pushToken + serial
        │
        ▼
  (Tiempo pasa, sellos se agregan...)
        │
        ▼
  Servidor envia push al pushToken
        │
        ▼
  Wallet descarga nuevo pase automaticamente
        │
        ▼
  (Si usuario elimina el pase)
        │
        ▼
DELETE /v1/devices/{deviceId}/registrations/{passTypeId}/{serial}
        │
        ▼
  Servidor elimina registro
```

### Serial Numbers por tipo de tarjeta

```
Tipo          │ Serial Number        │ Ejemplo
──────────────┼──────────────────────┼──────────────
Lealtad       │ {cardId}             │ card_1712345678
Masaje        │ {cardId}-massage     │ card_1712345678-massage
Anual         │ {cardId}             │ card_1712345678
Gold          │ {cardId}             │ card_1712345678
```

Un mismo cliente puede tener **multiples pases** (lealtad + masaje), cada uno con su propio serial.

---

## 6. Triggers de actualizacion

### Funciones principales

```javascript
// 1. Notificar sin mensaje custom (solo refresh silencioso)
async function notifyCardUpdate(cardId) {
  const devices = await getDevicesBySerial(cardId);
  for (const device of devices) {
    await sendWalletPush(device.pushToken);        // Refresh silencioso
  }
  await logUpdate(cardId);                          // Guardar timestamp
}

// 2. Actualizar pase con mensaje y alerta visible
async function updatePassAndNotify(serial, oldStamps, newStamps, customMsg) {
  // Guardar mensaje en la tarjeta (aparece en "Ultimo Aviso" del pase)
  const message = customMsg || `Sello registrado! Ahora tienes ${newStamps} sellos.`;
  await updateCardMessage(serial, message);

  // Buscar dispositivos
  const devices = await getDevicesBySerial(serial);

  for (const device of devices) {
    // Push silencioso para refrescar el pase
    await sendWalletPush(device.pushToken);

    // Alerta visible
    await sendAlertNotification(device.pushToken,
      'Venus Cosmetologia',
      message
    );
  }

  await logUpdate(serial);
}

// 3. Enviar alerta a todos los dispositivos de una tarjeta
async function sendAlertToCardDevices(cardId, title, body) {
  const devices = await getDevicesBySerial(cardId);
  for (const device of devices) {
    await sendAlertNotification(device.pushToken, title, body);
  }
}
```

### Donde se llaman (endpoints del servidor)

```javascript
// Agregar sello (admin)
app.post('/api/admin/stamp', async (req, res) => {
  const { cardId } = req.body;
  // ... actualizar DB ...
  await updatePassAndNotify(cardId, oldStamps, newStamps);
  //     ↑ Genera alerta: "Sello registrado! Ahora tienes X sellos"
});

// Agregar sesion de masaje
app.post('/api/admin/massage-stamp', async (req, res) => {
  const { cardId } = req.body;
  const massageSerial = `${cardId}-massage`;
  // ... actualizar DB ...
  await updatePassAndNotify(massageSerial, old, new,
    `Sesion de masaje registrada! ${new} de ${max}`);
  //     ↑ Genera alerta con mensaje custom
});

// Canjear recompensa
app.post('/api/admin/redeem', async (req, res) => {
  const { cardId } = req.body;
  // ... stamps = 0, cycles++ ...
  await notifyCardUpdate(cardId);
  //     ↑ Solo refresh silencioso (el pase se descarga de nuevo)
});

// Forzar actualizacion manual
app.post('/api/admin/force-update-pass', async (req, res) => {
  const { cardId } = req.body;
  await notifyCardUpdate(cardId);
  //     ↑ Util para corregir pases desincronizados
});

// Push masivo (a todos los clientes)
app.post('/api/admin/push-notification', async (req, res) => {
  const { title, message } = req.body;
  const cards = await getAllActiveCards();
  for (const card of cards) {
    await sendAlertToCardDevices(card.id, title, message);
    await delay(150); // Rate limiting
  }
});
```

---

## 7. Certificados y configuracion

### Variables de entorno

```env
# === Pase (firma del .pkpass) ===
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_PASS_TYPE_ID=pass.com.tunegocio.loyalty
APPLE_AUTH_TOKEN=un_token_secreto_largo
APPLE_ORG_NAME=Tu Negocio

# === APNs (push notifications) ===
APPLE_KEY_ID=YYYYYYYYYY
APPLE_APNS_KEY_BASE64=LS0tLS1CRUdJTi...   # .p8 key codificada en base64

# === Certificados de firma ===
# Opcion A: Rutas a archivos
APPLE_PASS_CERT=./certs/signerCert.pem
APPLE_PASS_KEY=./certs/signerKey.pem
APPLE_WWDR=./certs/wwdr.pem
APPLE_PASS_PHRASE=                          # Si la key tiene passphrase

# Opcion B: Base64 (para hosting sin filesystem)
APPLE_CERT_BASE64=LS0tLS1CRUdJTi...
APPLE_KEY_BASE64=LS0tLS1CRUdJTi...
APPLE_WWDR_BASE64=LS0tLS1CRUdJTi...

# === Servidor ===
BASE_URL=https://tudominio.com
BUSINESS_LATITUDE=20.3880
BUSINESS_LONGITUDE=-99.9960
```

### Obtener la APNs Key (.p8)

1. Ve a [Apple Developer > Keys](https://developer.apple.com/account/resources/authkeys/list)
2. Crea una nueva key con **Apple Push Notifications service (APNs)** habilitado
3. Descarga el archivo `.p8` (solo se puede descargar UNA vez)
4. Codificala en base64:

```bash
base64 -i AuthKey_XXXXXXXXXX.p8 | tr -d '\n'
```

5. Guarda el resultado en `APPLE_APNS_KEY_BASE64`
6. El `APPLE_KEY_ID` es el ID de la key (ej: `XXXXXXXXXX`)

### Obtener los certificados de firma

```bash
# 1. En Apple Developer Portal:
#    Identifiers > Pass Type IDs > tu pass > Create Certificate
#    Descargar el .cer

# 2. Convertir .cer a .pem
openssl x509 -inform DER -in pass.cer -out certs/signerCert.pem

# 3. Exportar key privada del Keychain como .p12, luego:
openssl pkcs12 -in Certificates.p12 -nocerts -out certs/signerKey.pem -nodes

# 4. Descargar WWDR Certificate (G4)
curl -O https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
openssl x509 -inform DER -in AppleWWDRCAG4.cer -out certs/wwdr.pem

# 5. Para hosting (codificar en base64):
base64 -i certs/signerCert.pem | tr -d '\n' > cert_base64.txt
base64 -i certs/signerKey.pem | tr -d '\n' > key_base64.txt
base64 -i certs/wwdr.pem | tr -d '\n' > wwdr_base64.txt
```

---

## 8. Implementacion paso a paso

### Paso 1: pass.json - Habilitar web service

El pase debe incluir `webServiceURL` y `authenticationToken` para que Apple Wallet sepa donde buscar actualizaciones:

```json
{
  "formatVersion": 1,
  "passTypeIdentifier": "pass.com.tunegocio.loyalty",
  "teamIdentifier": "XXXXXXXXXX",
  "serialNumber": "card_123",
  "webServiceURL": "https://tudominio.com",
  "authenticationToken": "tu_token_secreto",
  "organizationName": "Tu Negocio",
  "description": "Tarjeta de Lealtad",
  "storeCard": {
    "secondaryFields": [
      { "key": "name", "label": "CLIENTE", "value": "Maria Lopez" },
      { "key": "balance", "label": "SELLOS", "value": "3 de 8" }
    ]
  },
  "backgroundColor": "rgb(154, 159, 130)",
  "foregroundColor": "rgb(255, 255, 255)"
}
```

> **Importante:** Sin `webServiceURL`, el pase es estatico y nunca se actualiza.

### Paso 2: Crear tabla de dispositivos

```sql
-- PostgreSQL
CREATE TABLE apple_devices (
  id TEXT PRIMARY KEY,               -- {deviceId}_{passTypeId}_{serial}
  device_id TEXT NOT NULL,
  push_token TEXT NOT NULL,
  pass_type_id TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  registered_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE apple_updates (
  id SERIAL PRIMARY KEY,
  serial_number TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_devices_serial ON apple_devices(serial_number);
CREATE INDEX idx_devices_device ON apple_devices(device_id, pass_type_id);
CREATE INDEX idx_updates_serial ON apple_updates(serial_number);
```

### Paso 3: Implementar los 5 endpoints

Ver [seccion 3](#3-web-service-protocol) arriba.

### Paso 4: Implementar el push

Ver [seccion 4](#4-apns-push-notifications) arriba.

### Paso 5: Conectar con tu logica de negocio

Cada vez que cambien los datos del pase (sellos, nombre, etc.), llama:

```javascript
await updatePassAndNotify(cardId, oldValue, newValue, 'Mensaje para el usuario');
```

---

## 9. Base de datos

### Coleccion: apple_devices

```javascript
{
  // Document ID: "{deviceId}_{passTypeId}_{serialNumber}"
  deviceId: "abc123def456",                          // ID unico del dispositivo
  pushToken: "64-char-hex-token...",                 // Token APNs para enviar push
  passTypeId: "pass.com.tunegocio.loyalty",          // Pass Type ID
  serialNumber: "card_1712345678",                   // Serial del pase
  registeredAt: Timestamp,                            // Cuando se registro
  updatedAt: Timestamp,                               // Ultima actualizacion
}
```

### Coleccion: apple_updates

```javascript
{
  // Document ID: auto-generated
  serialNumber: "card_1712345678",
  updatedAt: Timestamp,                               // Cuando se actualizo el pase
  message: "Sello registrado! Ahora tienes 4 sellos" // Mensaje opcional
}
```

### Queries necesarios

```javascript
// Buscar dispositivos por serial (para enviar push)
db.collection('apple_devices')
  .where('serialNumber', '==', serial)
  .get();

// Buscar pases de un dispositivo (para consulta de actualizaciones)
db.collection('apple_devices')
  .where('deviceId', '==', deviceId)
  .where('passTypeId', '==', passTypeId)
  .get();

// Verificar si un pase se actualizo despues de X fecha
db.collection('apple_updates')
  .where('serialNumber', '==', serial)
  .where('updatedAt', '>', sinceDate)
  .limit(1)
  .get();
```

---

## 10. Troubleshooting

### El pase no se actualiza

1. **Verificar `webServiceURL`** en pass.json - debe ser HTTPS y accesible publicamente
2. **Verificar `authenticationToken`** - debe coincidir con lo que tu servidor espera
3. **Verificar registro del dispositivo** - buscar en `apple_devices` si hay registros
4. **Verificar logs de APNs** - status 410 = token invalido, eliminar y esperar re-registro
5. **Forzar actualizacion** - llamar `POST /api/admin/force-update-pass`

### APNs devuelve 403

- El `APPLE_KEY_ID` no coincide con la key .p8
- El `APPLE_TEAM_ID` es incorrecto
- La key .p8 no tiene permisos de APNs
- El JWT expiro (regenerar)

### APNs devuelve 410

- El pushToken ya no es valido (usuario desinstalo/elimino el pase)
- **Accion:** eliminar el dispositivo de tu DB automaticamente

### El dispositivo no se registra

- `webServiceURL` no es HTTPS (Apple requiere HTTPS obligatorio)
- El servidor no responde 200/201 en el endpoint de registro
- El `authenticationToken` en el pase no coincide con el middleware

### Push se envia pero el pase no cambia visualmente

- Tu endpoint `GET /v1/passes/:passTypeId/:serial` devuelve el pase viejo
- Verificar que `buildApplePassBuffer()` usa los datos **actuales** de la DB
- Verificar que el `Last-Modified` header cambia en cada request

### Logs de Apple Wallet

Apple envia errores a `POST /v1/log`. Siempre implementa este endpoint y loguea los mensajes:

```javascript
app.post('/v1/log', (req, res) => {
  console.log('[Apple Wallet]', JSON.stringify(req.body));
  res.status(200).send();
});
```

---

## 11. Checklist

### Configuracion inicial
- [ ] Registrar Pass Type ID en Apple Developer Portal
- [ ] Generar certificado de firma para el Pass Type ID
- [ ] Crear APNs Key (.p8) con permisos de push
- [ ] Descargar WWDR Certificate (G4)
- [ ] Convertir certificados a PEM
- [ ] Configurar variables de entorno

### Implementacion del servidor
- [ ] Implementar `buildApplePassBuffer()` con `webServiceURL` y `authenticationToken`
- [ ] Crear tabla/coleccion `apple_devices`
- [ ] Crear tabla/coleccion `apple_updates`
- [ ] Implementar POST register device
- [ ] Implementar GET updatable passes
- [ ] Implementar GET latest pass
- [ ] Implementar DELETE unregister device
- [ ] Implementar POST log
- [ ] Implementar `generateAPNsToken()` (JWT ES256)
- [ ] Implementar `sendWalletPush()` (push silencioso)
- [ ] Implementar `sendAlertNotification()` (push visible)
- [ ] Limpiar tokens invalidos (410) automaticamente

### Integracion con logica de negocio
- [ ] Llamar `updatePassAndNotify()` al agregar sello
- [ ] Llamar `notifyCardUpdate()` al canjear recompensa
- [ ] Llamar `sendAlertToCardDevices()` para notificaciones masivas
- [ ] Endpoint de forzar actualizacion (debug/admin)
- [ ] Endpoint de test push (debug)

### Verificacion
- [ ] Agregar pase a Wallet → verificar registro en DB
- [ ] Agregar sello → verificar que el pase se actualiza en el telefono
- [ ] Eliminar pase de Wallet → verificar que se elimina de DB
- [ ] Enviar push masivo → verificar que llega la notificacion
- [ ] Verificar manejo de tokens invalidos (410)

---

## Referencia

- [Apple: Wallet Web Service Reference](https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes)
- [Apple: PassKit Package Format](https://developer.apple.com/documentation/walletpasses)
- [Apple: APNs - Sending Push Notifications](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns)
- [Apple: APNs - Establishing Token-Based Connection](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns)
