// lib/apple.js
import fs from "fs";
import os from "os";
import path from "node:path";

// ESTA ES LA FORMA QUE TE FUNCIONABA
import pkg from "passkit-generator";
const { PKPass } = pkg; // en tu versión PKPass viene aquí

/* ================== Helpers de lectura PEM ================== */
function readPemString(filePath, label) {
  if (!filePath) throw new Error(`[Apple Wallet] Falta ruta para ${label}`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[Apple Wallet] No existe ${label} en: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();

  // Si es un certificado “chain”, nos quedamos con el PRIMERO.
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

/* ================== Utilidades FS ================== */
function writeFileEnsured(p, buf) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
}

// PNG 1x1 placeholder
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64"
);

/* ================== Modelo temporal .pass ================== */
function buildTempModelDir({ orgName, passTypeId, teamId }) {
  const modelFromEnv = process.env.APPLE_PASS_MODEL_DIR;
  if (modelFromEnv && fs.existsSync(modelFromEnv)) return modelFromEnv;

  const base = fs.mkdtempSync(path.join(os.tmpdir(), "apple-pass-"));
  const dir = base.endsWith(".pass") ? base : `${base}.pass`;
  fs.mkdirSync(dir, { recursive: true });

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    organizationName: orgName,
    description: "Tarjeta de lealtad",
    logoText: orgName,

    // Dejamos storeCard vacío aquí; se rellena más adelante
    storeCard: {
      primaryFields: [],
      secondaryFields: [],
      auxiliaryFields: [],
      backFields: []
    },

    // Colores marca Venus (#8c9668, texto claro)
    backgroundColor: "rgb(140,150,104)",
    foregroundColor: "rgb(255,255,255)",
    labelColor: "rgb(255,255,255)",

    barcode: {
      format: "PKBarcodeFormatQR",
      message: "placeholder",
      messageEncoding: "iso-8859-1"
    }
  };

  writeFileEnsured(
    path.join(dir, "pass.json"),
    Buffer.from(JSON.stringify(passJson, null, 2))
  );
  // Placeholders, por si no hubiera imágenes
  writeFileEnsured(path.join(dir, "icon.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "icon@2x.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo@2x.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "strip.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "strip@2x.png"), TINY_PNG);

  return dir;
}

/* ================== Export buffer (API simple) ================== */
async function exportPassToBuffer(pass) {
  if (typeof pass.getAsBuffer === "function") {
    return await pass.getAsBuffer(); // esta es la que usabas antes
  }
  if (typeof pass.asBuffer === "function") {
    return await pass.asBuffer();
  }

  // Fallback por stream si hiciera falta
  const toStream =
    pass.getAsStream ||
    pass.asStream ||
    pass.toStream ||
    pass.stream ||
    null;

  if (typeof toStream === "function") {
    const stream = toStream.call(pass);
    return await new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (c) => chunks.push(c));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }

  throw new Error("[Apple Wallet] No encontré forma de exportar el pass a Buffer");
}

