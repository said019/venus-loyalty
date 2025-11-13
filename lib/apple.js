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
  logo: path.join(ASSETS_DIR, "logo.png"),   // logo principal (cuadrado)
  icon: path.join(ASSETS_DIR, "logo.png"),   // usamos el mismo para el icono
  strip: path.join(ASSETS_DIR, "hero.png"),  // imagen horizontal / hero
  stamp: path.join(ASSETS_DIR, "stamp.png"), // reservado para futuro
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

  // Colores de marca:
  //   fondo:  #898e78  -> rgb(137,142,120)
  //   texto:  #fff6e3  -> rgb(255,246,227)
  //   labels: #cdd8a6  -> rgb(205,216,166)
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

    backgroundColor: "rgb(137,142,120)", // verde fuerte
    foregroundColor: "rgb(255,246,227)", // texto principal crema
    labelColor: "rgb(205,216,166)",      // labels suaves

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

  // Ojo: NO creamos icon/logo/strip aquí.
  // Los inyectamos luego con pass.images.add(...)
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

    // 2) Modelo con datos de la tarjeta
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

    // 3) Crear pass con passkit-generator v3
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

    console.log("[Apple Wallet] Instancia PKPass creada");

    /* 4) Imágenes de marca */
    const addImage = (slot, filePath) => {
      if (!filePath || !fs.existsSync(filePath)) {
        console.log(`[Apple Wallet] Imagen no encontrada (${slot}): ${filePath}`);
        return;
      }
      const buf = fs.readFileSync(filePath);

      if (pass.images && typeof pass.images.add === "function") {
        // API moderna: slot = "logo" | "icon" | "strip" | "thumbnail"
        pass.images.add(slot, buf);
        console.log(`[Apple Wallet] Imagen agregada (images.add): ${slot}`);
      } else if (typeof pass.addBuffer === "function") {
        // Fallback por si acaso
        const filename = `${slot}.png`;
        pass.addBuffer(buf, filename);
        console.log(`[Apple Wallet] Imagen agregada (addBuffer): ${filename}`);
      } else {
        console.log(
          "[Apple Wallet] No hay API de imágenes disponible en pass (ni images.add ni addBuffer)"
        );
      }
    };

    // Logo encabezado
    addImage("logo", IMAGE_PATHS.logo);
    // Icono que se ve en la lista de Wallet
    addImage("icon", IMAGE_PATHS.icon);
    // Banda hero / strip
    addImage("strip", IMAGE_PATHS.strip);
    // Futuro: miniatura con sellos
    // addImage("thumbnail", IMAGE_PATHS.stamp);

    // 5) Exportar a Buffer
    console.log("[Apple Wallet] Exportando a buffer...");
    const buffer = pass.getAsBuffer();

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error("El .pkpass resultó vacío");
    }

    console.log(
      `[Apple Wallet] Pase generado OK, tamaño: ${buffer.length} bytes`
    );
    return buffer;
  } catch (error) {
    console.error("[Apple Wallet] Error crítico en buildApplePassBuffer:", error);
    throw error;
  }
}