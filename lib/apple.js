// lib/apple.js
import fs from "fs";
import os from "os";
import path from "node:path";
import pkg from "passkit-generator";

// La librería expone PKPass como propiedad del default
const { PKPass } = pkg;

/* =========================================================
   Helpers para leer PEM como STRING
   ========================================================= */
function readPemString(filePath, label) {
  if (!filePath) throw new Error(`[Apple Wallet] Falta ruta para ${label}`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[Apple Wallet] No existe ${label} en: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();

  // Si es un chain, nos quedamos con el PRIMER CERTIFICADO
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

// PNG 1x1 placeholder (por si faltan iconos)
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64"
);

/* =========================================================
   Elegir imagen de strip según sellos
   ========================================================= */
function pickStripPath(stamps, max) {
  // Carpeta donde tienes tus strips (stamps-0.png ... stamps-8.png)
  const baseDir =
    process.env.APPLE_STRIP_BASE ||
    path.join(process.cwd(), "public", "assets");

  const safeMax = Number.isFinite(max) && max > 0 ? max : 8;
  let s = Number.isFinite(stamps) ? stamps : 0;
  if (s < 0) s = 0;
  if (s > safeMax) s = safeMax;

  const fileName = `stamps-${s}.png`; // ej: stamps-0.png ... stamps-8.png
  return path.join(baseDir, fileName);
}

/* =========================================================
   Construir modelo temporal .pass con el diseño de la marca
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

  const safeName = name || "Cliente";
  const safeMax = Number.isFinite(max) && max > 0 ? max : 8;
  const safeStamps = Number.isFinite(stamps) && stamps >= 0 ? stamps : 0;

  // 🎨 Colores de marca (ajustados a tu paleta)
  const backgroundColor = "rgb(214, 246, 233)"; // verde menta claro
  const foregroundColor = "rgb(20, 83, 66)";    // verde oscuro texto
  const labelColor      = "rgb(20, 83, 66)";

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    serialNumber: String(cardId),
    organizationName: orgName,
    description: "Tarjeta de Lealtad Venus",
    logoText: "Venus Cosmetología",

    storeCard: {
      headerFields: [
        {
          key: "program",
          label: "Programa",
          value: "Lealtad Venus",
        },
      ],
      // 👇 Dejamos el frente limpio para el progreso, sin “Cliente” pequeño
      primaryFields: [
        {
          key: "stamps",
          label: "Sellos",
          value: `${safeStamps}/${safeMax}`,
        },
      ],
      secondaryFields: [
        {
          key: "id",
          label: "ID Tarjeta",
          value: String(cardId),
        },
      ],
      auxiliaryFields: [],
      backFields: [
        {
          key: "terms",
          label: "Términos",
          value:
            "Completa tus sellos y canjea un facial gratis en Venus Cosmetología.",
        },
        {
          key: "client",
          label: "Cliente",
          value: safeName,
        },
      ],
    },

    backgroundColor,
    foregroundColor,
    labelColor,

    // Usamos barcodes (plural) para passkit-generator v3+
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
          message: String(cardId),
          messageEncoding: "iso-8859-1",
      },
    ],
  };

  writeFileEnsured(
    path.join(dir, "pass.json"),
    Buffer.from(JSON.stringify(passJson, null, 2))
  );
  // iconos mínimos (por si no pones los tuyos por ENV)
  writeFileEnsured(path.join(dir, "icon.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "icon@2x.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo@2x.png"), TINY_PNG);

  return dir;
}

/* =========================================================
   Exportar buffer
   ========================================================= */
function exportPassToBuffer(pass) {
  // En v3 getAsBuffer es síncrono
  if (typeof pass.getAsBuffer === "function") {
    return pass.getAsBuffer();
  }
  if (typeof pass.asBuffer === "function") {
    return pass.asBuffer();
  }
  if (typeof pass.toBuffer === "function") {
    return pass.toBuffer();
  }
  throw new Error("No encontré API de buffer en PKPass");
}

/* =========================================================
   Función principal: buildApplePassBuffer
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

    // 1) Certificados como STRING PEM
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

    // Validaciones básicas
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

    // 2) Modelo temporal con campos ya rellenados
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

    const certificates = {
      signerCert: signerCertPem,
      signerKey: signerKeyPem,
      wwdr: wwdrPem,
      signerKeyPassphrase,
    };

    // 3) Crear instancia de PKPass desde el modelo
    const pass = await PKPass.from({
      model: modelDir,
      certificates,
    });

    // 4) Añadir imágenes de marca (logo, icono) si las tienes en ENV
    const addImageSlot = (slot, absPath) => {
      if (!absPath) return;
      if (!fs.existsSync(absPath)) {
        console.warn(`[Apple Wallet] Imagen no encontrada en disco: ${absPath}`);
        return;
      }
      // 🔴 MUY IMPORTANTE:
      // pass.images.add(slot, RUTA_STRING), NO Buffer
      pass.images.add(slot, absPath);
      console.log(`[Apple Wallet] Imagen agregada en slot "${slot}" desde ${absPath}`);
    };

    addImageSlot("logo", process.env.APPLE_LOGO_PNG);
    addImageSlot("logo@2x", process.env.APPLE_LOGO2X_PNG);
    addImageSlot("icon", process.env.APPLE_ICON_PNG);
    addImageSlot("icon@2x", process.env.APPLE_ICON2X_PNG);

    // 5) Strip dinámico según sellos
    const stripPath = pickStripPath(stamps, max);
    if (fs.existsSync(stripPath)) {
      // Apple slot: "strip" (la librería se encarga de meterlo como strip.png)
      pass.images.add("strip", stripPath);
      console.log(`[Apple Wallet] Strip dinámico agregado: ${stripPath}`);
    } else {
      console.warn(
        `[Apple Wallet] Strip NO encontrado para sellos=${stamps}: ${stripPath}`
      );
    }

    // 6) Exportar a Buffer
    const buffer = exportPassToBuffer(pass);
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error("El .pkpass resultó vacío");
    }

    console.log(
      `[Apple Wallet] Pase generado correctamente (${buffer.length} bytes)`
    );
    return buffer;
  } catch (error) {
    console.error("[Apple Wallet] Error crítico en buildApplePassBuffer:", error);
    throw error;
  }
}