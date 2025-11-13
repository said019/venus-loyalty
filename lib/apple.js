import fs from "fs";
import os from "os";
import path from "node:path";
import sharp from "sharp";

// Importación correcta para módulos CommonJS en ESM
import pkg from "passkit-generator";
const { PKPass } = pkg;

/* =========================================================
   Configuración de dimensiones para Apple Wallet
   ========================================================= */
const IMAGE_SPECS = {
  logo: { width: 60, height: 60 },        // 1x: 30x30, 2x: 60x60
  icon: { width: 58, height: 58 },        // 1x: 29x29, 2x: 58x58  
  strip: { width: 624, height: 168 },     // 1x: 312x84, 2x: 624x168
  background: { width: 180, height: 220 }, // Para loyalty card
};

/* =========================================================
   RUTAS CORREGIDAS - Las imágenes están en public/assets/
   ========================================================= */
const PROJECT_ROOT = process.cwd();
const ASSETS_DIR = path.join(PROJECT_ROOT, "public", "assets");

const IMAGE_PATHS = {
  logo: path.join(ASSETS_DIR, "logo.png"),   // logo principal
  icon: path.join(ASSETS_DIR, "logo.png"),   // lo usamos también como icono
  strip: path.join(ASSETS_DIR, "hero.png"),  // imagen horizontal / hero
  background: path.join(ASSETS_DIR, "hero.png"), // imagen de fondo
};

/* =========================================================
   Helpers de lectura PEM
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

/* =========================================================
   Utils FS
   ========================================================= */
function writeFileEnsured(p, buf) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
}

// PNG 1x1 placeholder (por si algo falta)
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64"
);

/* =========================================================
   Función para redimensionar y optimizar imágenes
   ========================================================= */
