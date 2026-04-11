# Apple Wallet - Guia de Strip Images

Guia para crear las imagenes de strip (barra visual de progreso) para pases de Apple Wallet tipo `storeCard`.

---

## Que es el Strip?

El **strip** es la imagen principal que aparece en el centro del pase de Apple Wallet. En pases de lealtad/membresia se usa para mostrar visualmente el progreso del cliente (sellos, sesiones, etc.).

```
┌─────────────────────────────┐
│  Logo    Venus Cosmetologia │  ← Header
├─────────────────────────────┤
│                             │
│   ● ● ● ● ○ ○ ○ ○         │  ← STRIP IMAGE (aqui va)
│                             │
├─────────────────────────────┤
│  CLIENTE: Maria Lopez       │  ← Secondary Fields
│  SELLOS:  4 de 8            │
├─────────────────────────────┤
│  PROGRAMA: Lealtad Venus    │  ← Auxiliary Fields
└─────────────────────────────┘
```

---

## Dimensiones Requeridas

| Archivo | Dimensiones | Uso |
|---------|-------------|-----|
| `strip.png` | **375 x 120 px** | Pantallas 1x (legacy) |
| `strip@2x.png` | **750 x 240 px** | Pantallas Retina (la mayoria) |
| `strip@3x.png` | **1125 x 360 px** | iPhone Plus/Max (opcional) |

> Apple recomienda trabajar en **@2x** (750x240) como formato principal y reducir para 1x.

### Formato
- **PNG** con transparencia (RGBA) o fondo solido
- Fondo transparente se mezcla con el `backgroundColor` del pase
- Fondo solido se muestra tal cual

---

## Nomenclatura de Archivos

Cada nivel de progreso necesita su propia imagen. La convencion de nombre es:

```
{prefijo}-{N}.png        ← version 1x
{prefijo}-{N}@2x.png     ← version 2x (Retina)
```

### Ejemplos

**Tarjeta de lealtad (8 sellos max):**
```
public/assets/
├── stamp-strip-0.png       ← 0 sellos (todos vacios)
├── stamp-strip-0@2x.png
├── stamp-strip-1.png       ← 1 sello lleno
├── stamp-strip-1@2x.png
├── stamp-strip-2.png       ← 2 sellos llenos
├── stamp-strip-2@2x.png
│   ...
├── stamp-strip-8.png       ← 8 sellos (todos llenos!)
└── stamp-strip-8@2x.png
```

**Membresia de masajes (10 sesiones max):**
```
public/assets/
├── massage-strip-0.png
├── massage-strip-0@2x.png
│   ...
├── massage-strip-10.png
└── massage-strip-10@2x.png
```

---

## Como Disenarlos

### Opcion 1: Figma / Canva (Manual)

1. Crea un frame de **750 x 240 px**
2. Coloca los indicadores de progreso (circulos, iconos, barras) en fila
3. Disena la version con 0 progreso (todos vacios/apagados)
4. Duplica y ve llenando de izquierda a derecha
5. Exporta cada variante como PNG:
   - `{prefijo}-{N}@2x.png` a 750x240
   - `{prefijo}-{N}.png` a 375x120

**Tips de diseno:**
- Deja margenes laterales de ~40px
- Los indicadores deben ser visibles sobre el color de fondo del pase
- Usa contraste alto (blanco sobre oscuro o viceversa)
- Iconos/circulos de ~40-50px de diametro funcionan bien
- Centra verticalmente los elementos

### Opcion 2: Script con Node.js + Canvas