/* ================== Build .pkpass ================== */
export async function buildApplePassBuffer({ cardId, name, stamps, max }) {
  const TEAM_ID = process.env.APPLE_TEAM_ID;
  const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID;
  const ORG_NAME = process.env.APPLE_ORG_NAME || "Venus Cosmetología";

  if (!TEAM_ID || !PASS_TYPE_ID) {
    throw new Error("[Apple Wallet] Faltan APPLE_TEAM_ID o APPLE_PASS_TYPE_ID");
  }

  console.log(`[Apple Wallet] Generando pase para: ${cardId}`);

  const signerCertPem = readPemString(
    process.env.APPLE_PASS_CERT,
    "APPLE_PASS_CERT (pass.pem)"
  );
  const signerKeyPem = readText(
    process.env.APPLE_PASS_KEY,
    "APPLE_PASS_KEY (pass.key)"
  );
  const wwdrPem = readPemString(process.env.APPLE_WWDR, "APPLE_WWDR (wwdr.pem)");
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

  const model = buildTempModelDir({
    orgName: ORG_NAME,
    passTypeId: PASS_TYPE_ID,
    teamId: TEAM_ID
  });

  const certificates = {
    signerCert: signerCertPem,
    signerKey: signerKeyPem,
    wwdr: wwdrPem,
    signerKeyPassphrase
  };

  // === AQUÍ usamos PKPass como antes ===
  let pass;
  if (PKPass && typeof PKPass.from === "function") {
    pass = await PKPass.from({ model, certificates });
  } else if (typeof PKPass === "function") {
    pass = new PKPass({ model, certificates });
  } else {
    throw new Error(
      "[Apple Wallet] No se encontró la clase PKPass en passkit-generator"
    );
  }

  /* ====== Campos dinámicos ====== */

  if (typeof pass.setSerialNumber === "function") {
    pass.setSerialNumber(cardId);
  } else {
    pass.serialNumber = cardId;
  }

  const storeCardFields = {
    primaryFields: [
      {
        key: "name",
        label: "Cliente",
        value: name || "Cliente"
      }
    ],
    // aquí SOLO van los sellos (quitamos el “Cliente” pequeño)
    secondaryFields: [
      {
        key: "stamps",
        label: "Sellos",
        value: `${stamps}/${max}`
      }
    ],
    auxiliaryFields: [
      {
        key: "program",
        label: "Programa",
        value: "Lealtad Venus"
      }
    ],
    backFields: [
      {
        key: "terms",
        label: "Términos",
        value: "Completa tus sellos y canjea un facial gratis."
      }
    ]
  };

  if (
    pass.fields &&
    pass.fields.primaryFields &&
    typeof pass.fields.primaryFields.add === "function"
  ) {
    pass.fields.primaryFields.add(storeCardFields.primaryFields[0]);
    pass.fields.secondaryFields.add(storeCardFields.secondaryFields[0]);
    pass.fields.auxiliaryFields.add(storeCardFields.auxiliaryFields[0]);
    pass.fields.backFields.add(storeCardFields.backFields[0]);
  } else {
    pass.storeCard = storeCardFields;
  }

  const barcodeObj = {
    message: cardId,
    format: "PKBarcodeFormatQR",
    messageEncoding: "utf-8"
  };

  if (typeof pass.setBarcodes === "function") {
    pass.setBarcodes([barcodeObj]);
  } else {
    pass.barcode = barcodeObj;
  }

  // Colores Venus
  pass.backgroundColor = "rgb(140,150,104)"; // #8c9668
  pass.foregroundColor = "rgb(255,255,255)";
  pass.labelColor = "rgb(255,255,255)";

  /* ====== Imágenes personalizadas ====== */

  const publicAssetsDir = path.join(process.cwd(), "public", "assets");

  const addImg = (slot, envPath, fallbackName) => {
    const candidates = [];
    if (envPath) candidates.push(envPath);
    if (fallbackName) candidates.push(path.join(publicAssetsDir, fallbackName));

    const p = candidates.find((c) => c && fs.existsSync(c));
    if (!p) return;

    const buf = fs.readFileSync(p);

    if (typeof pass.addBuffer === "function") {
      pass.addBuffer(buf, `${slot}.png`);
    } else if (pass.images && typeof pass.images.add === "function") {
      pass.images.add(slot, buf);
    } else {
      writeFileEnsured(path.join(model, `${slot}.png`), buf);
    }
  };

  // icon / logo (usa logo.png si no hay rutas en .env)
  addImg("icon", process.env.APPLE_ICON_PNG, "logo.png");
  addImg("icon@2x", process.env.APPLE_ICON2X_PNG, "logo.png");
  addImg("logo", process.env.APPLE_LOGO_PNG, "logo.png");
  addImg("logo@2x", process.env.APPLE_LOGO2X_PNG, "logo.png");

  // ===== Strip dinámico de sellos =====
  try {
    const stripDir = path.join(publicAssetsDir, "strips");
    const clamped = Math.max(0, Math.min(Number(stamps) || 0, Number(max) || 0));
    const stripPath = path.join(stripDir, `strip_${clamped}.png`);

    if (fs.existsSync(stripPath)) {
      const stripBuffer = fs.readFileSync(stripPath);

      if (typeof pass.addBuffer === "function") {
        pass.addBuffer(stripBuffer, "strip.png");
        pass.addBuffer(stripBuffer, "strip@2x.png");
      } else if (pass.images && typeof pass.images.add === "function") {
        pass.images.add("strip", stripBuffer);
      } else {
        writeFileEnsured(path.join(model, "strip.png"), stripBuffer);
        writeFileEnsured(path.join(model, "strip@2x.png"), stripBuffer);
      }

      console.log(
        `[Apple Wallet] strip_${clamped}.png agregado como strip.png / strip@2x.png`
      );
    } else {
      console.warn(
        `[Apple Wallet] No encontré strip_${clamped}.png en ${stripDir}`
      );
    }
  } catch (e) {
    console.error("[Apple Wallet] Error agregando strip dinámico:", e);
  }

  const buffer = await exportPassToBuffer(pass);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("El .pkpass resultó vacío");
  }

  console.log(
    `[Apple Wallet] Pase generado correctamente, tamaño: ${buffer.length} bytes`
  );
  return buffer;
}