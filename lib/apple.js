// lib/apple.js
import fs from "fs";
import os from "os";
import path from "node:path";
import * as PassLib from "passkit-generator";

/* ================== Helpers de lectura PEM ================== */
// La librería / node-forge espera STRINGS PEM, no Buffers.
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

/* ================== Resolver clase exportada ================== */
function getPassClass() {
  if (PassLib && typeof PassLib.PKPass === "function") return PassLib.PKPass; // v3+
  if (PassLib && typeof PassLib.Pass === "function") return PassLib.Pass; // v2
  if (PassLib && typeof PassLib.default === "function") return PassLib.default;

  throw new Error(
    `[Apple Wallet] 'passkit-generator' no expone una clase compatible. Keys: ${Object.keys(
      PassLib
    )}`
  );
}

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
    storeCard: {
      primaryFields: [],
      secondaryFields: [],
      auxiliaryFields: [],
      backFields: [],
    },
    backgroundColor: "rgb(255,255,255)",
    foregroundColor: "rgb(0,0,0)",
    labelColor: "rgb(0,0,0)",
    barcode: {
      format: "PKBarcodeFormatQR",
      message: "placeholder",
      messageEncoding: "iso-8859-1",
    },
  };

  writeFileEnsured(
    path.join(dir, "pass.json"),
    Buffer.from(JSON.stringify(passJson, null, 2))
  );
  writeFileEnsured(path.join(dir, "icon.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "icon@2x.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo@2x.png"), TINY_PNG);

  return dir;
}

/* ================== Export buffer (distintas APIs) ================== */
async function exportPassToBuffer(pass) {
  if (typeof pass.getAsBuffer === "function") return await pass.getAsBuffer();
  if (typeof pass.asBuffer === "function") return await pass.asBuffer();
  if (typeof pass.toBuffer === "function") return await pass.toBuffer();

  const collect = (s) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      s.on("data", (c) => chunks.push(c));
      s.on("end", () => resolve(Buffer.concat(chunks)));
      s.on("error", reject);
    });

  if (typeof pass.getAsStream === "function") return await collect(pass.getAsStream());
  if (typeof pass.asStream === "function") return await collect(pass.asStream());
  if (typeof pass.toStream === "function") return await collect(pass.toStream());
  if (typeof pass.stream === "function") return await collect(pass.stream());

  const keys = Object.getOwnPropertyNames(Object.getPrototypeOf(pass)).filter(
    (k) => typeof pass[k] === "function"
  );
  throw new Error(
    `No encontré API de salida compatible. Métodos: ${JSON.stringify(keys)}`
  );
}

/* ================== Build .pkpass (EXPORT) ================== */
export async function buildApplePassBuffer({ cardId, name, stamps, max }) {
  const TEAM_ID = process.env.APPLE_TEAM_ID;
  const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID;
  const ORG_NAME = process.env.APPLE_ORG_NAME || "Venus Cosmetología";

  if (!TEAM_ID || !PASS_TYPE_ID) {
    throw new Error("[Apple Wallet] Faltan APPLE_TEAM_ID o APPLE_PASS_TYPE_ID");
  }

  // Cargar PEMs como STRING
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
    throw new Error("[Apple Wallet] pass.key no es una llave privada válida (RSA/PKCS#8)");
  }

  const model = buildTempModelDir({
    orgName: ORG_NAME,
    passTypeId: PASS_TYPE_ID,
    teamId: TEAM_ID,
  });

  const PassClass = getPassClass();

  const certs = {
    signerCert: signerCertPem,
    signerKey: signerKeyPem,
    wwdr: wwdrPem,
    signerKeyPassphrase,
  };

  let pass;
  if (typeof PassClass.from === "function") {
    pass = await PassClass.from({ model, certificates: certs });
  } else {
    pass = new PassClass({ model, certificates: certs });
  }

  // Serial
  if (typeof pass.setSerialNumber === "function") {
    pass.setSerialNumber(cardId);
  } else {
    pass.serialNumber = cardId;
  }

  // Campos
  const storeCardFields = {
    primaryFields: [{ key: "name", label: "Cliente", value: name || "Cliente" }],
    secondaryFields: [{ key: "stamps", label: "Sellos", value: `${stamps}/${max}` }],
    auxiliaryFields: [{ key: "program", label: "Programa", value: "Lealtad Venus" }],
    backFields: [
      {
        key: "terms",
        label: "Términos",
        value: "Completa tus sellos y canjea un facial gratis.",
      },
    ],
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

  // Código de barras
  const barcodeObj = {
    message: cardId,
    format: "PKBarcodeFormatQR",
    messageEncoding: "utf-8",
  };

  if (typeof pass.setBarcodes === "function") {
    pass.setBarcodes([barcodeObj]);
  } else {
    pass.barcode = barcodeObj;
  }

  // Colores
  pass.backgroundColor = "rgb(255,255,255)";
  pass.foregroundColor = "rgb(0,0,0)";
  pass.labelColor = "rgb(0,0,0)";

  // Imágenes personalizadas
  const addImg = (slot, p) => {
    if (!p || !fs.existsSync(p)) return;
    const buf = fs.readFileSync(p);

    if (typeof pass.addBuffer === "function") {
      pass.addBuffer(buf, `${slot}.png`);
    } else if (pass.images && typeof pass.images.add === "function") {
      pass.images.add(slot, buf);
    } else {
      writeFileEnsured(path.join(model, `${slot}.png`), buf);
    }
  };

  addImg("logo", process.env.APPLE_LOGO_PNG);
  addImg("logo@2x", process.env.APPLE_LOGO2X_PNG);
  addImg("icon", process.env.APPLE_ICON_PNG);
  addImg("icon@2x", process.env.APPLE_ICON2X_PNG);

  const buffer = await exportPassToBuffer(pass);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("El .pkpass resultó vacío");
  }

  return buffer;
} // <-- AQUÍ ESTÁ EL NAMED EXPORT