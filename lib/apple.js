// lib/apple.js
import fs from "fs";
import os from "os";
import path from "node:path";
import * as PassLib from "passkit-generator";

/* =============== Resolver clase PKPass de forma segura =============== */
function getPassClass() {
  if (PassLib && typeof PassLib.PKPass === "function") return PassLib.PKPass;
  if (PassLib && typeof PassLib.Pass === "function") return PassLib.Pass;
  if (PassLib && PassLib.default && typeof PassLib.default.PKPass === "function")
    return PassLib.default.PKPass;
  if (PassLib && typeof PassLib.default === "function") return PassLib.default;
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
  relevantDate = null,
  latestMessage = null,
  backgroundColor = 'rgb(154, 159, 130)',
  cardType = 'loyalty',
}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "apple-pass-"));
  const dir = base.endsWith(".pass") ? base : `${base}.pass`;
  fs.mkdirSync(dir, { recursive: true });

  // ===== Textos según tipo de tarjeta =====
  const isMassage = cardType === 'massage';

  const programLabel = isMassage ? "MEMBRESÍA" : "PROGRAMA";
  const programValue = isMassage ? "Masajes Venus" : "Lealtad Venus";

  const stampsLabel = isMassage ? "SESIONES" : "SELLOS";
  const stampsValue = isMassage ? `${stamps} de ${max} sesiones` : `${stamps} de ${max}`;

  const passDescription = isMassage ? "Membresía de Masajes Venus" : "Tarjeta de Lealtad Venus";
  const passLogoText   = isMassage ? "Venus Masajes" : "Venus Cosmetología";
  const passTypeLabel  = isMassage ? "Masajes" : "Lealtad";

  const termsValue = isMassage
    ? "Cada sesión de masaje consume un sello.\n\n🎁 Sello 5: ¡Tienes un regalo especial!\n🎁 Sello 10: ¡Segundo regalo al completar!\n\nAl completar las 10 sesiones se renueva tu membresía.\n\nVálido en Venus Cosmetología."
    : "Completa tus sellos y canjea un facial gratis.\n\nVálido en Venus Cosmetología.";

  const locationText = isMassage
    ? "¡Estás cerca de Venus! Muestra tu membresía de masajes"
    : "¡Estás cerca de Venus! Muestra tu tarjeta de lealtad";

  // 1. Campos Auxiliares
  const auxiliaryFields = [
    {
      key: "program",
      label: programLabel,
      value: programValue,
    },
  ];

  // Para masajes: agregar info de regalos
  if (isMassage) {
    let giftText = '';
    if (stamps >= 10) {
      giftText = '🎁🎁 ¡2 regalos canjeados!';
    } else if (stamps >= 5) {
      giftText = '🎁 ¡1er regalo listo! — Próximo en sello 10';
    } else {
      giftText = `🎁 Próximo regalo en sello 5 (faltan ${5 - stamps})`;
    }
    auxiliaryFields.push({
      key: "gifts",
      label: "REGALOS",
      value: giftText,
    });
  }

  // 2. Campos Traseros
  const backFields = [
    {
      key: "terms",
      label: "Términos y Condiciones",
      value: termsValue,
    },
  ];

  // ⭐ SI HAY MENSAJE, LO AGREGAMOS AL REVERSO PARA DISPARAR LA NOTIFICACIÓN
  if (latestMessage) {
    backFields.push({
      key: "lastNotification",
      label: "Último Aviso",
      value: latestMessage,
      changeMessage: "%@" // <--- ESTO ACTIVA LA NOTIFICACIÓN EN PANTALLA BLOQUEADA
    });
  }

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    serialNumber: isMassage ? `${cardId}-massage` : cardId,
    webServiceURL: process.env.BASE_URL,
    authenticationToken: process.env.APPLE_AUTH_TOKEN,
    organizationName: orgName,
    description: passDescription,
    logoText: passLogoText,

    storeCard: {
      primaryFields: [],

      secondaryFields: [
        {
          key: "name",
          label: "CLIENTE",
          value: name || "Cliente",
        },
        {
          key: "balance",
          label: stampsLabel,
          value: stampsValue,
        },
      ],

      auxiliaryFields: auxiliaryFields,

      backFields: backFields,
    },

    backgroundColor: backgroundColor,
    foregroundColor: "rgb(255, 255, 255)",
    labelColor: "rgb(255, 255, 255)",

    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: cardId,
        messageEncoding: "iso-8859-1",
      },
    ],

    relevantDate: relevantDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    expirationDate: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString(),

    locations: [
      {
        latitude: parseFloat(process.env.BUSINESS_LATITUDE || "20.3880"),
        longitude: parseFloat(process.env.BUSINESS_LONGITUDE || "-99.9960"),
        relevantText: locationText,
      }
    ],

    maxDistance: 100,
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

  if (typeof pass.getAsStream === "function")
    return await collect(pass.getAsStream());
  if (typeof pass.asStream === "function")
    return await collect(pass.asStream());
  if (typeof pass.toStream === "function")
    return await collect(pass.toStream());
  if (typeof pass.stream === "function")
    return await collect(pass.stream());

  const keys = Object.getOwnPropertyNames(Object.getPrototypeOf(pass)).filter(
    (k) => typeof pass[k] === "function"
  );
  throw new Error(
    `No encontré API de salida compatible. Métodos: ${JSON.stringify(keys)}`
  );
}

