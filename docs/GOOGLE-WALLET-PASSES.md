# Google Wallet - Creacion y Actualizacion de Pases

Guia completa para implementar pases de lealtad en Google Wallet con actualizaciones en tiempo real y notificaciones push.

---

## Indice

1. [Como funciona](#1-como-funciona)
2. [Configuracion inicial](#2-configuracion-inicial)
3. [Autenticacion](#3-autenticacion)
4. [Loyalty Class (plantilla)](#4-loyalty-class)
5. [Loyalty Object (pase individual)](#5-loyalty-object)
6. [Generar link "Save to Google Wallet"](#6-generar-link-save-to-google-wallet)
7. [Actualizar pases](#7-actualizar-pases)
8. [Notificaciones push](#8-notificaciones-push)
9. [Endpoints del servidor](#9-endpoints-del-servidor)
10. [Troubleshooting](#10-troubleshooting)
11. [Checklist](#11-checklist)

---

## 1. Como funciona

A diferencia de Apple Wallet (que usa un sistema pull), Google Wallet usa **actualizacion directa via API**:

```
┌─────────┐  PUT /loyaltyObject/{id}  ┌──────────────┐
│ Servidor │ ────────────────────────► │ Google Cloud  │
└─────────┘                            └──────────────┘
                                             │
                                  Actualiza el pase
                                      en tiempo real
                                             │
                                             ▼
                                       ┌──────────┐
                                       │ Android   │
                                       │ (Wallet)  │
                                       └──────────┘
```

**Ventaja:** No necesitas que el dispositivo "pida" el pase nuevo. Tu servidor actualiza el objeto directamente en Google y el cambio se refleja automaticamente.

### Conceptos clave

| Concepto | Que es | Ejemplo |
|----------|--------|---------|
| **Issuer ID** | Tu ID de emisor en Google Pay | `3388000000023035846` |
| **Loyalty Class** | La plantilla del pase (colores, logo, nombre del programa) | `{issuerId}.venus_loyalty_v1` |
| **Loyalty Object** | Un pase individual de un cliente | `{issuerId}.card_1712345678` |
| **Service Account** | Cuenta de servicio para autenticacion API | `xxx@yyy.iam.gserviceaccount.com` |

---

## 2. Configuracion inicial

### 2.1 Crear cuenta en Google Pay & Wallet Console

1. Ve a [Google Pay & Wallet Console](https://pay.google.com/business/console)
2. Crea una cuenta de emisor (Issuer)
3. Anota tu **Issuer ID** (numero largo tipo `3388000000XXXXXXXXX`)

### 2.2 Crear Service Account

1. Ve a [Google Cloud Console](https://console.cloud.google.com)
2. Crea un proyecto (o usa uno existente)
3. Habilita la **Google Wallet API**
4. Ve a IAM > Service Accounts > Create
5. Descarga el JSON de credenciales
6. En Google Pay Console, agrega el email de la service account como **usuario autorizado**

### 2.3 Variables de entorno

```env
# ID del emisor (de Google Pay Console)
GOOGLE_ISSUER_ID=3388000000XXXXXXXXX

# Service Account (opcion A: variables individuales)
GOOGLE_SA_EMAIL=wallet@tu-proyecto.iam.gserviceaccount.com
GOOGLE_SA_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----"

# Service Account (opcion B: archivo JSON)
GOOGLE_SA_JSON=./secrets/google-sa.json

# URL base de tu servidor (para QR codes y links)
BASE_URL=https://tudominio.com
```

> **Nota:** Si usas ambas opciones, las variables individuales tienen prioridad sobre el archivo JSON.

---

## 3. Autenticacion

### 3.1 Cargar credenciales

```javascript
function loadServiceAccount() {
  // Opcion A: Variables de entorno
  if (process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_SA_EMAIL,
      private_key: process.env.GOOGLE_SA_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }

  // Opcion B: Archivo JSON
  const saPath = process.env.GOOGLE_SA_JSON || './secrets/google-sa.json';
  const raw = fs.readFileSync(saPath, 'utf8');
  return JSON.parse(raw);
}
```

### 3.2 Obtener access token (OAuth2 JWT)

Google Wallet API usa OAuth2 con JWT assertion. Tu servidor genera un JWT firmado con la key privada de la service account.

```javascript
import jwt from 'jsonwebtoken';

async function getWalletAccessToken() {
  const sa = loadServiceAccount();

  // Crear JWT assertion
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,  // 1 hora
    },
    sa.private_key,
    { algorithm: 'RS256' }
  );

  // Intercambiar por access token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const data = await res.json();
  return data.access_token;
}
```

---

## 4. Loyalty Class (plantilla)

La clase define la **apariencia general** del pase: colores, logo, nombre del programa. Se crea una vez y todos los pases individuales la heredan.

### 4.1 Estructura de la clase

```javascript
const loyaltyClass = {
  id: `${ISSUER_ID}.venus_loyalty_v1`,
  issuerName: 'Venus Cosmetologia',
  programName: 'Programa de Lealtad',
  programLogo: {
    sourceUri: {
      uri: `${BASE_URL}/assets/logo.png`,
    },
    contentDescription: {
      defaultValue: { language: 'es', value: 'Venus Logo' },
    },
  },
  // Colores del pase
  hexBackgroundColor: '#9A9F82',  // Verde Venus
  // Pais
  countryCode: 'MX',
  // Review status
  reviewStatus: 'UNDER_REVIEW',
  // Mensaje de bienvenida
  wordMark: {
    sourceUri: { uri: `${BASE_URL}/assets/logo.png` },
    contentDescription: {
      defaultValue: { language: 'es', value: 'Venus' },
    },
  },
  // Hero image (imagen grande arriba del pase)
  heroImage: {
    sourceUri: { uri: `${BASE_URL}/assets/hero.png` },
    contentDescription: {
      defaultValue: { language: 'es', value: 'Venus Banner' },
    },
  },
  // Ubicaciones (para notificaciones de proximidad)
  locations: [
    {
      latitude: 20.3880,
      longitude: -99.9960,
    },
  ],
  // Textos informativos
  textModulesData: [
    {
      header: 'Bienvenida',
      body: 'Completa tus sellos y gana un facial gratis.',
      id: 'welcome',
    },
  ],
  // Links
  linksModuleData: {
    uris: [
      {
        uri: `${BASE_URL}`,
        description: 'Visitar Venus',
        id: 'website',
      },
    ],
  },
};
```

### 4.2 Crear la clase

```javascript
async function createLoyaltyClass() {
  const token = await getWalletAccessToken();
  const classId = `${ISSUER_ID}.venus_loyalty_v1`;

  // Verificar si ya existe
  const checkRes = await fetch(
    `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${classId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (checkRes.status === 200) {
    console.log('Clase ya existe, actualizando...');
    // PUT para actualizar
    await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${classId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loyaltyClass),
      }
    );
    return;
  }

  // POST para crear nueva
  const res = await fetch(
    'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(loyaltyClass),
    }
  );

  const data = await res.json();
  console.log('Clase creada:', data.id);
}
```

---

## 5. Loyalty Object (pase individual)

Cada cliente tiene su propio objeto con sus datos personales, sellos, QR, etc.

### 5.1 Estructura del objeto

```javascript
function buildLoyaltyObject(cardId, name, stamps, max) {
  const ISSUER_ID = process.env.GOOGLE_ISSUER_ID;
  const safeId = cardId.replace(/[^a-zA-Z0-9._+-]/g, '_');
  const objectId = `${ISSUER_ID}.${safeId}`;

  return {
    id: objectId,
    classId: `${ISSUER_ID}.venus_loyalty_v1`,
    state: 'ACTIVE',

    // Identificacion del cliente
    accountId: cardId,
    accountName: name,

    // Puntos/sellos principales
    loyaltyPoints: {
      balance: { int: stamps },
      label: 'SELLOS',
    },

    // Puntos secundarios (progreso visual)
    secondaryLoyaltyPoints: {
      balance: { string: `${stamps}/${max}` },
      label: 'Progreso',
    },

    // Codigo QR
    barcode: {
      type: 'QR_CODE',
      value: cardId,
      alternateText: cardId,
    },

    // Textos
    textModulesData: [
      {
        id: 'customer_name',
        header: 'Cliente',
        body: name,
      },
      {
        id: 'program_info',
        header: 'PROGRAMA',
        body: 'Lealtad Venus',
      },
    ],

    // Imagen de progreso (strip con sellos)
    imageModulesData: [
      {
        id: 'stamp_progress',
        mainImage: {
          sourceUri: {
            uri: `${process.env.BASE_URL}/assets/stamp-strip-${stamps}.png`,
          },
          contentDescription: {
            defaultValue: {
              language: 'es',
              value: `${stamps} de ${max} sellos`,
            },
          },
        },
      },
    ],

    // Links
    linksModuleData: {
      uris: [
        {
          uri: `${process.env.BASE_URL}/card/${cardId}`,
          description: 'Ver mi tarjeta',
          id: 'card_link',
        },
      ],
    },
  };
}
```

### 5.2 Crear o actualizar el objeto

```javascript
async function updateLoyaltyObject(cardId, name, stamps, max) {
  const token = await getWalletAccessToken();
  const ISSUER_ID = process.env.GOOGLE_ISSUER_ID;
  const safeId = cardId.replace(/[^a-zA-Z0-9._+-]/g, '_');
  const objectId = `${ISSUER_ID}.${safeId}`;

  const loyaltyObject = buildLoyaltyObject(cardId, name, stamps, max);

  // Intentar actualizar (PUT)
  const putRes = await fetch(
    `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(loyaltyObject),
    }
  );

  if (putRes.status === 200) {
    console.log(`Google Wallet actualizado: ${objectId}`);
    return;
  }

  if (putRes.status === 404) {
    // No existe, crear (POST)
    const postRes = await fetch(
      'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loyaltyObject),
      }
    );
    console.log(`Google Wallet creado: ${objectId}`);
  }
}
```

---

## 6. Generar link "Save to Google Wallet"

El link permite al cliente agregar el pase a su Google Wallet con un click.

### 6.1 Estructura del JWT

```javascript
import jwt from 'jsonwebtoken';

function buildGoogleSaveUrl(cardId, name, stamps, max) {
  const sa = loadServiceAccount();
  const loyaltyObject = buildLoyaltyObject(cardId, name, stamps, max);

  // Construir JWT
  const claims = {
    iss: sa.client_email,
    aud: 'google',
    typ: 'savetowallet',
    origins: [process.env.BASE_URL],
    payload: {
      loyaltyObjects: [loyaltyObject],
    },
  };

  // Firmar con RS256
  const token = jwt.sign(claims, sa.private_key, { algorithm: 'RS256' });

  // URL final
  return `https://pay.google.com/gp/v/save/${token}`;
}
```

### 6.2 Uso en el frontend

```html
<!-- Boton oficial de Google Wallet -->
<a href="https://pay.google.com/gp/v/save/{JWT_TOKEN}">
  <img src="https://lh3.googleusercontent.com/..."
       alt="Agregar a Google Wallet"
       style="height:48px;" />
</a>
```

### 6.3 Endpoint del servidor

```javascript
// GET /api/save-card?cardId=xxx&name=Maria&stamps=3&max=8
app.get('/api/save-card', async (req, res) => {
  const { cardId, name, stamps, max } = req.query;
  const url = buildGoogleSaveUrl(cardId, name, Number(stamps), Number(max));
  res.json({ success: true, url });
});
```

---

## 7. Actualizar pases

### 7.1 Cuando actualizar

| Evento | Que cambiar | Funcion |
|--------|-------------|---------|
| Nuevo sello | `stamps + 1`, imagen strip | `updateLoyaltyObject()` |
| Canjear recompensa | `stamps = 0`, imagen strip | `updateLoyaltyObject()` |
| Cambio de nombre | `accountName`, texto | `updateLoyaltyObject()` |
| Notificacion | Agregar mensaje | `sendGoogleMessage()` |

### 7.2 Flujo de actualizacion

```javascript
// En tu endpoint de agregar sello:
app.post('/api/admin/stamp', async (req, res) => {
  const { cardId } = req.body;

  // 1. Actualizar DB
  const card = await db.card.update({
    where: { id: cardId },
    data: { stamps: { increment: 1 } },
  });

  // 2. Actualizar Google Wallet (inmediato)
  await updateLoyaltyObject(cardId, card.name, card.stamps, card.max);
  //    ↑ PUT al API de Google — el pase cambia en el telefono al instante

  // 3. Actualizar Apple Wallet (push + pull)
  await notifyAppleCardUpdate(cardId);

  res.json({ success: true });
});
```

### 7.3 Sanitizacion del ID

Google Wallet solo acepta caracteres alfanumericos, punto, guion bajo y signo mas/menos en los IDs:

```javascript
const safeId = cardId.replace(/[^a-zA-Z0-9._+-]/g, '_');
const objectId = `${ISSUER_ID}.${safeId}`;
```

---

## 8. Notificaciones push

Google Wallet permite enviar **mensajes visibles** directamente al pase sin regenerarlo.

### 8.1 Enviar mensaje a un pase

```javascript
async function sendGoogleMessage(cardId, title, body) {
  const token = await getWalletAccessToken();
  const ISSUER_ID = process.env.GOOGLE_ISSUER_ID;
  const safeId = cardId.replace(/[^a-zA-Z0-9._+-]/g, '_');
  const objectId = `${ISSUER_ID}.${safeId}`;

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  const now = new Date();
  const endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h

  const payload = {
    message: {
      header: title,
      body: body,
      id: messageId,
      messageType: 'TEXT',
      displayInterval: {
        start: { date: now.toISOString() },
        end: { date: endTime.toISOString() },
      },
    },
  };

  const res = await fetch(
    `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}/addMessage`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (res.status === 200) {
    console.log(`Mensaje enviado a ${objectId}`);
    return true;
  }

  if (res.status === 404) {
    console.log(`Objeto ${objectId} no existe en Google Wallet`);
    return false;
  }

  throw new Error(`Google Wallet message error: ${res.status}`);
}
```

### 8.2 Envio masivo

```javascript
async function sendMassNotification(title, body) {
  const cards = await db.card.findMany({
    where: { status: 'active' },
  });

  let sent = 0, failed = 0;

  for (const card of cards) {
    try {
      await sendGoogleMessage(card.id, title, body);
      sent++;
    } catch (err) {
      failed++;
    }
    // Rate limiting: 150ms entre envios
    await new Promise(r => setTimeout(r, 150));
  }

  return { total: cards.length, sent, failed };
}
```

---

## 9. Endpoints del servidor

### Endpoints de configuracion

```javascript
// Crear la clase (ejecutar una vez)
app.get('/api/google/create-class', adminAuth, async (req, res) => {
  await createLoyaltyClass();
  res.json({ success: true });
});

// Diagnostico (verificar configuracion)
app.get('/api/google/diagnostics', adminAuth, async (req, res) => {
  const sa = loadServiceAccount();
  res.json({
    issuerIdSet: !!process.env.GOOGLE_ISSUER_ID,
    serviceAccountEmail: sa?.client_email || 'NOT SET',
    privateKeySet: !!sa?.private_key,
  });
});
```

### Endpoints publicos

```javascript
// Generar link de guardado
app.get('/api/save-card', async (req, res) => {
  const { cardId, name, stamps, max } = req.query;
  const url = buildGoogleSaveUrl(cardId, name, Number(stamps), Number(max));
  res.json({ success: true, url });
});
```

### Endpoints de admin

```javascript
// Agregar sello (actualiza Google + Apple)
app.post('/api/admin/stamp', adminAuth, async (req, res) => {
  // ... actualizar DB ...
  await updateLoyaltyObject(cardId, name, newStamps, max);
});

// Push masivo
app.post('/api/admin/push-notification', adminAuth, async (req, res) => {
  const { title, message } = req.body;
  const result = await sendMassNotification(title, message);
  res.json({ success: true, ...result });
});
```

### Endpoints de debug

```javascript
// Test de notificacion
app.post('/api/debug/test-google-push', async (req, res) => {
  const { cardId } = req.body;
  await sendGoogleMessage(cardId, 'Test', 'Notificacion de prueba');
  res.json({ success: true });
});

// Verificar estado de la clase
app.get('/api/debug/google-class', async (req, res) => {
  const status = await checkLoyaltyClass();
  res.json(status);
});
```

---

## 10. Troubleshooting

### "Object not found" al actualizar

- El objeto no se creo todavia (el cliente nunca agrego el pase)
- Solucion: usar la logica create-or-update (POST si 404, PUT si existe)

```javascript
async function ensureGoogleWalletObject(cardId, cardData) {
  const token = await getWalletAccessToken();
  const objectId = `${ISSUER_ID}.${safeId}`;

  const checkRes = await fetch(
    `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (checkRes.status === 404) {
    // Crear
    await fetch('...loyaltyObject', { method: 'POST', body: object });
  } else {
    // Actualizar
    await fetch(`...loyaltyObject/${objectId}`, { method: 'PUT', body: object });
  }
}
```

### "403 Forbidden"

- La service account no tiene permisos en Google Pay Console
- Ve a Google Pay Console > Users > Agrega el email de la service account

### "Class not found"

- La clase no se ha creado todavia
- Ejecuta `GET /api/google/create-class` primero

### La imagen del strip no se actualiza

- Google cachea imagenes. Agrega un query parameter unico:
```javascript
uri: `${BASE_URL}/assets/stamp-strip-${stamps}.png?v=${Date.now()}`
```

### El pase no aparece en Google Wallet

- Verifica que el `reviewStatus` de la clase sea `UNDER_REVIEW` o `APPROVED`
- Verifica que `state` del objeto sea `ACTIVE`
- El link JWT debe estar firmado con la key correcta

### Error de firma JWT

- La private key debe tener los `\n` correctos (no literales)
- Usa `.replace(/\\n/g, '\n')` al leer de variables de entorno

---

## 11. Checklist

### Configuracion
- [ ] Crear cuenta en [Google Pay & Wallet Console](https://pay.google.com/business/console)
- [ ] Anotar el **Issuer ID**
- [ ] Habilitar **Google Wallet API** en Google Cloud Console
- [ ] Crear **Service Account** y descargar JSON
- [ ] Agregar service account como usuario en Google Pay Console
- [ ] Configurar variables de entorno (`GOOGLE_ISSUER_ID`, `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`)

### Implementacion
- [ ] Implementar `loadServiceAccount()` (leer credenciales)
- [ ] Implementar `getWalletAccessToken()` (OAuth2 JWT assertion)
- [ ] Implementar `createLoyaltyClass()` (plantilla del pase)
- [ ] Implementar `buildLoyaltyObject()` (estructura del pase individual)
- [ ] Implementar `updateLoyaltyObject()` (crear/actualizar pase)
- [ ] Implementar `buildGoogleSaveUrl()` (link de guardado con JWT)
- [ ] Implementar `sendGoogleMessage()` (notificaciones)

### Integracion
- [ ] Crear clase ejecutando `/api/google/create-class`
- [ ] Generar link de guardado al crear tarjeta de cliente
- [ ] Llamar `updateLoyaltyObject()` al agregar sello
- [ ] Llamar `updateLoyaltyObject()` al canjear recompensa
- [ ] Implementar push masivo para notificaciones

### Assets
- [ ] `logo.png` — Logo del negocio (cuadrado, PNG)
- [ ] `hero.png` — Banner horizontal (1032x336 recomendado)
- [ ] `stamp-strip-{N}.png` — Imagenes de progreso (ver [APPLE-WALLET-STRIPS.md](APPLE-WALLET-STRIPS.md))

### Verificacion
- [ ] Diagnostico: `GET /api/google/diagnostics` retorna todo OK
- [ ] Clase existe: `GET /api/debug/google-class` retorna datos
- [ ] Link funciona: abrir URL de guardado agrega pase al telefono
- [ ] Actualizacion: agregar sello cambia el pase en el telefono
- [ ] Mensaje: notificacion push llega al dispositivo

---

## Diferencias clave: Google vs Apple Wallet

| Aspecto | Google Wallet | Apple Wallet |
|---------|---------------|--------------|
| Actualizacion | Directa via API (PUT) | Indirecta via push + pull |
| Velocidad | Instantanea | 5-30 segundos |
| Notificaciones | `addMessage` al objeto | APNs push |
| Autenticacion | Service Account (OAuth2) | Certificados + JWT |
| Registro dispositivo | No necesario | Requiere web service |
| Formato del pase | JSON via API | Archivo .pkpass firmado |
| Link de guardado | JWT firmado → URL | Archivo .pkpass descargable |

---

## API Reference

| Endpoint | Metodo | Uso |
|----------|--------|-----|
| `walletobjects/v1/loyaltyClass` | POST | Crear clase |
| `walletobjects/v1/loyaltyClass/{id}` | GET | Obtener clase |
| `walletobjects/v1/loyaltyClass/{id}` | PUT | Actualizar clase |
| `walletobjects/v1/loyaltyObject` | POST | Crear objeto |
| `walletobjects/v1/loyaltyObject/{id}` | GET | Obtener objeto |
| `walletobjects/v1/loyaltyObject/{id}` | PUT | Actualizar objeto |
| `walletobjects/v1/loyaltyObject/{id}/addMessage` | POST | Enviar mensaje |
| `pay.google.com/gp/v/save/{JWT}` | GET | Link de guardado |

Base URL: `https://walletobjects.googleapis.com`

> Documentacion oficial: [Google Wallet for Developers](https://developers.google.com/wallet/loyalty)
