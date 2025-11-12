// lib/apple.js
import fs from "fs";
import os from "os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PassPkg = require("passkit-generator");

/* ========= Resolución robusta de clase y fábrica ========== */
function makePassFactory(pkg) {
  // Escoge la clase que exporte el paquete en este runtime
  const Klass =
    pkg?.PKPass ??
    pkg?.Pass ??
    pkg?.default?.PKPass ??
    pkg?.default?.Pass ??
    (typeof pkg === "function" ? pkg : undefined);

  if (!Klass) {
    const keys = Object.keys(pkg || {});
    const dkeys = Object.keys((pkg && pkg.default) || {});
    throw new Error(
      `[Apple Wallet] 'passkit-generator' no expone una clase válida. Keys: ${JSON.stringify(
        keys
      )} | defaultKeys: ${JSON.stringify(dkeys)}`
    );
  }

  // Algunas versiones usan `Class.from(opts)` y otras `new Class(opts)`
  if (typeof Klass.from === "function") {
    return async (opts) => Klass.from(opts);
  }
  if (typeof Klass === "function") {
    return async (opts) => new Klass(opts);
  }

  throw new Error("[Apple Wallet] La clase de passkit no tiene API .from ni constructor.");
}

const createPass = makePassFactory(PassPkg);

/* =================== utilidades =================== */
function mustRead(filePath, label) {
  try { return fs.readFileSync(filePath); }
  catch { throw new Error(`[Apple Wallet] No se pudo leer ${label} (${filePath})`); }
}

function writeFileEnsured(p, buf) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
}

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64"
);

/** Modelo mínimo si no existe APPLE_PASS_MODEL_DIR */
function buildTempModelDir({ orgName, passTypeId, teamId }) {
  const modelFromEnv = process.env.APPLE_PASS_MODEL_DIR;
  if (modelFromEnv && fs.existsSync(modelFromEnv)) return modelFromEnv;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apple-pass-"));
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    organizationName: orgName,
    description: "Tarjeta de Lealtad",
    logoText: orgName,
    storeCard: { primaryFields: [], secondaryFields: [], auxiliaryFields: [], backFields: [] },
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

/* Añade un campo sin importar si la API usa .add o .push */
function addField(listLike, field) {
  if (!listLike) return;
  if (typeof listLike.add === "function") return listLike.add(field);
  if (typeof listLike.push === "function") return listLike.push(field);
  // fallback: si es un array plain
  if (Array.isArray(listLike)) listLike.push(field);
}

/* =================== API principal =================== */
export async function buildApplePassBuffer({ cardId, name, stamps, max }) {
  const TEAM_ID      = process.env.APPLE_TEAM_ID;
  const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID;
  const ORG_NAME     = process.env.APPLE_ORG_NAME || "Venus Cosmetología";
  if (!TEAM_ID || !PASS_TYPE_ID) {
    throw new Error("[Apple Wallet] Faltan APPLE_TEAM_ID o APPLE_PASS_TYPE_ID.");
  }

  // Certificados y llaves
  const wwdr       = mustRead(process.env.APPLE_WWDR,      "APPLE_WWDR (wwdr.pem)");
  const signerCert = mustRead(process.env.APPLE_PASS_CERT, "APPLE_PASS_CERT (pass.pem)");
  const signerKey  = mustRead(process.env.APPLE_PASS_KEY,  "APPLE_PASS_KEY (pass.key)");
  const signerKeyPassphrase = process.env.APPLE_PASS_PHRASE || undefined;

  const model = buildTempModelDir({ orgName: ORG_NAME, passTypeId: PASS_TYPE_ID, teamId: TEAM_ID });

  // Crea el pass (constructor o .from)
  const pass = await createPass({
    model,
    certificates: { wwdr, signerCert, signerKey, signerKeyPassphrase }
  });

  /* ---- Set de propiedades con compatibilidad ---- */
  try { pass.serialNumber = cardId; } catch {}
  try { pass.description = "Tarjeta de Lealtad Venus"; } catch {}
  try { pass.organizationName = ORG_NAME; } catch {}
  try { pass.passTypeIdentifier = PASS_TYPE_ID; } catch {}
  try { pass.teamIdentifier = TEAM_ID; } catch {}

  // Estructuras de campos; intentamos ambas formas comunes
  const store = pass.storeCard || pass;
  addField(store?.primaryFields,   { key: "name",   label: "Cliente",  value: name || "Cliente" });
  addField(store?.secondaryFields, { key: "stamps", label: "Sellos",   value: `${stamps}/${max}` });
  addField(store?.auxiliaryFields, { key: "program",label: "Programa", value: "Lealtad Venus" });
  addField(store?.backFields,      { key: "terms",  label: "Términos", value: "Completa tus sellos y canjea un facial gratis." });

  // Código de barras
  if (typeof pass.setBarcodes === "function") {
    pass.setBarcodes([{ format: "PKBarcodeFormatQR", message: cardId, messageEncoding: "utf-8" }]);
  } else {
    try {
      pass.barcode = { format: "PKBarcodeFormatQR", message: cardId, messageEncoding: "utf-8" };
    } catch {}
  }

  // Imágenes opcionales
  const addImage = (type, p) => { if (p && fs.existsSync(p)) pass.images?.add?.(type, fs.readFileSync(p)); };
  addImage("logo",    process.env.APPLE_LOGO_PNG);
  addImage("logo@2x", process.env.APPLE_LOGO2X_PNG);
  addImage("icon",    process.env.APPLE_ICON_PNG);
  addImage("icon@2x", process.env.APPLE_ICON2X_PNG);

  // Genera el .pkpass
  if (typeof pass.stream === "function") {
    const chunks = [];
    const stream = pass.stream();
    await new Promise((resolve, reject) => {
      stream.on("data", (c) => chunks.push(c));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    return Buffer.concat(chunks);
  }

  if (typeof pass.asBuffer === "function") {
    // algunas variantes exponen asBuffer()
    return await pass.asBuffer();
  }

  throw new Error("passkit-generator: no se pudo construir el PKPass (API de salida desconocida).");
}