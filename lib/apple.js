// lib/apple.js
import fs from "fs";
import os from "os";
import path from "node:path";
import { PKPass } from "passkit-generator"; // ← API oficial v3

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

// PNG 1x1 placeholder (por si falta alguna imagen)
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
    logoText: "Venus Cosmetología",

    // Tipo storeCard
    storeCard: {
      headerFields: [
        // Arriba derecha: PROGRAMA / Lealtad Venus
        {
          key: "program",
          label: "PROGRAMA",
          value: "Lealtad Venus",
        },
      ],
      primaryFields: [
        // Texto grande: nombre del cliente
        {
          key: "name",
          label: "", // ← SIN etiqueta para no repetir “Cliente” en pequeño
          value: name || "Cliente",
        },
      ],
      secondaryFields: [
        // Izquierda: 0/8 Sellos
        {
          key: "stamps_counter",
          label: "Sellos",
          value: `${stamps}/${max}`,
        },
        // Centro: ID tarjeta (opcional)
        {
          key: "card_id",
          label: "ID TARJETA",
          value: cardId,
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

    // Colores de marca (puedes ajustar si quieres)
    // fondo tipo #cdd8a6
    backgroundColor: "rgb(205,216,166)",
    // textos en crema #fff6e3
    foregroundColor: "rgb(255,246,227)",
    labelColor: "rgb(255,246,227)",

    // Código de barras / QR
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

  // Iconos mínimos para que el pase sea válido
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
      throw new Error("[Apple Wallet] Faltan APPLE_TEAM_ID o APPLE_PASS_TYPE_ID");
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

    // 2) Modelo base con datos de esta tarjeta
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

    // 3) Crear instancia PKPass desde la carpeta-modelo
    const pass = await PKPass.from(
      {
        model,
        certificates: {
          wwdr: wwdrPem,
          signerCert: signerCertPem,
          signerKey: signerKeyPem,
          signerKeyPassphrase,
        },
      },
      {
        // overrides opcionales en pass.json
        serialNumber: cardId,
      }
    );

    console.log(`[Apple Wallet] PKPass instancia creada`);

    /* ---------- IMÁGENES PERSONALIZADAS ---------- */

    // Rutas base dentro del servidor (Render/localhost)
    const assetsDir = path.join(process.cwd(), "public", "assets");

    // 3.1 Icono y logo principales (logo de Venus)
    const logoPath = path.join(assetsDir, "logo.png"); // adapta al nombre real
    if (fs.existsSync(logoPath)) {
      const buf = fs.readFileSync(logoPath);
      pass.addBuffer(buf, "logo.png");
      pass.addBuffer(buf, "logo@2x.png");
      pass.addBuffer(buf, "icon.png");
      pass.addBuffer(buf, "icon@2x.png");
      console.log("[Apple Wallet] Logo/Icono personalizados agregados");
    } else {
      console.warn("[Apple Wallet] No se encontró logo.png en /public/assets");
    }

    // 3.2 Fondo principal (verde fuerte de la marca)
    const heroPath = path.join(assetsDir, "hero.png"); // imagen grande opcional
    if (fs.existsSync(heroPath)) {
      const buf = fs.readFileSync(heroPath);
      // Apple usa background.png para cubrir toda la tarjeta
      pass.addBuffer(buf, "background.png");
      pass.addBuffer(buf, "background@2x.png");
      console.log("[Apple Wallet] Fondo personalizado agregado");
    } else {
      console.log("[Apple Wallet] Sin hero.png, se usa sólo color de fondo");
    }

    // 3.3 Strip dinámico con sellos (arriba detrás del nombre)
    // Debes tener archivos:
    //   public/assets/stamp-strip-0.png
    //   public/assets/stamp-strip-1.png
    //   ...
    //   public/assets/stamp-strip-8.png
    const safeStamps = Math.max(0, Math.min(Number(stamps) || 0, max));
    const stripIndex = safeStamps; // 0–8
    const stripFile = path.join(
      assetsDir,
      `stamp-strip-${stripIndex}.png`
    );

    if (fs.existsSync(stripFile)) {
      const buf = fs.readFileSync(stripFile);
      // strip.png es la franja superior
      pass.addBuffer(buf, "strip.png");
      pass.addBuffer(buf, "strip@2x.png");
      console.log(
        `[Apple Wallet] Strip dinámico agregado: stamp-strip-${stripIndex}.png`
      );
    } else {
      console.warn(
        `[Apple Wallet] No se encontró ${stripFile}, se omite strip dinámico`
      );
    }

    // 4) Exportar a Buffer
    console.log("[Apple Wallet] Exportando a buffer...");
    const buffer = pass.getAsBuffer();

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error("El .pkpass resultó vacío");
    }

    console.log(
      `[Apple Wallet] Pase generado exitosamente, tamaño: ${buffer.length} bytes`
    );
    return buffer;
  } catch (error) {
    console.error("[Apple Wallet] Error crítico en buildApplePassBuffer:", error);
    throw error;
  }
}