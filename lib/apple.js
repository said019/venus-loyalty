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
  stamp: { width: 90, height: 90 },       // Thumbnail opcional
};

/* =========================================================
   Rutas a imágenes de la marca
   ========================================================= */
const PROJECT_ROOT = process.cwd();
const ASSETS_DIR = path.join(PROJECT_ROOT, "assets");

const IMAGE_PATHS = {
  logo: path.join(ASSETS_DIR, "logo.png"),   // logo principal
  icon: path.join(ASSETS_DIR, "logo.png"),   // lo usamos también como icono
  strip: path.join(ASSETS_DIR, "hero.png"),  // imagen horizontal / hero
  stamp: path.join(ASSETS_DIR, "stamp.png"), // reservada para futuros sellos
};

/* =========================================================
   Helpers de lectura PEM
   ========================================================= */
// La librería / node-forge espera STRINGS PEM, no Buffers.
function readPemString(filePath, label) {
  if (!filePath) throw new Error(`[Apple Wallet] Falta ruta para ${label}`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[Apple Wallet] No existe ${label} en: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();

  // Si es un certificado "chain", nos quedamos con el PRIMERO.
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
        background: { r: 0, g: 0, b: 0, alpha: 0 } // fondo transparente
      })
      .png({
        quality: quality,
        compressionLevel: 9,
        palette: true
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

    // Verificar si necesita redimensionamiento
    const metadata = await sharp(originalBuffer).metadata();
    const specs = IMAGE_SPECS[type];
    
    console.log(`[Image Processor] Dimensiones originales: ${metadata.width}x${metadata.height}`);
    console.log(`[Image Processor] Dimensiones objetivo: ${specs.width}x${specs.height}`);

    // Solo redimensionar si es más grande que lo necesario
    if (metadata.width > specs.width || metadata.height > specs.height) {
      return await resizeImage(originalBuffer, type);
    }

    // Si ya tiene el tamaño correcto, optimizar igual
    if (originalBuffer.length > 100 * 1024) { // > 100KB
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
   Modelo temporal .pass
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

  // Colores de marca
  // Fondo: #898e78  -> rgb(137,142,120)
  // Texto: #fff6e3  -> rgb(255,246,227)
  // Labels: #cdd8a6 -> rgb(205,216,166)
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    serialNumber: cardId,
    organizationName: orgName,
    description: "Tarjeta de lealtad",
    logoText: orgName,

    // storeCard según docs de Apple
    storeCard: {
      headerFields: [],
      primaryFields: [
        {
          key: "name",
          label: "Cliente",
          value: name || "Cliente",
        },
      ],
      secondaryFields: [
        {
          key: "stamps",
          label: "Sellos",
          value: `${stamps}/${max}`,
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
          label: "Términos",
          value: "Completa tus sellos y canjea un facial gratis.",
        },
      ],
    },

    // Colores de la tarjeta
    backgroundColor: "rgb(137,142,120)", // verde fuerte de la marca
    foregroundColor: "rgb(255,246,227)", // texto principal en marfil
    labelColor: "rgb(205,216,166)",      // etiquetas suaves

    // Código de barras - usar barcodes (plural) para v3.2.0
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: cardId,
        messageEncoding: "iso-8859-1",
      },
    ],
  };

  writeFileEnsured(
    path.join(dir, "pass.json"),
    Buffer.from(JSON.stringify(passJson, null, 2))
  );
  
  // Fallbacks mínimos; luego los sobreescribimos con imágenes reales
  writeFileEnsured(path.join(dir, "icon.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "icon@2x.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo@2x.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "strip.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "strip@2x.png"), TINY_PNG);

  return dir;
}

/* =========================================================
   Build .pkpass
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

    // 2) Certificados (como STRING PEM)
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

    // 3) Modelo ya con datos de esta tarjeta
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

    // 4) Crear pass con la librería v3.2.0
    const certificates = {
      signerCert: signerCertPem,
      signerKey: signerKeyPem,
      wwdr: wwdrPem,
      signerKeyPassphrase,
    };

    // Para passkit-generator v3.2.0 usamos PKPass.from()
    const pass = await PKPass.from({
      model: model,
      certificates: certificates,
    });

    console.log(`[Apple Wallet] PKPass instancia creada`);

    /* 5) Función mejorada para agregar imágenes procesadas */
    const addImg = async (fileName, absPath) => {
      if (!absPath || !fs.existsSync(absPath)) {
        console.log(`[Apple Wallet] Imagen no encontrada: ${fileName} -> ${absPath}`);
        return;
      }
      
      try {
        // Determinar el tipo de imagen basado en el filename
        let imageType;
        if (fileName.includes('logo')) imageType = 'logo';
        else if (fileName.includes('icon')) imageType = 'icon';
        else if (fileName.includes('strip')) imageType = 'strip';
        else if (fileName.includes('thumbnail') || fileName.includes('stamp')) imageType = 'stamp';
        else {
          console.log(`[Apple Wallet] Tipo de imagen no reconocido: ${fileName}`);
          imageType = 'logo'; // fallback
        }

        // Procesar imagen (redimensionar y optimizar)
        const processedBuffer = await processImage(absPath, imageType);
        
        if (processedBuffer) {
          pass.addBuffer(processedBuffer, fileName);
          console.log(`[Apple Wallet] Imagen procesada y agregada: ${fileName} (${processedBuffer.length} bytes)`);
        } else {
          console.error(`[Apple Wallet] No se pudo procesar la imagen: ${fileName}`);
        }
      } catch (imgError) {
        console.error(`[Apple Wallet] Error agregando imagen ${fileName}:`, imgError);
      }
    };

    // 6) Procesar y agregar todas las imágenes
    console.log(`[Apple Wallet] Procesando imágenes...`);
    
    // Logo grande en la cabecera
    await addImg("logo.png", IMAGE_PATHS.logo);
    await addImg("logo@2x.png", IMAGE_PATHS.logo);

    // Icono pequeño (lista de Wallet)
    await addImg("icon.png", IMAGE_PATHS.icon);
    await addImg("icon@2x.png", IMAGE_PATHS.icon);

    // Imagen hero / strip (banda horizontal detrás del contenido)
    await addImg("strip.png", IMAGE_PATHS.strip);
    await addImg("strip@2x.png", IMAGE_PATHS.strip);

    // Reservado para futuros sellos si queremos usar un thumbnail
    // await addImg("thumbnail.png", IMAGE_PATHS.stamp);
    // await addImg("thumbnail@2x.png", IMAGE_PATHS.stamp);

    console.log(`[Apple Wallet] Todas las imágenes procesadas`);

    // 7) Verificación final del contenido del pase
    console.log(`[Apple Wallet] Contenido final del pase:`);
    const assets = pass.getAssets();
    if (assets && assets.length > 0) {
      assets.forEach(asset => {
        console.log(`[Apple Wallet] - ${asset.path} (${asset.data.length} bytes)`);
      });
    } else {
      console.log(`[Apple Wallet] No se encontraron assets en el pase`);
    }

    // Verificar que las imágenes críticas estén incluidas
    const requiredImages = ['logo.png', 'icon.png', 'strip.png'];
    const assetNames = assets ? assets.map(asset => path.basename(asset.path)) : [];
    
    requiredImages.forEach(img => {
      if (!assetNames.includes(img)) {
        console.warn(`[Apple Wallet] ADVERTENCIA: ${img} no está en el pase final`);
      } else {
        console.log(`[Apple Wallet] ✅ ${img} incluido correctamente`);
      }
    });

    // 8) Exportar a Buffer
    console.log(`[Apple Wallet] Exportando a buffer...`);
    const buffer = pass.getAsBuffer();

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error("El .pkpass resultó vacío");
    }

    console.log(
      `[Apple Wallet] Pase generado exitosamente, tamaño total: ${buffer.length} bytes`
    );
    return buffer;
  } catch (error) {
    console.error("[Apple Wallet] Error crítico en buildApplePassBuffer:", error);
    throw error;
  }
}