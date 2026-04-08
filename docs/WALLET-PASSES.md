# Sistema de Pases Apple Wallet y Google Wallet

## Arquitectura General

El sistema soporta **Apple Wallet** (.pkpass) y **Google Wallet** (loyalty cards). Los pases se actualizan en tiempo real cuando se agregan sellos o se hace un canje.

```
Cliente agrega pase
        │
        ├── Apple Wallet
        │     ├── Descarga .pkpass
        │     ├── Registra dispositivo (pushToken) via webServiceURL
        │     └── Recibe push silencioso (APNs) → descarga pase actualizado
        │
        └── Google Wallet
              ├── Guarda via JWT save URL
              └── Recibe actualización via API REST (PUT loyaltyObject)
```

---

## Archivos Clave

| Archivo | Responsabilidad |
|---------|----------------|
| `lib/apple.js` | Genera buffer .pkpass (passkit-generator v3) |
| `lib/apple-webservice.js` | Endpoints Apple Wallet + push APNs |
| `lib/google.js` | Genera/actualiza objetos Google Wallet + JWT save URL |
| `src/services/appleWallet.js` | Wrapper de generacion de pases Apple |
| `src/services/googleWallet.js` | Wrapper de generacion de pases Google |
| `lib/api/push.js` | Push masivo y test a ambas plataformas |

---

## Apple Wallet

### Generacion del .pkpass (`lib/apple.js`)

`buildApplePassBuffer(cardData)` genera un archivo `.pkpass` con:

- **Campos primarios:** Nombre del miembro
- **Campos secundarios:** Sellos/Sesiones, Tipo de tarjeta
- **Campos auxiliares:** Telefono
- **Codigo QR:** ID de la tarjeta
- **Ubicacion:** Lat/Lng del negocio (relevance location)

**Tipos de tarjeta soportados:**

