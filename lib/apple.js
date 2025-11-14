// lib/apple.js
import fs from "fs";
import os from "os";
import path from "node:path";
import PKPass from "passkit-generator";

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

// PNG 1x1 placeholder para iconos obligatorios
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
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "venus-pass-"));
  const dir = `${tmpRoot}.pass`;
  fs.mkdirSync(dir, { recursive: true });

  // clamp de sellos para elegir imagen strip_X.png
  const safeMax = Number.isInteger(max) && max > 0 ? max : 8;
  let safeStamps = Number.isInteger(stamps) ? stamps : 0;
  if (safeStamps < 0) safeStamps = 0;
  if (safeStamps > safeMax) safeStamps = safeMax;

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    serialNumber: cardId,
    organizationName: orgName,
    description: "Tarjeta de lealtad Venus",
    logoText: "Venus Cosmetología",

    // Colores de tu marca (fondo verde fuerte y texto crema)
    backgroundColor: "rgb(140,150,104)",   // #8c9668
    foregroundColor: "rgb(255,246,227)",   // #fff6e3
    labelColor: "rgb(255,246,227)",

    // Layout tipo storeCard (loyalty)
    storeCard: {
      headerFields: [
        {
          key: "programa",
          label: "PROGRAMA",
          value: "Lealtad Venus",
        },
      ],
      primaryFields: [
        {
          key: "name",
          // label vacío para que NO salga "Cliente" pequeño debajo
          label: "",
          value: name || "Cliente",
        },
      ],
      secondaryFields: [
        {
          key: "stamps",
          label: "Sellos",
          value: `${safeStamps}/${safeMax}`,
        },
      ],
      backFields: [
        {
          key: "terms",
          label: "Términos",
          value:
            "Completa tus sellos y canjea un facial de cortesía en Venus Cosmetología.",
        },
      ],
    },

    // Código de barras (QR) con el id de la tarjeta
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: cardId,
        messageEncoding: "iso-8859-1",
      },
    ],
  };

  // ---- Escribimos pass.json
  writeFileEnsured(
    path.join(dir, "pass.json"),
    Buffer.from(JSON.stringify(passJson, null, 2))
  );

  // ---- Iconos mínimos obligatorios
  writeFileEnsured(path.join(dir, "icon.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "icon@2x.png"), TINY_PNG);

  // ---- Strip dinámico según sellos: strip_0.png ... strip_8.png
  //     Deben estar en: public/assets/strip_0.png, strip_1.png, etc.
  const stripFileName = `strip_${safeStamps}.png`;
  const stripSourcePath = path.join(
    process.cwd(),
    "public",
    "assets",
    stripFileName
  );

  if (fs.existsSync(stripSourcePath)) {
    const stripBuf = fs.readFileSync(stripSourcePath);
    // Lo usamos como strip y también como background para que se vea como en tu mock
    writeFileEnsured(path.join(dir, "strip.png"), stripBuf);
    writeFileEnsured(path.join(dir, "background.png"), stripBuf);
    console.log(`[Apple Wallet] Usando imagen de strip: ${stripFileName}`);
  } else {
    console.log(
      `[Apple Wallet] No se encontró ${stripSourcePath}, usando sólo colores planos`
    );
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
      throw new Error(
        "[Apple Wallet] Faltan APPLE_TEAM_ID o APPLE_PASS_TYPE_ID"
      );
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

    // 2) Modelo ya con datos de esta tarjeta + strip correspondiente
    const modelDir = buildTempModelDir({
      orgName: ORG_NAME,
      passTypeId: PASS_TYPE_ID,
      teamId: TEAM_ID,
      cardId,
      name,
      stamps,
      max,
    });

    console.log(`[Apple Wallet] Modelo creado en: ${modelDir}`);

    // 3) Crear pass con passkit-generator
    const certificates = {
      signerCert: signerCertPem,
      signerKey: signerKeyPem,
      wwdr: wwdrPem,
      signerKeyPassphrase,
    };

    const pass = await PKPass.from({
      model: modelDir,          // IMPORTANTE: string con la ruta
      certificates,
    });

    console.log("[Apple Wallet] PKPass instancia creada, exportando buffer…");

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