// lib/apple.js - VERSIÓN CORREGIDA PARA passkit-generator 3.2.0
import fs from "fs";
import os from "os";
import path from "node:path";
import PKPass from "passkit-generator";

/* =========================================================
   Helpers de lectura de certificados
   ========================================================= */
function readPemString(filePath, label) {
  if (!filePath) throw new Error(`[Apple Wallet] Falta ruta para ${label}`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[Apple Wallet] No existe ${label} en: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();

  // Si es un chain, nos quedamos con el primer certificado
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
   FS utils
   ========================================================= */
function writeFileEnsured(p, buf) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
}

// PNG 1x1 de relleno
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64"
);

/* =========================================================
   Builder del modelo temporal (.pass)
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

  // Colores de la marca
  // #8c9668 (verde fuerte)  -> fondo
  // #fff6e3 (crema)         -> textos
  const backgroundColor = "rgb(140,150,104)"; // #8c9668
  const textColor = "rgb(255,246,227)";       // #fff6e3

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    serialNumber: cardId,
    organizationName: orgName,
    description: "Tarjeta de lealtad Venus",
    logoText: "Venus Cosmetología",

    storeCard: {
      // Arriba-derecha: PROGRAMA / Lealtad Venus
      headerFields: [
        {
          key: "program",
          label: "PROGRAMA",
          value: "Lealtad Venus",
        },
      ],

      // Texto grande: nombre del cliente
      primaryFields: [
        {
          key: "name",
          label: "",
          value: name || "Cliente",
        },
      ],

      // Dejamos secondaryFields vacío para que no se amontone el texto
      secondaryFields: [],

      // Fila intermedia: SELLOS   |   ID TARJETA
      auxiliaryFields: [
        {
          key: "stamps",
          label: "SELLOS",
          value: `${stamps}/${max}`,
        },
        {
          key: "cardId",
          label: "ID TARJETA",
          value: cardId,
        },
      ],

      // Parte trasera del pase
      backFields: [
        {
          key: "terms",
          label: "Términos",
          value:
            "Completa tus sellos y canjea un facial gratis en Venus Cosmetología.",
        },
      ],
    },

    backgroundColor,
    foregroundColor: textColor,
    labelColor: textColor,

    // Código QR con el cardId
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
  // Archivos mínimos para que el pass sea válido; luego los
  // reemplazamos con nuestras imágenes reales.
  writeFileEnsured(path.join(dir, "icon.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "icon@2x.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo@2x.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "strip.png"), TINY_PNG);

  return dir;
}

/* =========================================================
   Selección de strip dinámico (sellos)
   ========================================================= */
// Directorio por defecto: public/assets
const DEFAULT_ASSETS_DIR = path.join(process.cwd(), "public", "assets");

function getStripImageForStamps(stamps, max) {
  const baseDir = process.env.APPLE_STRIP_DIR || DEFAULT_ASSETS_DIR;
  const s = Number.isFinite(+stamps) ? +stamps : 0;
  const m = Number.isFinite(+max) ? +max : 8;
  const idx = Math.min(Math.max(s, 0), m); // 0..max

  // Espera archivos: strip_0.png, strip_1.png, ..., strip_8.png
  const candidate = path.join(baseDir, `strip_${idx}.png`);
  if (fs.existsSync(candidate)) return candidate;

  const fallback = path.join(baseDir, "strip_0.png");
  if (fs.existsSync(fallback)) return fallback;

  console.warn(
    `[Apple Wallet] No se encontró strip para sellos=${s}. Buscado en ${baseDir}`
  );
  return null;
}

/* =========================================================
   Función principal: genera el .pkpass - VERSIÓN 3.2.0
   ========================================================= */
