import fs from "fs";
import os from "os";
import path from "node:path";
import sharp from "sharp";

// Importación correcta para módulos CommonJS en ESM
import pkg from "passkit-generator";
const { PKPass } = pkg;

/* =========================================================
   CONFIGURACIÓN DE IMÁGENES PARA APPLE WALLET
   ========================================================= */
const IMAGE_SPECS = {
  logo: { 
    width: 60, 
    height: 60,
    description: "Logo principal en cabecera",
    required: true
  },
  icon: { 
    width: 58, 
    height: 58,
    description: "Icono para listas y notificaciones", 
    required: true
  }
};

/* =========================================================
   RUTAS DE IMÁGENES
   ========================================================= */
const PROJECT_ROOT = process.cwd();
const ASSETS_DIR = path.join(PROJECT_ROOT, "assets");

const IMAGE_PATHS = {
  logo: path.join(ASSETS_DIR, "logow.png"),
  icon: path.join(ASSETS_DIR, "logow.png"), // Usamos el mismo logo para icono
};

/* =========================================================
   GENERADOR DE STRIP DINÁMICO
   ========================================================= */
async function generateStampStrip(stamps, maxStamps) {
  try {
    const width = 624;
    const height = 168;
    const stampSize = 30;
    const spacing = 10;
    const totalWidth = (maxStamps * stampSize) + ((maxStamps - 1) * spacing);
    const startX = (width - totalWidth) / 2;

    console.log(`[Stamp Strip] Creando strip con ${stamps}/${maxStamps} sellos visibles`);

    const colors = {
      background: '#898e78',
      completed: '#cdd8a6',
      pending: '#6b705c',
      text: '#fff6e3',
      stampBorder: '#fff6e3'
    };

    let stampsSvg = '';
    
    // Crear los sellos
    for (let i = 0; i < maxStamps; i++) {
      const x = startX + (i * (stampSize + spacing));
      const y = 70;
      const isCompleted = i < stamps;
      
      stampsSvg += `
        <circle cx="${x + stampSize/2}" cy="${y + stampSize/2}" 
                r="${stampSize/2 - 2}" 
                fill="${isCompleted ? colors.completed : colors.pending}" 
                stroke="${colors.stampBorder}" 
                stroke-width="2" />
        ${isCompleted ? `
          <text x="${x + stampSize/2}" y="${y + stampSize/2 + 4}" 
                text-anchor="middle" 
                font-family="Arial, sans-serif" 
                font-size="14" 
                font-weight="bold" 
                fill="${colors.background}">
            ✓
          </text>
        ` : ''}
      `;
    }

    const svgContent = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Fondo -->
        <rect width="100%" height="100%" fill="${colors.background}" />
        
        <!-- Título -->
        <text x="312" y="40" 
              text-anchor="middle" 
              font-family="Arial, sans-serif" 
              font-size="18" 
              font-weight="bold" 
              fill="${colors.text}">
          MIS SELLOS
        </text>
        
        <!-- Sellos -->
        ${stampsSvg}
        
        <!-- Contador -->
        <text x="312" y="140" 
              text-anchor="middle" 
              font-family="Arial, sans-serif" 
              font-size="16" 
              fill="${colors.text}">
          ${stamps}/${maxStamps}
        </text>
        
        <!-- Mensaje motivacional -->
        <text x="312" y="160" 
              text-anchor="middle" 
              font-family="Arial, sans-serif" 
              font-size="12" 
              fill="${colors.text}"
              opacity="0.8">
          ${stamps === maxStamps ? '🎉 ¡Felicidades! Canjea tu premio' : '¡Sigue acumulando sellos!'}
        </text>
      </svg>
    `;

    const stripBuffer = await sharp(Buffer.from(svgContent))
      .png()
      .toBuffer();

    console.log(`[Stamp Strip] ✅ Strip con sellos creado`);
    return stripBuffer;

  } catch (error) {
    console.error('[Stamp Strip] ❌ Error:', error);
    
    // Fallback simple
    const fallbackStrip = await sharp({
      create: {
        width: 624,
        height: 168,
        channels: 3,
        background: '#898e78'
      }
    })
    .png()
    .toBuffer();
    
    return fallbackStrip;
  }
}

/* =========================================================
   UTILIDADES
   ========================================================= */
function readPemString(filePath, label) {
  if (!filePath) throw new Error(`[Apple Wallet] Falta ruta para ${label}`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[Apple Wallet] No existe ${label} en: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();

  if (/-----BEGIN CERTIFICATE-----/.test(raw)) {
    const first = raw.match(
      /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/
    );
    if (first) return first[0].trim();
  }

  return raw;
}

function readText(filePath, label) {
  if (!filePath) throw new Error(`[Apple Wallet] Falta ruta para ${label}`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[Apple Wallet] No existe ${label} en: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function writeFileEnsured(p, buf) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(p, buf);
}

// PNG transparente
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64"
);

/* =========================================================
   VERIFICACIÓN SIMPLE DE IMÁGENES
   ========================================================= */
async function verifyImages() {
  console.log("\n🔍 VERIFICANDO IMÁGENES...");

  const results = {};
  
  for (const [type, imagePath] of Object.entries(IMAGE_PATHS)) {
    if (fs.existsSync(imagePath)) {
      try {
        const buffer = fs.readFileSync(imagePath);
        const metadata = await sharp(buffer).metadata();
        results[type] = {
          exists: true,
          dimensions: `${metadata.width}x${metadata.height}`,
          size: `${(buffer.length / 1024).toFixed(1)} KB`
        };
        console.log(`✅ ${type}: ${path.basename(imagePath)} (${metadata.width}x${metadata.height})`);
      } catch (error) {
        results[type] = { exists: false, error: error.message };
        console.log(`❌ ${type}: Error leyendo archivo`);
      }
    } else {
      results[type] = { exists: false };
      console.log(`❌ ${type}: No encontrado`);
    }
  }

  return results;
}

/* =========================================================
   MODELO TEMPORAL SIMPLIFICADO
   ========================================================= */
function buildTempModelDir({
  orgName,
  passTypeId,
  teamId,
  cardId,
  name,
  stamps,
  max,
}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "apple-pass-"));
  const dir = base.endsWith(".pass") ? base : `${base}.pass`;
  fs.mkdirSync(dir, { recursive: true });

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    serialNumber: cardId,
    organizationName: orgName,
    description: "Tarjeta de Lealtad Venus",
    logoText: orgName,

    // storeCard
    storeCard: {
      headerFields: [
        {
          key: "header",
          label: "",
          value: orgName.toUpperCase()
        }
      ],
      primaryFields: [
        {
          key: "name",
          label: "CLIENTE",
          value: name || "Cliente",
          textAlignment: "PKTextAlignmentLeft"
        }
      ],
      secondaryFields: [
        {
          key: "stamps",
          label: "SELLOS",
          value: `${stamps}/${max}`,
          textAlignment: "PKTextAlignmentLeft"
        }
      ],
      auxiliaryFields: [
        {
          key: "status",
          label: "ESTADO",
          value: stamps === max ? "🎉 COMPLETADO" : "EN PROGRESO",
          textAlignment: "PKTextAlignmentLeft"
        }
      ],
      backFields: [
        {
          key: "terms",
          label: "TÉRMINOS Y CONDICIONES",
          value: "Acumula 8 sellos y recibe un facial gratuito. Un sello por visita. Válido por 6 meses desde la emisión."
        },
        {
          key: "contact",
          label: "CONTACTO",
          value: "Venus Cosmetología - Tel: 4271657595"
        }
      ]
    },

    // Esquema de colores
    backgroundColor: "rgb(137, 142, 120)",
    foregroundColor: "rgb(255, 246, 227)",
    labelColor: "rgb(205, 216, 166)",
    
    sharingProhibited: false,

    // Código QR
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: cardId,
        messageEncoding: "iso-8859-1",
        altText: `Venus ${cardId}`
      }
    ]
  };

  writeFileEnsured(
    path.join(dir, "pass.json"),
    Buffer.from(JSON.stringify(passJson, null, 2))
  );

  // Fallbacks esenciales
  writeFileEnsured(path.join(dir, "icon.png"), TRANSPARENT_PNG);
  writeFileEnsured(path.join(dir, "logo.png"), TRANSPARENT_PNG);

  console.log(`[Model Builder] 📁 Modelo temporal creado en: ${dir}`);
  return dir;
}

/* =========================================================
   GENERADOR PRINCIPAL DE PASE APPLE - SIMPLIFICADO
   ========================================================= */
export async function buildApplePassBuffer({ cardId, name, stamps, max }) {
  try {
    const TEAM_ID = process.env.APPLE_TEAM_ID;
    const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID;
    const ORG_NAME = process.env.APPLE_ORG_NAME || "Venus Cosmetología";

    if (!TEAM_ID || !PASS_TYPE_ID) {
      throw new Error("[Apple Wallet] Faltan APPLE_TEAM_ID o APPLE_PASS_TYPE_ID");
    }

    console.log(`\n🎫 GENERANDO PASE APPLE WALLET`);
    console.log(`   Cliente: ${name}`);
    console.log(`   Sellos: ${stamps}/${max}`);
    console.log(`   ID: ${cardId}`);

    // 1. Verificar imágenes existentes
    await verifyImages();

    // 2. Validar certificados
    const signerCertPem = readPemString(
      process.env.APPLE_PASS_CERT,
      "APPLE_PASS_CERT"
    );
    const signerKeyPem = readText(
      process.env.APPLE_PASS_KEY,
      "APPLE_PASS_KEY"
    );
    const wwdrPem = readPemString(
      process.env.APPLE_WWDR,
      "APPLE_WWDR"
    );
    const signerKeyPassphrase = process.env.APPLE_PASS_PHRASE || undefined;

    if (!signerCertPem.startsWith("-----BEGIN CERTIFICATE-----")) {
      throw new Error("[Apple Wallet] Certificado inválido");
    }

    console.log(`[Apple Wallet] ✅ Certificados validados`);

    // 3. Crear modelo temporal
    const model = buildTempModelDir({
      orgName: ORG_NAME,
      passTypeId: PASS_TYPE_ID,
      teamId: TEAM_ID,
      cardId,
      name,
      stamps,
      max,
    });

    // 4. Crear pase
    const certificates = {
      signerCert: signerCertPem,
      signerKey: signerKeyPem,
      wwdr: wwdrPem,
      signerKeyPassphrase,
    };

    const pass = await PKPass.from({
      model: model,
      certificates: certificates,
    });

    console.log(`[Apple Wallet] ✅ PKPass creado`);

    // 5. AGREGAR IMÁGENES DIRECTAMENTE (sin procesamiento complejo)
    console.log(`\n🖼️  AGREGANDO IMÁGENES...`);

    // Función simple para agregar imágenes
    const addImageToPass = async (fileName, imagePath) => {
      if (!fs.existsSync(imagePath)) {
        console.log(`[Image Handler] ❌ No encontrado: ${fileName} -> ${imagePath}`);
        return false;
      }

      try {
        const buffer = fs.readFileSync(imagePath);
        
        // Redimensionar simple si es necesario
        let processedBuffer = buffer;
        if (fileName.includes('logo')) {
          processedBuffer = await sharp(buffer)
            .resize(60, 60, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
        } else if (fileName.includes('icon')) {
          processedBuffer = await sharp(buffer)
            .resize(58, 58, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
        }
        
        pass.addBuffer(processedBuffer, fileName);
        console.log(`[Image Handler] ✅ ${fileName} agregado`);
        return true;
      } catch (error) {
        console.error(`[Image Handler] ❌ Error con ${fileName}:`, error.message);
        return false;
      }
    };

    // Agregar logo e icono
    await addImageToPass("logo.png", IMAGE_PATHS.logo);
    await addImageToPass("logo@2x.png", IMAGE_PATHS.logo);
    await addImageToPass("icon.png", IMAGE_PATHS.icon);
    await addImageToPass("icon@2x.png", IMAGE_PATHS.icon);

    // 6. GENERAR Y AGREGAR STRIP DINÁMICO
    console.log(`\n🎨 GENERANDO STRIP DINÁMICO...`);
    
    const stripBuffer = await generateStampStrip(stamps, max);
    
    if (stripBuffer) {
      pass.addBuffer(stripBuffer, "strip.png");
      pass.addBuffer(stripBuffer, "strip@2x.png");
      console.log(`[Strip Handler] ✅ Strip dinámico agregado (${stamps}/${max} sellos)`);
    }

    // 7. GENERAR ARCHIVO FINAL
    console.log(`\n📦 GENERANDO ARCHIVO .PKPASS...`);
    const buffer = pass.getAsBuffer();

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error("El archivo .pkpass resultó vacío");
    }

    console.log(`\n🎉 PASE CREADO EXITOSAMENTE`);
    console.log(`   📊 Tamaño: ${(buffer.length / 1024).toFixed(1)} KB`);
    console.log(`   🎨 Strip: Dinámico (${stamps}/${max} sellos)`);
    console.log(`   👤 Cliente: ${name}`);

    return buffer;
  } catch (error) {
    console.error("[Apple Wallet] ❌ Error crítico:", error);
    throw error;
  }
}