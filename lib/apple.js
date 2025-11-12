import fs from "fs";
import os from "os";
import path from "node:path";
import { Pass } from "passkit-generator";

/**
 * 🔒 Lee un archivo requerido y lanza un error si falta.
 */
function mustRead(filePath, label) {
  try {
    return fs.readFileSync(filePath);
  } catch {
    throw new Error(`[Apple Wallet] No se pudo leer ${label} en: ${filePath}`);
  }
}

/**
 * 📂 Crea un archivo garantizando la existencia de la carpeta.
 */
function writeFileEnsured(p, buf) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
}

/**
 * 🖼 PNG de 1x1 px transparente (placeholder para iconos/logos si no tienes).
 */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64"
);

/**
 * 🧩 Crea un modelo temporal (pass.json + imágenes mínimas).
 * Si tienes una carpeta de modelo real, usa APPLE_PASS_MODEL_DIR.
 */
function buildTempModelDir({ orgName, passTypeId, teamId }) {
  const modelFromEnv = process.env.APPLE_PASS_MODEL_DIR;
  if (modelFromEnv && fs.existsSync(modelFromEnv)) {
    return modelFromEnv;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apple-pass-"));
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    organizationName: orgName,
    description: "Tarjeta de lealtad",
    logoText: orgName,
    storeCard: {
      primaryFields: [],
      secondaryFields: [],
      auxiliaryFields: [],
      backFields: []
    },
    barcode: {
      format: "PKBarcodeFormatQR",
      message: "placeholder",
      messageEncoding: "iso-8859-1"
    },
    backgroundColor: "rgb(255,255,255)",
    foregroundColor: "rgb(0,0,0)",
    labelColor: "rgb(0,0,0)"
  };

  writeFileEnsured(path.join(tmp, "pass.json"), Buffer.from(JSON.stringify(passJson, null, 2)));
  writeFileEnsured(path.join(tmp, "icon.png"), TINY_PNG);
  writeFileEnsured(path.join(tmp, "icon@2x.png"), TINY_PNG);
  writeFileEnsured(path.join(tmp, "logo.png"), TINY_PNG);
  writeFileEnsured(path.join(tmp, "logo@2x.png"), TINY_PNG);

  return tmp;
}

/**
 * 🪪 Construye un pase de Apple Wallet (.pkpass) en memoria.
 * @param {Object} data - Datos dinámicos del pase.
 * @returns {Promise<Buffer>} - Buffer binario del archivo .pkpass listo para enviar.
 */
export async function buildApplePassBuffer({ cardId, name, stamps, max }) {
  const TEAM_ID = process.env.APPLE_TEAM_ID;
  const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID;
  const ORG_NAME = process.env.APPLE_ORG_NAME || "Venus Cosmetología";

  if (!TEAM_ID || !PASS_TYPE_ID) {
    throw new Error("[Apple Wallet] Faltan APPLE_TEAM_ID o APPLE_PASS_TYPE_ID en variables de entorno.");
  }

  // 🔑 Carga certificados y llaves
  const wwdr = mustRead(process.env.APPLE_WWDR, "APPLE_WWDR (WWDR.pem)");
  const signerCert = mustRead(process.env.APPLE_PASS_CERT, "APPLE_PASS_CERT (pass.pem)");
  const signerKey = mustRead(process.env.APPLE_PASS_KEY, "APPLE_PASS_KEY (pass.key)");
  const signerKeyPassphrase = process.env.APPLE_PASS_PHRASE || undefined;

  // 📦 Modelo base del pase
  const model = buildTempModelDir({ orgName: ORG_NAME, passTypeId: PASS_TYPE_ID, teamId: TEAM_ID });

  // 🧠 Genera el pase
  const pass = await Pass.from({
    model,
    certificates: {
      wwdr,
      signerCert,
      signerKey,
      signerKeyPassphrase
    },
    overrides: {
      serialNumber: cardId,
      description: "Tarjeta de Lealtad Venus",
      organizationName: ORG_NAME,
      passTypeIdentifier: PASS_TYPE_ID,
      teamIdentifier: TEAM_ID,
      storeCard: {
        primaryFields: [
          { key: "name", label: "Cliente", value: name || "Cliente" }
        ],
        secondaryFields: [
          { key: "stamps", label: "Sellos", value: `${stamps}/${max}` }
        ],
        auxiliaryFields: [
          { key: "program", label: "Programa", value: "Lealtad Venus" }
        ],
        backFields: [
          { key: "terms", label: "Términos", value: "Completa tus sellos y canjea un facial gratis." }
        ]
      },
      barcode: {
        format: "PKBarcodeFormatQR",
        message: cardId,
        messageEncoding: "utf-8",
      }
    }
  });

  // 🖼️ Añade imágenes personalizadas si las tienes configuradas
  const addIfExists = (type, pathEnv) => {
    if (pathEnv && fs.existsSync(pathEnv)) pass.images.add(type, fs.readFileSync(pathEnv));
  };
  addIfExists("logo", process.env.APPLE_LOGO_PNG);
  addIfExists("logo@2x", process.env.APPLE_LOGO2X_PNG);
  addIfExists("icon", process.env.APPLE_ICON_PNG);
  addIfExists("icon@2x", process.env.APPLE_ICON2X_PNG);

  // 📤 Devuelve el .pkpass en Buffer
  const stream = pass.stream();
  const chunks = [];
  await new Promise((resolve, reject) => {
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  return Buffer.concat(chunks);
}