export async function buildApplePassBuffer({ cardId, name, stamps, max }) {
  let modelDir;
  
  try {
    const TEAM_ID = process.env.APPLE_TEAM_ID;
    const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID;
    const ORG_NAME = process.env.APPLE_ORG_NAME || "Venus Cosmetología";

    if (!TEAM_ID || !PASS_TYPE_ID) {
      throw new Error(
        "[Apple Wallet] Faltan APPLE_TEAM_ID o APPLE_PASS_TYPE_ID"
      );
    }

    console.log(`[Apple Wallet] Generando pase para: ${cardId}`);

    // 1) Certificados
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

    if (!signerCertPem.startsWith("-----BEGIN CERTIFICATE-----")) {
      throw new Error(
        "[Apple Wallet] pass.pem no inicia con 'BEGIN CERTIFICATE'"
      );
    }
    if (
      !signerKeyPem.startsWith("-----BEGIN RSA PRIVATE KEY-----") &&
      !signerKeyPem.startsWith("-----BEGIN PRIVATE KEY-----")
    ) {
      throw new Error(
        "[Apple Wallet] pass.key no es una llave privada válida (RSA/PKCS#8)"
      );
    }

    // 2) Modelo temporal (.pass) con los datos de la tarjeta
    modelDir = buildTempModelDir({
      orgName: ORG_NAME,
      passTypeId: PASS_TYPE_ID,
      teamId: TEAM_ID,
      cardId,
      name,
      stamps,
      max,
    });

    console.log(`[Apple Wallet] Modelo creado en: ${modelDir}`);

    // 3) VERSIÓN 3.2.0: Usar PKPass como función constructora
    const pass = new PKPass(
      {
        // Datos básicos del pase
        passTypeIdentifier: PASS_TYPE_ID,
        teamIdentifier: TEAM_ID,
        organizationName: ORG_NAME,
        serialNumber: cardId,
        description: "Tarjeta de lealtad Venus",
      },
      {
        // Configuración
        model: modelDir,
        certificates: {
          wwdr: wwdrPem,
          signerCert: signerCertPem,
          signerKey: {
            keyFile: signerKeyPem,
            passphrase: signerKeyPassphrase,
          },
        },
      }
    );

    console.log("[Apple Wallet] PKPass instancia creada");

    // 4) Imágenes de marca (logo / icon) - MÉTODO CORREGIDO
    function addImage(slot, filePath) {
      if (!filePath || !fs.existsSync(filePath)) {
        console.log(`[Apple Wallet] Imagen no encontrada: ${slot} -> ${filePath}`);
        return;
      }
      try {
        const buffer = fs.readFileSync(filePath);
        // En v3.2.0, usar addBuffer con el nombre correcto del archivo
        pass.addBuffer(buffer, slot);
        console.log(`[Apple Wallet] Imagen agregada: ${slot}`);
      } catch (err) {
        console.error(
          `[Apple Wallet] Error agregando imagen ${slot}:`,
          err.message
        );
      }
    }

    // Agregar imágenes (usar rutas absolutas o relativas al proyecto)
    addImage("logo.png", process.env.APPLE_LOGO_PNG);
    addImage("logo@2x.png", process.env.APPLE_LOGO2X_PNG);
    addImage("icon.png", process.env.APPLE_ICON_PNG);
    addImage("icon@2x.png", process.env.APPLE_ICON2X_PNG);

    // 5) Strip dinámico según número de sellos
    const stripPath = getStripImageForStamps(stamps, max);
    if (stripPath) {
      try {
        const buf = fs.readFileSync(stripPath);
        pass.addBuffer(buf, "strip.png");
        console.log(
          `[Apple Wallet] Strip agregado desde ${stripPath} (sellos=${stamps})`
        );
      } catch (e) {
        console.error("[Apple Wallet] Error agregando strip.png:", e.message);
      }
    }

    // 6) Exportar a Buffer
    console.log("[Apple Wallet] Exportando a buffer...");
    const buffer = pass.getAsBuffer();

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error("El .pkpass resultó vacío");
    }

    console.log(
      `[Apple Wallet] Pase generado exitosamente, tamaño: ${buffer.length} bytes`
    );
    
    return buffer;

  } catch (error) {
    console.error(
      "[Apple Wallet] Error crítico en buildApplePassBuffer:",
      error
    );
    throw error;
  } finally {
    // Limpiar directorio temporal siempre
    if (modelDir) {
      try {
        fs.rmSync(modelDir, { recursive: true, force: true });
        console.log(`[Apple Wallet] Directorio temporal limpiado: ${modelDir}`);
      } catch (e) {
        console.warn("[Apple Wallet] No se pudo limpiar directorio temporal:", e.message);
      }
    }
  }
}