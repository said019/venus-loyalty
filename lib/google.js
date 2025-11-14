// lib/google.js
import jwt from "jsonwebtoken";
import "dotenv/config";
import fs from "fs";

/**
 * Lee credenciales del Service Account desde:
 *  - GOOGLE_SA_JSON (ruta a JSON en disco)  o
 *  - GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY (variables de entorno)
 */
function loadServiceAccount() {
  const jsonPath = process.env.GOOGLE_SA_JSON; // p.ej. /etc/secrets/google-sa.json en Render

  // Opción 1: archivo JSON en disco
  if (jsonPath && fs.existsSync(jsonPath)) {
    const raw = fs.readFileSync(jsonPath, "utf8");
    const json = JSON.parse(raw);
    if (!json.client_email || !json.private_key) {
      throw new Error(
        "[Google Wallet] El JSON del Service Account no tiene client_email/private_key"
      );
    }
    return {
      client_email: json.client_email,
      private_key: json.private_key,
    };
  }

  // Opción 2: variables de entorno sueltas
  const client_email = process.env.GOOGLE_SA_EMAIL;
  const private_key = (process.env.GOOGLE_SA_PRIVATE_KEY || "").replace(
    /\\n/g,
    "\n"
  );

  if (client_email && private_key) {
    return { client_email, private_key };
  }

  throw new Error(
    "[Google Wallet] Credenciales de servicio no encontradas. Configura GOOGLE_SA_JSON o GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY."
  );
}

/**
 * Valida que existan los IDs de Wallet.
 */
function getWalletIds() {
  const issuerId = process.env.GOOGLE_ISSUER_ID; // p.ej. 3388000000023035846
  const classId = process.env.GOOGLE_CLASS_ID;   // p.ej. 3388...venus_loyalty_v1

  if (!issuerId || !classId) {
    throw new Error(
      "[Google Wallet] Faltan GOOGLE_ISSUER_ID o GOOGLE_CLASS_ID en variables de entorno."
    );
  }
  return { issuerId, classId };
}

/**
 * Construye la URL "Guardar en Google Wallet" (SaveToWallet)
 * para un objeto de lealtad basado en una clase YA CREADA.
 *
 * Esto es lo que hace que te salga el botón bonito con tus colores.
 */
export function buildGoogleSaveUrl({ cardId, name, stamps, max }) {
  const creds = loadServiceAccount();
  const { issuerId, classId } = getWalletIds();

  // Normalizar ID de objeto: issuerId.cardId_sanitizado
  const safeCardId = String(cardId || "").replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );
  const objectId = `${issuerId}.${safeCardId}`;

  const safeName = name || "Cliente";
  const safeMax = Number.isFinite(max) && max > 0 ? max : 8;
  const safeStamps = Number.isFinite(stamps) && stamps >= 0 ? stamps : 0;

  const baseUrl = process.env.BASE_URL || "http://localhost:3000";

  const payload = {
    iss: creds.client_email,
    aud: "google",
    origins: [
      baseUrl,
      "http://localhost:3000", // útil para pruebas locales
    ],
    typ: "savetowallet",
    payload: {
      // ⚠️ IMPORTANTE: aquí solo objetos, la clase ya debe existir en Wallet Console
      loyaltyObjects: [
        {
          id: objectId,
          classId, // p.ej. "3388000000023035846.venus_loyalty_v1"
          state: "active",
          accountId: safeCardId,
          accountName: safeName,
          loyaltyPoints: {
            balance: { string: `${safeStamps}/${safeMax}` },
            label: "Sellos",
          },
          textModulesData: [
            {
              header: "Programa de Lealtad Venus",
              body: "Completa tus sellos y obtén un facial de cortesía 💆‍♀️",
            },
          ],
        },
      ],
    },
  };

  const token = jwt.sign(payload, creds.private_key, {
    algorithm: "RS256",
  });

  return `https://pay.google.com/gp/v/save/${token}`;
}

/**
 * checkLoyaltyClass
 * Se usa en /api/debug/google-class.
 * Aquí devolvemos info básica de configuración (no llama a Google para no romper).
 */
export async function checkLoyaltyClass() {
  const { issuerId, classId } = getWalletIds();
  return {
    ok: true,
    issuerId,
    classId,
    message:
      "Configuración básica OK. La existencia real de la clase se valida en la consola de Google Wallet.",
  };
}

/**
 * createLoyaltyClass
 * Placeholder por si tu server.js lo importa. No hace nada contra la API real.
 */
export async function createLoyaltyClass() {
  return {
    ok: false,
    message:
      "createLoyaltyClass no está implementado en este backend. Crea la clase desde Google Wallet Console.",
  };
}

/**
 * updateLoyaltyObject
 * Placeholder para evitar errores de import.
 */
export async function updateLoyaltyObject() {
  return {
    ok: false,
    message:
      "updateLoyaltyObject no está implementado en este backend. Los sellos se reflejan creando un nuevo objeto o generando un nuevo enlace.",
  };
}