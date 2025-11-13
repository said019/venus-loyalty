// lib/apple.js
import fs from "fs";
import os from "os";
import path from "node:path";

// Passkit (v3.x, CommonJS en ESM)
import pkg from "passkit-generator";
const { PKPass } = pkg;

/* =============== Colores de marca =============== */
// Paleta que me diste:
// #898e78, #fff6e3, #cdd8a6, #8c9668
const BRAND_COLORS = {
  background: "rgb(140,150,104)",  // #8c9668 (verde fuerte)
  text:        "rgb(255,246,227)", // #fff6e3 (crema)
  labels:      "rgb(137,142,120)", // #898e78 (verde grisáceo)
};

/* =============== Helpers PEM =============== */
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

/* =============== Utils FS =============== */
function writeFileEnsured(p, buf) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
}

// PNG 1x1 placeholder por si falta algo
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64"
);

/* =============== Modelo temporal .pass =============== */
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
    description: "Tarjeta de lealtad",
    logoText: orgName,

    /* ---- Layout tipo tarjeta de sellos ---- */
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
          label: "SELLOS",
          value: `${stamps}/${max}`,          // 👈 aquí se ve el progreso 0/8, 4/8, etc
        },
      ],
      auxiliaryFields: [
        {
          key: "program",
          label: "PROGRAMA",
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

    /* ---- Colores de marca (Opción D) ---- */
    backgroundColor: BRAND_COLORS.background,
    foregroundColor: BRAND_COLORS.text,
    labelColor: BRAND_COLORS.labels,

    /* ---- Código QR ---- */
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: cardId,
        messageEncoding: "iso-8859-1",
      },
    ],
  };

  // Archivos mínimos del modelo
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

/* =============== Build .pkpass =============== */
export async function buildApplePassBuffer({ cardId, name, stamps, max }) {
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

    /* 1) Certificados (PEM como string) */
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

    /* 2) Modelo de esta tarjeta */
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

    /* 3) Crear instancia de PKPass */
    const certificates = {
      signerCert: signerCertPem,
      signerKey: signerKeyPem,
      wwdr: wwdrPem,
      signerKeyPassphrase,
    };

    const pass = await PKPass.from({
      model,
      certificates,
    });

    console.log(`[Apple Wallet] PKPass instancia creada`);

    /* 4) Imágenes de marca (logo / icon) */
    const addImg = (slot, p) => {
      if (!p || !fs.existsSync(p)) {
        console.log(`[Apple Wallet] Imagen no encontrada: ${slot} -> ${p}`);
        return;
      }
      try {
        const buf = fs.readFileSync(p);
        pass.addBuffer(buf, `${slot}.png`);
        console.log(`[Apple Wallet] Imagen agregada: ${slot}.png`);
      } catch (imgError) {
        console.error(`[Apple Wallet] Error agregando imagen ${slot}:`, imgError);
      }
    };

    // 👇 Usa tus archivos en /assets
    // (en Render las rutas deben ser absolutas desde /opt/render/project/src)
    addImg("logo", process.env.APPLE_LOGO_PNG);      // ej: "./assets/logo.png"
    addImg("logo@2x", process.env.APPLE_LOGO2X_PNG); // puedes usar el mismo
    addImg("icon", process.env.APPLE_ICON_PNG);      // ej: "./assets/logo.png"
    addImg("icon@2x", process.env.APPLE_ICON2X_PNG);

    /* 5) Exportar a buffer */
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
    console.error(
      "[Apple Wallet] Error crítico en buildApplePassBuffer:",
      error
    );
    throw error;
  }
}