/* =============== Build .pkpass =============== */
export async function buildApplePassBuffer({
  cardId,
  name,
  stamps,
  max,
  relevantDate = null,
  latestMessage = null,
  cardType = 'loyalty',
  cardColor = null,
}) {
  try {
    const TEAM_ID = process.env.APPLE_TEAM_ID;
    const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID;
    const ORG_NAME = process.env.APPLE_ORG_NAME || "Venus Cosmetología";

    if (!TEAM_ID || !PASS_TYPE_ID) {
      throw new Error(
        "[Apple Wallet] Faltan APPLE_TEAM_ID o APPLE_PASS_TYPE_ID"
      );
    }

    // Background color by card type
    const bgColorMap = {
      loyalty:  'rgb(154, 159, 130)', // Verde Venus
      annual:   'rgb(196, 167, 125)', // Dorado Venus
      gold:     'rgb(30, 30, 30)',    // Negro VIP
      massage:  'rgb(196, 147, 110)', // Terracota cálido (membresía masajes)
    };
    const backgroundColor = cardColor
      ? cardColor.startsWith('rgb') ? cardColor : `rgb(${parseInt(cardColor.slice(1, 3), 16)}, ${parseInt(cardColor.slice(3, 5), 16)}, ${parseInt(cardColor.slice(5, 7), 16)})`
      : (bgColorMap[cardType] || bgColorMap.loyalty);

    console.log(`[Apple Wallet] Generando pase para: ${cardId}`, {
      name,
      stamps,
      max,
      cardType,
      hasMessage: !!latestMessage
    });

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

    // Construimos el modelo inyectando el mensaje si existe
    const model = buildTempModelDir({
      orgName: ORG_NAME,
      passTypeId: PASS_TYPE_ID,
      teamId: TEAM_ID,
      cardId,
      name,
      stamps,
      max,
      relevantDate,
      latestMessage,
      backgroundColor,
      cardType,
    });

    console.log(`[Apple Wallet] Modelo creado en: ${model}`);

    const PassClass = getPassClass();

    let pass;
    const certs = {
      wwdr: wwdrPem,
      signerCert: signerCertPem,
      signerKey: signerKeyPem,
      signerKeyPassphrase,
    };

    const serialNumber = cardType === 'massage' ? `${cardId}-massage` : cardId;

    if (typeof PassClass.from === "function") {
      pass = await PassClass.from(
        { model, certificates: certs },
        { serialNumber }
      );
    } else {
      pass = new PassClass({ model, certificates: certs });
      if (typeof pass.setSerialNumber === "function") {
        pass.setSerialNumber(serialNumber);
      } else {
        pass.serialNumber = serialNumber;
      }
    }

    console.log("[Apple Wallet] PKPass instancia creada");

    const assetsDir = path.join(process.cwd(), "public", "assets");

    // Logo e Icono
    const logoPath = path.join(assetsDir, "logo.png");
    if (fs.existsSync(logoPath)) {
      const buf = fs.readFileSync(logoPath);
      pass.addBuffer("logo.png", buf);
      pass.addBuffer("logo@2x.png", buf);
      pass.addBuffer("icon.png", buf);
      pass.addBuffer("icon@2x.png", buf);
      console.log("[Apple Wallet] ✓ Logo/Icono agregados");
    }

    // STRIP con los sellos
    const safeMax = Number(max) || 8;
    const safeStamps = Math.max(0, Math.min(Number(stamps) || 0, safeMax));

    // Prefijo de strip según tipo de tarjeta (masajes tienen su propio set de imágenes)
    const stripPrefix = cardType === 'massage' ? 'massage-strip' : 'stamp-strip';

    const stripFile = path.join(assetsDir, `${stripPrefix}-${safeStamps}.png`);
    if (fs.existsSync(stripFile)) {
      const buf = fs.readFileSync(stripFile);
      pass.addBuffer("strip.png", buf);

      const strip2xFile = path.join(assetsDir, `${stripPrefix}-${safeStamps}@2x.png`);
      if (fs.existsSync(strip2xFile)) {
        const buf2x = fs.readFileSync(strip2xFile);
        pass.addBuffer("strip@2x.png", buf2x);
      }
      console.log(`[Apple Wallet] ✓ Strip agregado: ${stripPrefix}-${safeStamps}.png`);
    } else {
      console.warn(`[Apple Wallet] ⚠️  No se encontró ${stripPrefix}-${safeStamps}.png`);
    }

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
