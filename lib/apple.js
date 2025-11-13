// lib/apple.js
import fs from "fs";
import os from "os";
import path from "node:path";

// Importación correcta para módulos CommonJS en ESM
import pkg from "passkit-generator";
const { PKPass } = pkg;

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

    // 1) Certificados (como STRING PEM)
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

    // 2) Modelo ya con datos de esta tarjeta
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

    // 3) Crear pass con la librería v3.2.0
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

    /* 4) Imágenes de marca (logo / icon / strip) */
    const addImg = (fileName, absPath) => {
      if (!absPath || !fs.existsSync(absPath)) {
        console.log(`[Apple Wallet] Imagen no encontrada: ${fileName} -> ${absPath}`);
        return;
      }
      try {
        const buf = fs.readFileSync(absPath);
        // passkit-generator v3: (buffer, "logo.png" / "icon.png" / "strip.png"...)
        pass.addBuffer(buf, fileName);
        console.log(`[Apple Wallet] Imagen agregada: ${fileName}`);
      } catch (imgError) {
        console.error(`[Apple Wallet] Error agregando imagen ${fileName}:`, imgError);
      }
    };

    // Logo grande en la cabecera
    addImg("logo.png", IMAGE_PATHS.logo);
    addImg("logo@2x.png", IMAGE_PATHS.logo);

    // Icono pequeño (lista de Wallet)
    addImg("icon.png", IMAGE_PATHS.icon);
    addImg("icon@2x.png", IMAGE_PATHS.icon);

    // Imagen hero / strip (banda horizontal detrás del contenido)
    addImg("strip.png", IMAGE_PATHS.strip);
    addImg("strip@2x.png", IMAGE_PATHS.strip);

    // Reservado para futuros sellos si queremos usar un thumbnail
    // addImg("thumbnail.png", IMAGE_PATHS.stamp);
    // addImg("thumbnail@2x.png", IMAGE_PATHS.stamp);

    // 5) Exportar a Buffer
    console.log(`[Apple Wallet] Exportando a buffer...`);
    const buffer = pass.getAsBuffer();

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error("El .pkpass resultó vacío");
    }

    console.log(
      `[Apple Wallet] Pase generado exitosamente, tamaño: ${buffer.length} bytes`
    );
    return buffer;
  } catch (error) {
    console.error("[Apple Wallet] Error crítico en buildApplePassBuffer:", error);
    throw error;
  }
}