```javascript
// generate-strips.js
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';

const PREFIX = 'stamp-strip';      // Cambiar por tu prefijo
const MAX_STAMPS = 8;              // Total de sellos/sesiones
const OUTPUT_DIR = './public/assets';

const WIDTH_2X = 750;
const HEIGHT_2X = 240;
const WIDTH_1X = 375;
const HEIGHT_1X = 120;

const CIRCLE_RADIUS = 22;
const CIRCLE_GAP = 16;
const ACTIVE_COLOR = '#ffffff';
const INACTIVE_COLOR = 'rgba(255, 255, 255, 0.2)';
const ACTIVE_BORDER = 'rgba(255, 255, 255, 0.8)';
const INACTIVE_BORDER = 'rgba(255, 255, 255, 0.15)';

async function generateStrip(filled, max) {
  const canvas = createCanvas(WIDTH_2X, HEIGHT_2X);
  const ctx = canvas.getContext('2d');

  // Fondo transparente (usa el backgroundColor del pase)
  ctx.clearRect(0, 0, WIDTH_2X, HEIGHT_2X);

  // Calcular posiciones
  const totalWidth = max * (CIRCLE_RADIUS * 2) + (max - 1) * CIRCLE_GAP;
  const startX = (WIDTH_2X - totalWidth) / 2 + CIRCLE_RADIUS;
  const centerY = HEIGHT_2X / 2;

  for (let i = 0; i < max; i++) {
    const x = startX + i * (CIRCLE_RADIUS * 2 + CIRCLE_GAP);
    const isActive = i < filled;

    // Circulo
    ctx.beginPath();
    ctx.arc(x, centerY, CIRCLE_RADIUS, 0, Math.PI * 2);

    if (isActive) {
      ctx.fillStyle = ACTIVE_COLOR;
      ctx.fill();
      ctx.strokeStyle = ACTIVE_BORDER;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Checkmark dentro del circulo activo
      ctx.beginPath();
      ctx.strokeStyle = '#2d3a2d'; // Color del check
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(x - 8, centerY);
      ctx.lineTo(x - 2, centerY + 7);
      ctx.lineTo(x + 10, centerY - 6);
      ctx.stroke();
    } else {
      ctx.fillStyle = INACTIVE_COLOR;
      ctx.fill();
      ctx.strokeStyle = INACTIVE_BORDER;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Guardar @2x
  const buf2x = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(OUTPUT_DIR, `${PREFIX}-${filled}@2x.png`), buf2x);

  // Redimensionar y guardar 1x
  const canvas1x = createCanvas(WIDTH_1X, HEIGHT_1X);
  const ctx1x = canvas1x.getContext('2d');
  ctx1x.drawImage(canvas, 0, 0, WIDTH_1X, HEIGHT_1X);
  const buf1x = canvas1x.toBuffer('image/png');
  fs.writeFileSync(path.join(OUTPUT_DIR, `${PREFIX}-${filled}.png`), buf1x);

  console.log(`✅ ${PREFIX}-${filled}.png (${WIDTH_1X}x${HEIGHT_1X}) + @2x (${WIDTH_2X}x${HEIGHT_2X})`);
}

// Generar todas las variantes
async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (let i = 0; i <= MAX_STAMPS; i++) {
    await generateStrip(i, MAX_STAMPS);
  }
  console.log(`\n🎉 ${MAX_STAMPS + 1} strips generados en ${OUTPUT_DIR}/`);
}

main();
```

**Instalar dependencia:**
```bash
npm install canvas
```

**Ejecutar:**
```bash
node generate-strips.js
```

### Opcion 3: Script con ImageMagick (CLI)

```bash
#!/bin/bash
PREFIX="stamp-strip"
MAX=8
DIR="./public/assets"

for i in $(seq 0 $MAX); do
  # Crear canvas base 750x240 transparente
  CMD="convert -size 750x240 xc:transparent"

  # Calcular posiciones
  TOTAL_W=$(( MAX * 50 + (MAX - 1) * 16 ))
  START_X=$(( (750 - TOTAL_W) / 2 + 25 ))
  CENTER_Y=120

  for j in $(seq 0 $((MAX - 1))); do
    X=$(( START_X + j * 66 ))
    X1=$(( X - 22 ))
    Y1=$(( CENTER_Y - 22 ))
    X2=$(( X + 22 ))
    Y2=$(( CENTER_Y + 22 ))

    if [ $j -lt $i ]; then
      # Sello activo (circulo blanco)
      CMD="$CMD -fill white -stroke 'rgba(255,255,255,0.8)' -strokewidth 2 -draw 'circle $X,$CENTER_Y $X2,$CENTER_Y'"
    else
      # Sello inactivo (circulo transparente con borde)
      CMD="$CMD -fill 'rgba(255,255,255,0.15)' -stroke 'rgba(255,255,255,0.3)' -strokewidth 1 -draw 'circle $X,$CENTER_Y $X2,$CENTER_Y'"
    fi
  done

  # Guardar @2x
  eval "$CMD $DIR/${PREFIX}-${i}@2x.png"

  # Guardar 1x (reducir)
  convert "$DIR/${PREFIX}-${i}@2x.png" -resize 375x120 "$DIR/${PREFIX}-${i}.png"

  echo "✅ ${PREFIX}-${i}.png generado"
done
```

---

## Integracion con el Codigo

### Estructura de archivos requerida

