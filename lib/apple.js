// lib/apple.js
import fs from "fs";
import os from "os";
import path from "node:path";
import sharp from "sharp";              // <-- para generar el strip dinámico
import pkg from "passkit-generator";    // v3.x
const { PKPass } = pkg;

/* =============== Helpers de lectura PEM =============== */
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

/* =============== FS utils =============== */
function writeFileEnsured(p, buf) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
}

// PNG 1x1 placeholder (se queda por si algo falla con las imágenes)
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64"
);

/* =============== Strip dinámico =============== */
/**
 * Genera una imagen strip.png con N sellos usando stamp.png
 * - stamps: sellos actuales
 * - max   : sellos totales (ej. 8)
 */
async function buildStripBuffer({ stamps, max }) {
  const safeMax = Number.isInteger(max) && max > 0 ? max : 8;
  const safeStamps = Math.max(0, Math.min(safeMax, parseInt(stamps ?? 0, 10)));

  // Ruta del ícono base
  const iconPath =
  process.env.APPLE_STAMP_ICON ||
  path.join(process.cwd(), "public", "assets", "stamp.png");
  if (!fs.existsSync(iconPath)) {
    console.warn(
      "[Apple Wallet] No se encontró APPLE_STAMP_ICON, se omite strip dinámico:",
      iconPath
    );
    return null;
  }

  // Tamaños base
  const iconSize = 72; // px
  const padding = 18;
  const width = padding * (safeMax + 1) + iconSize * safeMax;
  const height = iconSize + padding * 2;

  // Lienzo transparente
  let base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // transparente
    },
  });

  // Ícono lleno (tal cual)
  const fullIcon = await sharp(iconPath).resize(iconSize, iconSize).png().toBuffer();

  // Ícono vacío: mismo ícono pero desaturado y con menos opacidad
  const emptyIcon = await sharp(iconPath)
    .resize(iconSize, iconSize)
    .modulate({ saturation: 0.1, brightness: 1.0 }) // casi gris
    .png()
    .toBuffer();

  const composites = [];
  for (let i = 0; i < safeMax; i++) {
    const left = padding + i * (iconSize + padding);
    const top = padding;
    const input = i < safeStamps ? fullIcon : emptyIcon;

    composites.push({ input, left, top });
  }

  base = base.composite(composites);
  return await base.png().toBuffer();
}

/* =============== Modelo temporal .pass =============== */
function buildTempModelDir({
  orgName,
  passTypeId,
  teamId,
  cardId,
  name,
  stamps,
  max,
  stripBuf, // <- imagen generada opcional
}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "apple-pass-"));
  const dir = base.endsWith(".pass") ? base : `${base}.pass`;
  fs.mkdirSync(dir, { recursive: true });

  // Colores de tu marca
  // #898e78 fondo, #fff6e3 texto
  const backgroundColor = "rgb(137,142,120)";
  const textColor = "rgb(255,246,227)";

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    serialNumber: cardId,
    organizationName: orgName,
    description: "Tarjeta de lealtad",
    logoText: orgName,

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

    backgroundColor,
    foregroundColor: textColor,
    labelColor: textColor,

    // QR
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

  // Íconos mínimos para que Apple no se queje
  writeFileEnsured(path.join(dir, "icon.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "icon@2x.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo@2x.png"), TINY_PNG);

  // Strip dinámico (si se pudo generar)
  if (stripBuf) {
    writeFileEnsured(path.join(dir, "strip.png"), stripBuf);
    // Puedes usar el mismo buffer como @2x o luego escalarlo si quieres
    writeFileEnsured(path.join(dir, "strip@2x.png"), stripBuf);
  }

  return dir;
}

/* =============== Build .pkpass =============== */
export async function buildApplePassBuffer({ cardId, name, stamps, max }) {
  try {
    const TEAM_ID = process.env.APPLE_TEAM_ID;
    const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID;
    const ORG_NAME = process.env.APPLE_ORG_NAME || "Venus Cosmetología";

    if (!TEAM_ID || !PASS_TYPE_ID) {
      throw new Error("[Apple Wallet] Faltan APPLE_TEAM_ID o APPLE_PASS_TYPE_ID");
    }

    console.log(`[Apple Wallet] Generando pase para: ${cardId}`);

    // 1) Certificados (STRING PEM)
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

    // 2) Generar strip dinámico según sellos
    let stripBuf = null;
    try {
      stripBuf = await buildStripBuffer({ stamps, max });
      if (stripBuf) {
        console.log(
          `[Apple Wallet] Strip dinámico generado (${stripBuf.length} bytes)`
        );
      }
    } catch (stripError) {
      console.error("[Apple Wallet] Error generando strip dinámico:", stripError);
      stripBuf = null; // seguimos sin strip para no romper nada
    }

    // 3) Modelo .pass con datos de esta tarjeta
    const model = buildTempModelDir({
      orgName: ORG_NAME,
      passTypeId: PASS_TYPE_ID,
      teamId: TEAM_ID,
      cardId,
      name,
      stamps,
      max,
      stripBuf,
    });

    console.log(`[Apple Wallet] Modelo creado en: ${model}`);

    const certificates = {
      signerCert: signerCertPem,
      signerKey: signerKeyPem,
      wwdr: wwdrPem,
      signerKeyPassphrase,
    };

    // 4) Crear pass con passkit-generator v3.x
    const pass = await PKPass.from({
      model,
      certificates,
    });

    console.log(`[Apple Wallet] PKPass instancia creada, exportando buffer...`);

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