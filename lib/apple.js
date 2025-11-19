// lib/apple.js
import fs from "fs";
import os from "os";
import path from "node:path";
import * as PassLib from "passkit-generator";

/* =============== Resolver clase PKPass de forma segura =============== */
function getPassClass() {
  if (PassLib && typeof PassLib.PKPass === "function") return PassLib.PKPass;
  if (PassLib && typeof PassLib.Pass === "function") return PassLib.Pass;
  if (PassLib && typeof PassLib.default === "function") return PassLib.default;
  if (PassLib && PassLib.default && typeof PassLib.default.PKPass === "function")
    return PassLib.default.PKPass;
  if (typeof PassLib === "function") return PassLib;

  throw new Error(
    `[Apple Wallet] 'passkit-generator' no expone una clase compatible. Keys: ${Object.keys(
      PassLib || {}
    )}`
  );
}

/* =============== Helpers de lectura PEM =============== */
function readPemString(filePath, label) {
  if (!filePath) throw new Error(`[Apple Wallet] Falta ruta para ${label}`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[Apple Wallet] No existe ${label} en: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();

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

  // CAMBIO CLAVE: usar "generic" en lugar de "storeCard"
  // para tener más control visual con strip/thumbnail
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    serialNumber: cardId,
    webServiceURL: process.env.BASE_URL + '/api/apple/v1',
    authenticationToken: process.env.APPLE_AUTH_TOKEN,
    organizationName: orgName,
    description: "Tarjeta de Lealtad Venus",
    logoText: "Venus Cosmetología",

    // Tipo GENERIC con campos optimizados
        // Tipo STORE CARD (usa strip.png)
    storeCard: {
      primaryFields: [
        {
          key: "name",
          label: "CLIENTE",
          value: name || "Cliente",
        },
      ],
      secondaryFields: [
        {
          key: "stamps",
          label: "SELLOS",
          value: `${stamps}/${max}`,
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
          label: "Términos y Condiciones",
          value:
            "Completa tus sellos y canjea un facial gratis.\n\nVálido en Venus Cosmetología.",
        },
        {
          key: "card_details",
          label: "Detalles de la Tarjeta",
          value: `Cliente: ${name || "Cliente"}\nSellos: ${stamps}/${max}`,
        },
      ],
    },

    // Colores exactos de tu mockup
    backgroundColor: "rgb(154, 159, 130)", // el gris-verde de tu imagen
    foregroundColor: "rgb(255, 255, 255)", // texto blanco
    labelColor: "rgb(255, 255, 255)",      // labels blancos

    // QR Code
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: cardId,
        messageEncoding: "iso-8859-1",
      },
    ],

    // Relevancia (opcional: hace que aparezca en lock screen si está cerca)
    relevantDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  writeFileEnsured(
    path.join(dir, "pass.json"),
    Buffer.from(JSON.stringify(passJson, null, 2))
  );

  // Iconos mínimos (se reemplazarán con los reales)
  writeFileEnsured(path.join(dir, "icon.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "icon@2x.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo.png"), TINY_PNG);
  writeFileEnsured(path.join(dir, "logo@2x.png"), TINY_PNG);

  return dir;
}

/* =============== Export buffer (distintas APIs) =============== */
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

    // Certificados como STRING PEM
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

    // Modelo
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

    const PassClass = getPassClass();

    // Crear instancia de pass
    let pass;
    const certs = {
      wwdr: wwdrPem,
      signerCert: signerCertPem,
      signerKey: signerKeyPem,
      signerKeyPassphrase,
    };

    if (typeof PassClass.from === "function") {
      pass = await PassClass.from(
        { model, certificates: certs },
        { serialNumber: cardId }
      );
    } else {
      pass = new PassClass({ model, certificates: certs });
      if (typeof pass.setSerialNumber === "function") {
        pass.setSerialNumber(cardId);
      } else {
        pass.serialNumber = cardId;
      }
    }

    console.log("[Apple Wallet] PKPass instancia creada");

    /* ---------- IMÁGENES PERSONALIZADAS ---------- */
    const assetsDir = path.join(process.cwd(), "public", "assets");

    // 1) Logo e Icono (160x50px para logo, 29x29px para icon - pero se escala)
    const logoPath = path.join(assetsDir, "logo.png");
    if (fs.existsSync(logoPath)) {
      const buf = fs.readFileSync(logoPath);
      pass.addBuffer("logo.png", buf);
      pass.addBuffer("logo@2x.png", buf);
      pass.addBuffer("icon.png", buf);
      pass.addBuffer("icon@2x.png", buf);
      console.log("[Apple Wallet] Logo/Icono agregados");
    } else {
      console.warn("[Apple Wallet] ⚠️  No se encontró logo.png");
    }

    // 2) STRIP - La imagen más importante (375x123px @1x, 750x246px @2x)
    //    Esta aparece en la parte superior del pase tipo generic
    const safeMax = Number(max) || 8;
    const safeStamps = Math.max(0, Math.min(Number(stamps) || 0, safeMax));
    
    // Buscar con diferentes nombres posibles
    const stripVariants = [
      `stamp-strip-${safeStamps}.png`,
      `strip-${safeStamps}.png`,
      `stamps-${safeStamps}.png`,
    ];

    let stripFound = false;
    for (const variant of stripVariants) {
      const stripFile = path.join(assetsDir, variant);
      if (fs.existsSync(stripFile)) {
        const buf = fs.readFileSync(stripFile);
        pass.addBuffer("strip.png", buf);
        pass.addBuffer("strip@2x.png", buf); // Usar la misma para @2x si no hay versión específica
        console.log(`[Apple Wallet] ✓ Strip agregado: ${variant}`);
        stripFound = true;
        break;
      }
    }

    if (!stripFound) {
      console.warn(`[Apple Wallet] ⚠️  No se encontró ningún archivo de strip para ${safeStamps} sellos`);
      console.warn(`[Apple Wallet]     Buscado: ${stripVariants.join(", ")}`);
    }

    // Buscar versión @2x específica (opcional)
    const strip2xFile = path.join(assetsDir, `stamp-strip-${safeStamps}@2x.png`);
    if (fs.existsSync(strip2xFile)) {
      pass.addBuffer("strip@2x.png", fs.readFileSync(strip2xFile));
      console.log(`[Apple Wallet] ✓ Strip @2x de alta resolución agregado`);
    }

    // 3) THUMBNAIL opcional (90x90px @1x, 180x180px @2x)
    //    Aparece a la derecha del nombre en algunos tipos de pase
    const thumbPath = path.join(assetsDir, "thumbnail.png");
    if (fs.existsSync(thumbPath)) {
      const buf = fs.readFileSync(thumbPath);
      pass.addBuffer("thumbnail.png", buf);
      pass.addBuffer("thumbnail@2x.png", buf);
      console.log("[Apple Wallet] ✓ Thumbnail agregado");
    }

    // 4) BACKGROUND opcional (180x220px @1x, 360x440px @2x)
    //    Solo visible si no hay strip
    const bgPath = path.join(assetsDir, "background.png");
    if (fs.existsSync(bgPath)) {
      pass.addBuffer("background.png", fs.readFileSync(bgPath));
      console.log("[Apple Wallet] ✓ Background agregado");
    }

    // Exportar a Buffer
    console.log("[Apple Wallet] Exportando a buffer…");
    const buffer = await exportPassToBuffer(pass);

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error("El .pkpass resultó vacío");
    }

    console.log(
      `[Apple Wallet] ✅ Pase generado exitosamente (${buffer.length} bytes)`
    );
    return buffer;
  } catch (error) {
    console.error("[Apple Wallet] ❌ Error crítico:", error);
    throw error;
  }
}