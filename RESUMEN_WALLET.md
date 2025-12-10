# Documentación de Integración: Google & Apple Wallet

Este documento detalla los métodos y el código utilizado para la implementación de tarjetas de lealtad en **Google Wallet** y **Apple Wallet**, incluyendo la lógica para la actualización dinámica de sellos (stamps).

## 1. Google Wallet
La integración con Google Wallet se realiza mediante la **Google Wallet API (REST)**. No se utiliza una librería oficial de cliente, sino llamadas HTTP directas autenticadas con JWT (Service Account).

**Archivo Principal:** `lib/google.js`

### Autenticación
Se utiliza una cuenta de servicio (Service Account) para firmar tokens JWT.
```javascript
export async function getWalletAccessToken() {
  const creds = loadServiceAccount();
  // ... creación del claimSet ...
  const assertion = jwt.sign(claimSet, creds.private_key, { algorithm: "RS256" });
  
  // Intercambio de JWT por Access Token de Google
  const resp = await fetch("https://oauth2.googleapis.com/token", { ... });
  return json.access_token;
}
```

### Clase de Lealtad (Plantilla)
Define el diseño general de la tarjeta (Logo, colores, textos). Se crea una única vez.
```javascript
const LOYALTY_CLASS_ID = "3388000000023035846.venus_loyalty_v1";

export async function createLoyaltyClass() {
    // ... define colores, logo, textos fijos ...
    const loyaltyClass = {
      id: LOYALTY_CLASS_ID,
      issuerName: "Venus Cosmetología",
      programName: "Venus Lealtad",
      hexBackgroundColor: "#9A9F82",
      // ...
    };
    // POST https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass
}
```

### Objeto de Lealtad (Tarjeta de Usuario) y Sellos
Para cada usuario se crea un "Objeto" vinculado a la "Clase". Aquí es donde se actualizan los sellos dinámicamente.
El método `updateLoyaltyObject` maneja tanto la **creación** como la **actualización**.

**Lógica de Sellos:**
- `loyaltyPoints`: Muestra el número entero de sellos.
- `secondaryLoyaltyPoints`: Muestra el texto "X/8".
- `imageModulesData`: Muestra la imagen visual de la tira de sellos (`stamp-strip-X.png`).

```javascript
export async function updateLoyaltyObject(cardId, name, stamps, max) {
    const objectId = `${issuerId}.${safeCardId}`;

    const loyaltyObject = {
      // ...
      loyaltyPoints: {
        balance: { int: stamps },
        label: "SELLOS",
      },
      secondaryLoyaltyPoints: {
        balance: { string: `${stamps}/${max}` },
        label: "Progreso",
      },
      // Imagen dinámica basada en el número de sellos
      imageModulesData: [
        {
          id: "stamp_progress",
          mainImage: {
            sourceUri: {
              uri: `${baseUrl}/assets/stamp-strip-${stamps}.png`, // <--- LÓGICA DE IMAGEN
            },
          },
        },
      ],
      // ...
    };

    // PUT https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/{objectId}
}
```

### Botón "Guardar en Google Wallet"
Genera un enlace profundo (Deep Link) firmado con JWT que permite al usuario guardar la tarjeta desde la web.
```javascript
export function buildGoogleSaveUrl({ cardId, name, stamps, max }) {
    // ... Construye payload con el objeto de lealtad completo ...
    const token = jwt.sign(payload, creds.private_key, { algorithm: "RS256" });
    return `https://pay.google.com/gp/v/save/${token}`;
}
```

---

## 2. Apple Wallet
La integración con Apple Wallet genera archivos `.pkpass` firmados digitalmente.
**Librería:** `passkit-generator`

**Archivo Principal:** `lib/apple.js`

### Generación del Pase (.pkpass)
La función principal `buildApplePassBuffer` orquesta la creación del pase.

1.  **Certificados:** Lee los certificados `.pem` (Signer Cert, Key, WWDR).
2.  **Modelo:** Construye la estructura JSON (`pass.json`) y copia los assets.
3.  **Firma:** Genera el archivo final firmado.

```javascript
export async function buildApplePassBuffer({ cardId, name, stamps, max, ... }) {
    // 1. Cargar certificados
    const signerCertPem = readPemString(...);
    // ...

    // 2. Crear directorio temporal con el modelo
    const model = buildTempModelDir({ ... });

    // 3. Crear instancia de PKPass y añadir assets
    const pass = await PassClass.from({ model, certificates: certs }, ...);
    
    // ... lógica de assets ...
    
    return await exportPassToBuffer(pass);
}
```

### Lógica de Sellos (Stamps)
En Apple Wallet, los sellos se representan visualmente mediante una imagen dinámica (`strip.png`) y campos de texto.

```javascript
// Dentro de buildApplePassBuffer:

const safeMax = Number(max) || 8;
const safeStamps = Math.max(0, Math.min(Number(stamps) || 0, safeMax));

// Selecciona la imagen correspondiente al número de sellos
const stripFile = path.join(assetsDir, `stamp-strip-${safeStamps}.png`);

if (fs.existsSync(stripFile)) {
    const buf = fs.readFileSync(stripFile);
    pass.addBuffer("strip.png", buf); // <--- Imagen principal del pase
    // ... versión @2x ...
}
```

### Estructura del `pass.json`
El archivo `pass.json` define los campos de texto que se muestran sobre la tarjeta.

```javascript
function buildTempModelDir({ ... }) {
  // ...
  const passJson = {
    // ...
    storeCard: {
      secondaryFields: [
        {
          key: "balance",
          label: "SELLOS",
          value: `${stamps} de ${max}`, // <--- Texto de progreso
        },
      ],
      // ...
    },
    // ...
  };
  // ...
}
```

## 3. Resumen de Archivos y Recursos

| Componente | Archivo / Recurso | Descripción |
| :--- | :--- | :--- |
| **Google Logic** | `lib/google.js` | Autenticación, creación de clases y objetos, generación de JWT para guardar. |
| **Apple Logic** | `lib/apple.js` | Generación de .pkpass, gestión de certificados y assets. |
| **Imágenes** | `public/assets/stamp-strip-{N}.png` | Imágenes de progreso (0 a 8 sellos) usadas por ambas wallets. |
| **Iconos** | `public/assets/logo.png`, `icon.png` | Logos usados para la identidad de la tarjeta. |