```
public/assets/
├── logo.png                    ← Logo del negocio (cuadrado, ~160x160)
├── stamp.png                   ← Icono de sello individual (opcional)
├── stamp-strip-0.png           ← Strips de lealtad
├── stamp-strip-0@2x.png
├── ...
├── stamp-strip-{MAX}.png
├── stamp-strip-{MAX}@2x.png
├── massage-strip-0.png         ← Strips de masaje (si aplica)
├── massage-strip-0@2x.png
├── ...
├── massage-strip-{MAX}.png
└── massage-strip-{MAX}@2x.png
```

### Codigo en lib/apple.js

La seleccion del strip se hace automaticamente segun el `cardType`:

```javascript
// Determinar prefijo segun tipo de tarjeta
const stripPrefix = cardType === 'massage' ? 'massage-strip' : 'stamp-strip';

// Seleccionar imagen segun cantidad de sellos/sesiones actuales
const safeStamps = Math.max(0, Math.min(Number(stamps) || 0, max));
const stripFile = path.join(assetsDir, `${stripPrefix}-${safeStamps}.png`);

// Agregar al pase
if (fs.existsSync(stripFile)) {
  pass.addBuffer("strip.png", fs.readFileSync(stripFile));

  const strip2xFile = path.join(assetsDir, `${stripPrefix}-${safeStamps}@2x.png`);
  if (fs.existsSync(strip2xFile)) {
    pass.addBuffer("strip@2x.png", fs.readFileSync(strip2xFile));
  }
}
```

### Para agregar un nuevo tipo de tarjeta

1. Crea las imagenes: `{nuevo-prefijo}-0.png` ... `{nuevo-prefijo}-{max}.png` (+ @2x)
2. Agrega la condicion en el codigo:

```javascript
const stripPrefix = cardType === 'massage' ? 'massage-strip'
                  : cardType === 'nuevo'   ? 'nuevo-strip'
                  : 'stamp-strip';
```

---

## Variables de Entorno (pass.json)

```env
APPLE_TEAM_ID=XXXXXXXXXX           # Team ID de Apple Developer
APPLE_PASS_TYPE_ID=pass.com.tu.id  # Pass Type ID registrado
APPLE_ORG_NAME=Tu Negocio          # Nombre de la organizacion
APPLE_AUTH_TOKEN=token_secreto     # Token para web service updates
BASE_URL=https://tudominio.com     # URL base para actualizaciones push
BUSINESS_LATITUDE=20.3880          # Ubicacion del negocio
BUSINESS_LONGITUDE=-99.9960
```

---

## Certificados Apple Wallet

Necesitas estos archivos en tu proyecto:

```
certs/
├── signerCert.pem      ← Certificado de firma (.cer convertido a .pem)
├── signerKey.pem       ← Llave privada (.key o .p12 convertido a .pem)
└── wwdr.pem            ← Apple WWDR Certificate (descargar de Apple)
```

### Obtener los certificados:

1. Ve a [Apple Developer Portal](https://developer.apple.com/account/resources/identifiers/list/passTypeId)
2. Crea un **Pass Type ID** (ej: `pass.com.tunegocio.loyalty`)
3. Genera un certificado para ese Pass Type ID
4. Descarga el `.cer` y conviertelo:

```bash
# Convertir .cer a .pem
openssl x509 -inform DER -in pass.cer -out certs/signerCert.pem

# Exportar llave privada del .p12
openssl pkcs12 -in Certificates.p12 -nocerts -out certs/signerKey.pem -nodes

# Descargar WWDR (AppleWWDRCAG4)
curl -o certs/wwdr.pem https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
openssl x509 -inform DER -in certs/wwdr.pem -out certs/wwdr.pem
```

---

## Checklist para Nuevo Proyecto

- [ ] Registrar Pass Type ID en Apple Developer
- [ ] Generar y convertir certificados (signerCert, signerKey, wwdr)
- [ ] Definir tipos de tarjeta y max sellos/sesiones de cada uno
- [ ] Disenar y generar strip images (1x + @2x) para cada nivel de progreso
- [ ] Crear `logo.png` cuadrado (~160x160 px)
- [ ] Configurar variables de entorno
- [ ] Implementar `buildApplePassBuffer()` con `passkit-generator`
- [ ] Crear endpoint GET para descargar el `.pkpass`
- [ ] (Opcional) Implementar web service para push updates

---

## Referencia Rapida

| Elemento | 1x | @2x | @3x |
|----------|-----|------|------|
| Strip | 375x120 | 750x240 | 1125x360 |
| Logo | 160x50 | 320x100 | 480x150 |
| Icon | 29x29 | 58x58 | 87x87 |
| Thumbnail | 90x90 | 180x180 | 270x270 |

> Documentacion oficial: [Apple Wallet - Pass Design](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html)