| Tipo | Color | Strip images |
|------|-------|--------------|
| `loyalty` | Verde (#8C9668) | `stamp-strip-{N}.png` |
| `massage` | Verde | `massage-strip-{N}.png` |
| `annual` | Dorado (#C4A77D) | - |
| `gold` | Negro (#1E1E1E) | - |

**Serial numbers:**
- Loyalty: `{cardId}`
- Massage: `{cardId}-massage`

### Web Service (callbacks de Apple Wallet)

Cuando un usuario agrega el pase, Apple Wallet llama automaticamente a estos endpoints definidos en el campo `webServiceURL` del pase:

```
webServiceURL: https://venus-loyalty.onrender.com/
authenticationToken: ${APPLE_AUTH_TOKEN}
```

| Metodo | Ruta | Funcion |
|--------|------|---------|
| POST | `/v1/devices/:deviceId/registrations/:passTypeId/:serial` | Registra dispositivo (guarda pushToken) |
| GET | `/v1/devices/:deviceId/registrations/:passTypeId` | Lista pases que necesitan actualizacion |
| GET | `/v1/passes/:passTypeId/:serial` | Descarga la version mas reciente del .pkpass |
| DELETE | `/v1/devices/:deviceId/registrations/:passTypeId/:serial` | Desregistra dispositivo |
| POST | `/v1/log` | Recibe logs de diagnostico de Apple Wallet |

### Push Notifications (APNs)

**Funciones principales en `lib/apple-webservice.js`:**

1. **`sendWalletPush(pushToken)`** - Push silencioso que hace que Wallet consulte por actualizaciones
   - Payload: `{}` (vacio)
   - `apns-push-type: background`, `apns-priority: 5`

2. **`sendAPNsAlertNotification(pushToken, title, body)`** - Notificacion visible en lock screen
   - `apns-push-type: alert`, `apns-priority: 10`

3. **`sendAlertToCardDevices(serialNumber, title, message)`** - Envia ambos tipos a todos los dispositivos registrados para un serial
   - Auto-limpia dispositivos con error 410 (BadDeviceToken)

4. **`updatePassAndNotify(cardId, oldStamps, newStamps, customMessage)`** - Orquestador principal
   - Determina contexto (sello vs canje)
   - Envia push
   - Registra actualizacion en `apple_updates`

### Flujo de actualizacion Apple

```
1. Servidor envia push silencioso via APNs
2. Apple Wallet despierta y llama GET /v1/devices/{id}/registrations/{type}?passesUpdatedSince=...
3. Servidor responde con serials que cambiaron despues de esa fecha
4. Wallet llama GET /v1/passes/{type}/{serial}
5. Servidor genera .pkpass fresco con datos actuales
6. Wallet muestra pase actualizado
```

---

## Google Wallet

### Generacion (`lib/google.js`)

**`buildGoogleSaveUrl({ cardId, name, stamps, max, cardType })`**
- Firma un JWT con RS256 usando service account
- Retorna URL: `https://pay.google.com/gp/v/save/{JWT}`

**`updateLoyaltyObject(cardId, name, stamps, max, cardType)`**
- PUT a la API de Google Wallet
- Actualiza puntos, modulos de texto, imagenes
- Si el objeto no existe (404), lo crea automaticamente
- Class ID: `{ISSUER_ID}.venus_loyalty_v1`

### Autenticacion Google

```
getWalletAccessToken()
  → JWT firmado con service account
  → Scope: wallet_object.issuer
  → Token valido 1 hora
```

---

## Cuando se disparan las actualizaciones

### Al agregar sello (`POST /api/admin/stamp`)

```javascript
// 1. Actualiza datos en BD
stamps = stamps + 1

// 2. Google Wallet - actualiza objeto
updateLoyaltyObject(cardId, name, newStamps, max)

// 3. Apple Wallet - push + registra update
updatePassAndNotify(cardId, oldStamps, newStamps)
```

### Al canjear (`POST /api/admin/redeem`)

```javascript
// 1. Resetea sellos a 0, incrementa ciclos
stamps = 0, cycles = cycles + 1

// 2. Google Wallet
updateLoyaltyObject(cardId, name, 0, max)

// 3. Apple Wallet
updatePassAndNotify(cardId, oldStamps, 0, "Canje realizado!")
```

### Sello de masajes (`POST /api/admin/massage-stamp`)

```javascript
// Serial especial: {cardId}-massage
updateLoyaltyObject(`${cardId}-massage`, name, newStamps, massageMax, 'massage')
updatePassAndNotify(`${cardId}-massage`, oldStamps, newStamps, customMsg)
```

### Push masivo (`POST /api/admin/push-notification`)

Envia mensaje a TODAS las tarjetas activas:
- **Google:** `addMessageToGoogleObject(cardId, title, message)`
- **Apple:** `sendAlertToCardDevices(serialNumber, title, message)`
- Rate limit: 150ms entre envios

---

## Endpoints de descarga (publicos)

| Ruta | Descripcion |
|------|-------------|
| `GET /api/public/card/:id/apple.pkpass` | Descarga .pkpass loyalty |
| `GET /api/public/card/:id/massage.pkpass` | Descarga .pkpass masajes |
| `GET /api/apple/pass?cardId=...` | Descarga admin + genera Google URL |

---

## Base de datos (PostgreSQL via Prisma)

### Registro de dispositivos Apple

```prisma
model AppleDevice {
  deviceId     String   // UDID del dispositivo
  pushToken    String   // Token APNs
  passTypeId   String   // pass.com.venusbeauty.loyalty
  serialNumber String   // cardId o cardId-massage
  @@unique([deviceId, passTypeId, serialNumber])
}
```

### Historial de actualizaciones Apple

```prisma
model AppleUpdate {
  serialNumber String   // cardId
  updatedAt    DateTime // Usado para passesUpdatedSince
}
```

### Dispositivos Google

```prisma
model GoogleDevice {
  cardId    String
  objectId  String
}
```

---

## Variables de entorno requeridas

### Apple Wallet
```
APPLE_PASS_TYPE_ID    = pass.com.venusbeauty.loyalty
APPLE_TEAM_ID         = XXXXXXXXXX
APPLE_PASS_CERT       = ./certs/signerCert.pem   (o APPLE_CERT_PEM base64)
APPLE_PASS_KEY        = ./certs/signerKey.pem     (o APPLE_KEY_PEM base64)
APPLE_WWDR            = ./wwdr_rsa.pem            (o APPLE_WWDR_PEM base64)
APPLE_PASS_PHRASE     = (opcional, passphrase del key)
APPLE_AUTH_TOKEN      = (token hex para webServiceURL)
APPLE_KEY_ID          = (APNs Key ID)
APPLE_APNS_KEY_BASE64 = (base64 del .p8 APNs key)
BASE_URL              = https://venus-loyalty.onrender.com
```

### Google Wallet
```
GOOGLE_ISSUER_ID      = 3388000000XXXXXXXXX
GOOGLE_SA_EMAIL       = xxx@xxx.iam.gserviceaccount.com
GOOGLE_SA_PRIVATE_KEY = -----BEGIN RSA PRIVATE KEY-----\n...
GOOGLE_SA_JSON        = (path a service account JSON, fallback)
```

### Negocio
```
BUSINESS_LATITUDE     = 20.3880
BUSINESS_LONGITUDE    = -99.9960
```

---

## Manejo de errores

- **APNs 410 (BadDeviceToken):** Auto-elimina el dispositivo del registro
- **Google 404 (object not found):** Crea el objeto automaticamente
- **Certificados faltantes:** Error claro con nombres de env vars
- **"Zombie passes":** Permite desregistro aunque el token sea invalido (evita loops de retry de Apple)
- **Race conditions:** Se resta 2 segundos al comparar `passesUpdatedSince`