async function resizeImage(buffer, type, quality = 80) {
  try {
    const specs = IMAGE_SPECS[type];
    if (!specs) {
      throw new Error(`Tipo de imagen no soportado: ${type}`);
    }

    console.log(`[Image Processor] Redimensionando ${type} a ${specs.width}x${specs.height}`);

    const resizedBuffer = await sharp(buffer)
      .resize(specs.width, specs.height, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({
        quality: quality,
        compressionLevel: 9
      })
      .toBuffer();

    console.log(`[Image Processor] ${type} redimensionado: ${buffer.length} → ${resizedBuffer.length} bytes`);
    
    return resizedBuffer;
  } catch (error) {
    console.error(`[Image Processor] Error redimensionando ${type}:`, error);
    throw error;
  }
}

/* =========================================================
   Función para verificar y procesar imágenes
   ========================================================= */
async function processImage(imagePath, type) {
  if (!imagePath || !fs.existsSync(imagePath)) {
    console.log(`[Image Processor] Imagen no encontrada: ${type} -> ${imagePath}`);
    return null;
  }

  try {
    const originalBuffer = fs.readFileSync(imagePath);
    console.log(`[Image Processor] Cargando ${type}: ${originalBuffer.length} bytes`);

    const metadata = await sharp(originalBuffer).metadata();
    const specs = IMAGE_SPECS[type];
    
    console.log(`[Image Processor] Dimensiones originales: ${metadata.width}x${metadata.height}`);
    console.log(`[Image Processor] Dimensiones objetivo: ${specs.width}x${specs.height}`);

    // Solo redimensionar si es más grande que lo necesario
    if (metadata.width > specs.width || metadata.height > specs.height) {
      return await resizeImage(originalBuffer, type);
    }

    // Si ya tiene el tamaño correcto, optimizar igual
    if (originalBuffer.length > 100 * 1024) {
      console.log(`[Image Processor] Optimizando ${type} (tamaño actual: ${originalBuffer.length} bytes)`);
      return await sharp(originalBuffer)
        .png({ quality: 85, compressionLevel: 9 })
        .toBuffer();
    }

    return originalBuffer;
  } catch (error) {
    console.error(`[Image Processor] Error procesando ${type}:`, error);
    return null;
  }
}

/* =========================================================
   Verificador de imágenes con diagnóstico completo
   ========================================================= */
async function diagnoseImages() {
  console.log("\n[Image Diagnóstico] === VERIFICACIÓN DE IMÁGENES ===");
  console.log(`[Image Diagnóstico] Buscando en directorio: ${ASSETS_DIR}`);
  
  for (const [key, imagePath] of Object.entries(IMAGE_PATHS)) {
    console.log(`\n[Image Diagnóstico] ${key.toUpperCase()}: ${imagePath}`);
    
    if (!fs.existsSync(imagePath)) {
      console.log(`[Image Diagnóstico] ❌ NO EXISTE`);
      continue;
    }

    try {
      const buffer = fs.readFileSync(imagePath);
      const metadata = await sharp(buffer).metadata();
      const specs = IMAGE_SPECS[key];
      
      console.log(`[Image Diagnóstico] ✅ Existe - ${metadata.width}x${metadata.height}`);
      console.log(`[Image Diagnóstico] 📊 Tamaño: ${(buffer.length / 1024).toFixed(2)} KB`);
      console.log(`[Image Diagnóstico] 🎯 Objetivo: ${specs.width}x${specs.height}`);
      
      const needsResize = metadata.width > specs.width || metadata.height > specs.height;
      console.log(`[Image Diagnóstico] 🔄 Necesita redimensionar: ${needsResize ? 'SÍ' : 'NO'}`);
      
    } catch (error) {
      console.log(`[Image Diagnóstico] ❌ Error leyendo: ${error.message}`);
    }
  }
  console.log("\n[Image Diagnóstico] === FIN VERIFICACIÓN ===\n");
}

/* =========================================================
   Modelo temporal .pass - USANDO loyaltyCard
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
    description: "Tarjeta de lealtad Venus",
    logoText: orgName,

    // ✅ CAMBIO CRÍTICO: Usar loyaltyCard en lugar de storeCard
    loyaltyCard: {
      primaryFields: [
        {
          key: "balance",
          label: "Sellos",
          value: `${stamps}/${max}`,
        },
      ],
      secondaryFields: [
        {
          key: "member",
          label: "Cliente",
          value: name || "Cliente",
        },
      ],
      auxiliaryFields: [
        {
          key: "program",
          label: "Programa",
          value: "Lealtad Venus",
        },
      ],
      backFields: [
        {
          key: "terms",
          label: "Términos y Condiciones",
          value: "Completa 8 sellos y canjea un tratamiento facial gratuito. Un sello por cada visita. Válido por 6 meses.",
        },
        {
          key: "contact",
          label: "Contacto",
          value: "Venus Cosmetología - Tel: 555-1234",
        },
      ],
    },

    // Colores de la tarjeta
    backgroundColor: "rgb(137,142,120)", // verde de la marca
    foregroundColor: "rgb(255,246,227)", // texto principal
    labelColor: "rgb(205,216,166)",      // etiquetas

    // Código de barras
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: cardId,
        messageEncoding: "iso-8859-1",
      },
    ],

    // ✅ Especificar imágenes que vamos a usar
    images: {
      logo: {
        "1x": "logo.png",
        "2x": "logo@2x.png"
      },
      icon: {
        "1x": "icon.png", 
        "2x": "icon@2x.png"
      },
      strip: {
        "1x": "strip.png",
        "2x": "strip@2x.png"
      },
      background: {
        "1x": "background.png",
        "2x": "background@2x.png"
      }
    }
  };

  writeFileEnsured(
    path.join(dir, "pass.json"),
    Buffer.from(JSON.stringify(passJson, null, 2))
  );
  
  // Crear placeholders mínimos
  writeFileEnsured(path.join(dir, "icon.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "strip.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "background.png"), TINY_PNG);

  return dir;
}

/* =========================================================
   Build .pkpass - VERSIÓN CORREGIDA
   ========================================================= */
export async function buildApplePassBuffer({ cardId, name, stamps, max }) {
  try {
    const TEAM_ID = process.env.APPLE_TEAM_ID;
    const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID;
    const ORG_NAME = process.env.APPLE_ORG_NAME || "Venus Cosmetología";

    if (!TEAM_ID || !PASS_TYPE_ID) {
      throw new Error("[Apple Wallet] Faltan APPLE_TEAM_ID o APPLE_PASS_TYPE_ID");
    }

    console.log(`[Apple Wallet] Generando pase para: ${cardId}`);

    // 1) Diagnóstico inicial de imágenes
    await diagnoseImages();

    // 2) Certificados
    const signerCertPem = readPemString(
      process.env.APPLE_PASS_CERT,
      "APPLE_PASS_CERT (pass.pem)"
    );
    const signerKeyPem = readText(
      process.env.APPLE_PASS_KEY,
      "APPLE_PASS_KEY (pass.key)"
    );
    const wwdrPem = readPemString(
      process.env.APPLE_WWDR,
      "APPLE_WWDR (wwdr.pem)"
    );
    const signerKeyPassphrase = process.env.APPLE_PASS_PHRASE || undefined;

    // Validaciones rápidas
    if (!signerCertPem.startsWith("-----BEGIN CERTIFICATE-----")) {
      throw new Error("[Apple Wallet] pass.pem no inicia con 'BEGIN CERTIFICATE'");
    }
    if (
      !signerKeyPem.startsWith("-----BEGIN RSA PRIVATE KEY-----") &&
      !signerKeyPem.startsWith("-----BEGIN PRIVATE KEY-----")
    ) {
      throw new Error(
        "[Apple Wallet] pass.key no es una llave privada válida (RSA/PKCS#8)"
      );
    }

    // 3) Modelo temporal
    const model = buildTempModelDir({
      orgName: ORG_NAME,
      passTypeId: PASS_TYPE_ID,
      teamId: TEAM_ID,
      cardId,
      name,
      stamps,
      max,
    });

    console.log(`[Apple Wallet] Modelo creado en: ${model}`);

    // 4) Crear pass
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

    console.log(`[Apple Wallet] PKPass instancia creada`);

    /* 5) ESTRATEGIA MEJORADA PARA IMÁGENES */
    console.log(`[Apple Wallet] Procesando imágenes...`);

    // Función mejorada para agregar imágenes
    const addProcessedImage = async (fileName, imagePath, imageType) => {
      if (!fs.existsSync(imagePath)) {
        console.log(`[Apple Wallet] ❌ Imagen no encontrada: ${fileName} -> ${imagePath}`);
        return false;
      }

      try {
        console.log(`[Apple Wallet] Procesando: ${fileName}`);
        const processedBuffer = await processImage(imagePath, imageType);
        
        if (processedBuffer) {
          // VERIFICACIÓN: Asegurar que el buffer es válido
          if (!Buffer.isBuffer(processedBuffer) || processedBuffer.length === 0) {
            console.log(`[Apple Wallet] ❌ Buffer inválido para: ${fileName}`);
            return false;
          }

          // AGREGAR la imagen al pass
          pass.addBuffer(processedBuffer, fileName);
          console.log(`[Apple Wallet] ✅ Imagen agregada: ${fileName} (${processedBuffer.length} bytes)`);
          return true;
        } else {
          console.log(`[Apple Wallet] ❌ No se pudo procesar: ${fileName}`);
          return false;
        }
      } catch (error) {
        console.error(`[Apple Wallet] ❌ Error procesando ${fileName}:`, error.message);
        return false;
      }
    };

    // Procesar cada tipo de imagen
    const imageResults = {
      logo: await addProcessedImage("logo.png", IMAGE_PATHS.logo, "logo"),
      icon: await addProcessedImage("icon.png", IMAGE_PATHS.icon, "icon"),
      strip: await addProcessedImage("strip.png", IMAGE_PATHS.strip, "strip"),
      background: await addProcessedImage("background.png", IMAGE_PATHS.background, "background"),
    };

    // También agregar versiones @2x si las imágenes existen
    if (imageResults.logo) {
      await addProcessedImage("logo@2x.png", IMAGE_PATHS.logo, "logo");
    }
    if (imageResults.icon) {
      await addProcessedImage("icon@2x.png", IMAGE_PATHS.icon, "icon");
    }
    if (imageResults.strip) {
      await addProcessedImage("strip@2x.png", IMAGE_PATHS.strip, "strip");
    }
    if (imageResults.background) {
      await addProcessedImage("background@2x.png", IMAGE_PATHS.background, "background");
    }

    // Resumen de imágenes procesadas
    console.log(`\n[Apple Wallet] === RESUMEN DE IMÁGENES ===`);
    console.log(`[Apple Wallet] Logo: ${imageResults.logo ? '✅' : '❌'}`);
    console.log(`[Apple Wallet] Icon: ${imageResults.icon ? '✅' : '❌'}`);
    console.log(`[Apple Wallet] Strip: ${imageResults.strip ? '✅' : '❌'}`);
    console.log(`[Apple Wallet] Background: ${imageResults.background ? '✅' : '❌'}`);

    // 6) Exportar a Buffer
    console.log(`[Apple Wallet] Exportando a buffer...`);
    const buffer = pass.getAsBuffer();

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error("El .pkpass resultó vacío");
    }

    console.log(
      `[Apple Wallet] ✅ Pase generado exitosamente, tamaño: ${buffer.length} bytes`
    );
    
    return buffer;
  } catch (error) {
    console.error("[Apple Wallet] Error crítico en buildApplePassBuffer:", error);
    throw error;
  }
}