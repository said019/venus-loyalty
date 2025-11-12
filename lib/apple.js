// lib/apple.js
import fs from "fs";
import os from "os";
import path from "node:path";
import * as PassLib from "passkit-generator";

/* ================== Utilidades de FS ================== */
function mustRead(filePath, label) {
  try {
    return fs.readFileSync(filePath);
  } catch {
    throw new Error(`[Apple Wallet] No se pudo leer ${label} en: ${filePath}`);
  }
}

function writeFileEnsured(p, buf) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
}

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64"
);

/* ================== Resolver clase de la lib ================== */
function resolvePassClass() {
  // librerías conocidas: { PKPass }, { Pass }, default
  if (PassLib && typeof PassLib.PKPass === "function") return PassLib.PKPass;
  if (PassLib && typeof PassLib.Pass === "function") return PassLib.Pass;
  if (PassLib && typeof PassLib.default === "function") return PassLib.default;

  const keys = Object.keys(PassLib || {});
  throw new Error(
    `[Apple Wallet] La librería 'passkit-generator' en este runtime no expone una clase compatible.\n` +
    `Keys: ${JSON.stringify(keys)}`
  );
}

/* ================== Modelo temporal .pass ================== */
function buildTempModelDir({ orgName, passTypeId, teamId }) {
  const modelFromEnv = process.env.APPLE_PASS_MODEL_DIR;
  if (modelFromEnv && fs.existsSync(modelFromEnv)) {
    return modelFromEnv;
  }

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
    storeCard: { primaryFields: [], secondaryFields: [], auxiliaryFields: [], backFields: [] },
    backgroundColor: "rgb(255,255,255)",
    foregroundColor: "rgb(0,0,0)",
    labelColor: "rgb(0,0,0)",
    // Un código mínimo suele ayudar
    barcode: {
      format: "PKBarcodeFormatQR",
      message: "placeholder",
      messageEncoding: "iso-8859-1"
    }
  };

  writeFileEnsured(path.join(dir, "pass.json"), Buffer.from(JSON.stringify(passJson, null, 2)));
  writeFileEnsured(path.join(dir, "icon.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "icon@2x.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo@2x.png"), TINY_PNG);

  return dir;
}

/* ================== Exportar a Buffer (multi-API) ================== */
async function exportPassToBuffer(pass) {
  // APIs más comunes primero
  if (typeof pass.getAsBuffer === "function") return await pass.getAsBuffer();
  if (typeof pass.asBuffer === "function") return await pass.asBuffer();
  if (typeof pass.toBuffer === "function") return await pass.toBuffer();

  // APIs de stream
  const useStream = (s) => new Promise((resolve, reject) => {
    const chunks = [];
    s.on("data", (c) => chunks.push(c));
    s.on("end", () => resolve(Buffer.concat(chunks)));
    s.on("error", reject);
  });

  if (typeof pass.getAsStream === "function") return await useStream(pass.getAsStream());
  if (typeof pass.asStream === "function") return await useStream(pass.asStream());
  if (typeof pass.toStream === "function") return await useStream(pass.toStream());
  if (typeof pass.stream === "function") return await useStream(pass.stream());

  // Nada coincidió
  const keys = Object.getOwnPropertyNames(Object.getPrototypeOf(pass)).filter(k => typeof pass[k] === "function");
  throw new Error(
    `passkit-generator: no se pudo construir el PKPass (API de salida desconocida). ` +
    `Métodos disponibles: ${JSON.stringify(keys)}`
  );
}
// Verificar que los archivos se están leyendo correctamente
console.log("[APPLE] Cert paths:");
console.log("PASS_CERT:", process.env.APPLE_PASS_CERT);
console.log("PASS_KEY:", process.env.APPLE_PASS_KEY);
console.log("WWDR:", process.env.APPLE_WWDR);

console.log("[APPLE] Verificando archivos...");
console.log("PASS_CERT existe:", fs.existsSync(process.env.APPLE_PASS_CERT));
console.log("PASS_KEY existe:", fs.existsSync(process.env.APPLE_PASS_KEY));
console.log("WWDR existe:", fs.existsSync(process.env.APPLE_WWDR));
/* ================== Build .pkpass ================== */
export async function buildApplePassBuffer({ cardId, name, stamps, max }) {
  const TEAM_ID = process.env.APPLE_TEAM_ID;
  const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID;
  const ORG_NAME = process.env.APPLE_ORG_NAME || "Venus Cosmetología";
  if (!TEAM_ID || !PASS_TYPE_ID) {
    throw new Error("[Apple Wallet] Faltan APPLE_TEAM_ID o APPLE_PASS_TYPE_ID en variables de entorno.");
  }

  // Certificados
  const wwdr = mustRead(process.env.APPLE_WWDR, "APPLE_WWDR (WWDR.pem)");
  const signerCert = mustRead(process.env.APPLE_PASS_CERT, "APPLE_PASS_CERT (pass.pem)");
  const signerKey = mustRead(process.env.APPLE_PASS_KEY, "APPLE_PASS_KEY (pass.key)");
  const signerKeyPassphrase = process.env.APPLE_PASS_PHRASE || undefined;

  // Modelo
  const model = buildTempModelDir({ orgName: ORG_NAME, passTypeId: PASS_TYPE_ID, teamId: TEAM_ID });

  // Clase Pass
  const PassClass = resolvePassClass();

  // Crear a partir del modelo (la mayoría de versiones soportan .from)
  let pass;
  if (typeof PassClass.from === "function") {
    pass = await PassClass.from({
      model,
      certificates: { wwdr, signerCert, signerKey, signerKeyPassphrase }
    });
  } else {
    // Fallback: algunos exponen constructor directo
    pass = new PassClass({
      model,
      certificates: { wwdr, signerCert, signerKey, signerKeyPassphrase }
    });
  }

  // Rellenar campos (modo genérico)
  // Estas APIs cambian según versión; probamos sets típicos:
  const setField = (pathArr, value) => {
    // intenta establecer deep (storeCard.primaryFields, etc.)
    let ref = pass;
    for (let i = 0; i < pathArr.length - 1; i++) {
      const k = pathArr[i];
      if (ref[k] == null) ref[k] = {};
      ref = ref[k];
    }
    ref[pathArr[pathArr.length - 1]] = value;
  };

  // serialNumber
  if (typeof pass.setSerialNumber === "function") {
    pass.setSerialNumber(cardId);
  } else {
    pass.serialNumber = cardId;
  }

  // Identificadores y textos base
  setField(["passTypeIdentifier"], PASS_TYPE_ID);
  setField(["teamIdentifier"], TEAM_ID);
  setField(["organizationName"], ORG_NAME);
  setField(["description"], "Tarjeta de Lealtad Venus");

  // Estructura de StoreCard
  const storeCardObj = {
    primaryFields: [{ key: "name", label: "Cliente", value: name || "Cliente" }],
    secondaryFields: [{ key: "stamps", label: "Sellos", value: `${stamps}/${max}` }],
    auxiliaryFields: [{ key: "program", label: "Programa", value: "Lealtad Venus" }],
    backFields: [{ key: "terms", label: "Términos", value: "Completa tus sellos y canjea un facial gratis." }]
  };

  // Algunas versiones traen helpers:
  if (typeof pass.setBarcodes === "function") {
    pass.setBarcodes([{
      format: "PKBarcodeFormatQR",
      message: cardId,
      messageEncoding: "utf-8"
    }]);
  } else {
    setField(["barcode"], { format: "PKBarcodeFormatQR", message: cardId, messageEncoding: "utf-8" });
  }

  if (typeof pass.setStoreCard === "function") {
    pass.setStoreCard(storeCardObj);
  } else {
    setField(["storeCard"], storeCardObj);
  }

  // Colores (opcionales)
  setField(["backgroundColor"], "rgb(255,255,255)");
  setField(["foregroundColor"], "rgb(0,0,0)");
  setField(["labelColor"], "rgb(0,0,0)");

  // Imágenes personalizadas
  const addImage = (slot, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return;
    const buf = fs.readFileSync(filePath);
    // APIs típicas
    if (typeof pass.addBuffer === "function") {
      pass.addBuffer(buf, `${slot}.png`);
    } else if (pass.images && typeof pass.images.add === "function") {
      pass.images.add(slot, buf);
    } else {
      // fallback: escribir en el modelo
      writeFileEnsured(path.join(model, `${slot}.png`), buf);
    }
  };
  addImage("logo", process.env.APPLE_LOGO_PNG);
  addImage("logo@2x", process.env.APPLE_LOGO2X_PNG);
  addImage("icon", process.env.APPLE_ICON_PNG);
  addImage("icon@2x", process.env.APPLE_ICON2X_PNG);

  // Exportar a Buffer (detecta API)
  const buf = await exportPassToBuffer(pass);
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    throw new Error("passkit-generator: exportó un buffer vacío.");
  }
  return buf;
}