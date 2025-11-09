// lib/google.js
import jwt from "jsonwebtoken";
import "dotenv/config";
import fs from "fs";

/**
 * Carga credenciales del servicio desde:
 * - GOOGLE_SA_JSON (ruta a archivo JSON; p.ej. /etc/secrets/google-sa.json en Render), o
 * - GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY (variables de entorno).
 */
function loadServiceAccount() {
  const path = process.env.GOOGLE_SA_JSON; // p.ej. /etc/secrets/google-sa.json en Render
  if (path && fs.existsSync(path)) {
    const raw = fs.readFileSync(path, "utf8");
    const json = JSON.parse(raw);
    if (!json.client_email || !json.private_key) {
      throw new Error("El archivo no contiene client_email/private_key");
    }
    return json;
  }

  const client_email = process.env.GOOGLE_SA_EMAIL;
  const private_key = (process.env.GOOGLE_SA_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (client_email && private_key) return { client_email, private_key };

  throw new Error("Credenciales de servicio no encontradas.");
}

/**
 * Genera el enlace "Guardar en Google Wallet" para un objeto de lealtad.
 * IMPORTANTE:
 *  - No se crea la clase aquí (asumimos que ya existe y está ACTIVA).
 *  - 'origins' debe coincidir EXACTO con el dominio desde el que abres el enlace.
 */
export function buildGoogleSaveUrl({ cardId, name, stamps, max }) {
  const creds = loadServiceAccount();

  const issuerId = process.env.GOOGLE_ISSUER_ID;     // ej: 3388000000023035846
  const classId  = process.env.GOOGLE_CLASS_ID;      // ej: 3388000000023035846.venus_loyalty_v1
  const objectId = `${issuerId}.${cardId}`;

  // (opcional) log de diagnóstico
  console.log("GOOGLE_ISSUER_ID =", issuerId);
  console.log("GOOGLE_CLASS_ID  =", classId);

  const payload = {
    iss: creds.client_email,
    aud: "google",
    origins: [
      process.env.BASE_URL,    // p.ej. https://venus-loyalty.onrender.com
      "http://localhost:3000"  // para pruebas locales
    ],
    typ: "savetowallet",
    payload: {
      // SOLO objetos. La clase ya debe existir en estado ACTIVE/UNDER_REVIEW
      loyaltyObjects: [
        {
          id: objectId,
          classId,
          state: "active",
          accountId: cardId,
          accountName: name,
          loyaltyPoints: {
            balance: { string: `${stamps}/${max}` },
            label: "Sellos"
          },
          textModulesData: [
            {
              header: "Programa de Lealtad Venus",
              body: "Completa 8 sellos y obtén un facial de cortesía 💆‍♀️"
            }
          ]
        }
      ]
    }
  };

  const token = jwt.sign(payload, creds.private_key, { algorithm: "RS256" });
  // agrega ?debug=1 para ver detalles si algo falla al abrir el link
  return `https://pay.google.com/gp/v/save/${token}?debug=1`;
}

/* ====== utilidades opcionales de diagnóstico ====== */

/** Solicita un access token OAuth2 con el scope de Wallet Issuer. */
export async function getWalletAccessToken() {
  const creds = loadServiceAccount();

  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const assertion = jwt.sign(claimSet, creds.private_key, { algorithm: "RS256" });

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error("Token error: " + JSON.stringify(json));
  }
  return json.access_token;
}

/** Comprueba si la clase (GOOGLE_CLASS_ID) existe y su estado. */
export async function checkLoyaltyClass() {
  const token = await getWalletAccessToken();
  const classId = process.env.GOOGLE_CLASS_ID;
  const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${encodeURIComponent(classId)}`;

  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  return { status: r.status, body: j };
}