// lib/google.js
import jwt from "jsonwebtoken";
import "dotenv/config";
import fs from "fs";

/**
 * Carga credenciales del servicio
 */
function loadServiceAccount() {
  const filePath = process.env.GOOGLE_SA_JSON;
  if (filePath && fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw);
    if (!json.client_email || !json.private_key) {
      throw new Error("El archivo del Service Account no contiene client_email/private_key.");
    }
    return json;
  }

  const client_email = process.env.GOOGLE_SA_EMAIL;
  const private_key = (process.env.GOOGLE_SA_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (client_email && private_key) {
    return { client_email, private_key };
  }

  throw new Error("Credenciales de Service Account no encontradas.");
}

function normalizeBaseUrl(u) {
  if (!u) return "";
  return u.endsWith("/") ? u.slice(0, -1) : u;
}

/**
 * Genera el enlace "Guardar en Google Wallet"
 */
export function buildGoogleSaveUrl({ cardId, name, stamps, max }) {
  const creds = loadServiceAccount();

  const issuerId = process.env.GOOGLE_ISSUER_ID;
  const classId  = process.env.GOOGLE_CLASS_ID;
  const baseUrl  = normalizeBaseUrl(process.env.BASE_URL);

  if (!issuerId || !classId) {
    throw new Error("Faltan GOOGLE_ISSUER_ID o GOOGLE_CLASS_ID.");
  }
  if (!baseUrl) {
    throw new Error("Falta BASE_URL.");
  }

  // CORRECCIÓN: Object ID debe ser único y válido
  const objectId = `${issuerId}.${cardId.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  console.log("[GOOGLE WALLET] Generando pase para:", { objectId, classId, baseUrl });

  const payload = {
    iss: creds.client_email,
    aud: "google",
    typ: "savetowallet",
    origins: [baseUrl],
    payload: {
      loyaltyObjects: [
        {
          id: objectId,
          classId,
          state: "active",
          accountId: cardId,
          accountName: String(name || "Cliente"),
          
          // CORRECCIÓN: Estructura correcta de loyaltyPoints
          loyaltyPoints: {
            balance: {
              string: `${stamps}`,
            },
            label: `Sellos (${stamps}/${max})`,
          },
          
          // Información adicional
          textModulesData: [
            {
              id: "program_info",
              header: "Programa de Lealtad",
              body: "Completa tus sellos y canjea tu recompensa",
            },
          ],
          
          // Links para actualizar/ver info
          linksModuleData: {
            uris: [
              {
                uri: `${baseUrl}/api/card/${cardId}`,
                description: "Ver estado de mi tarjeta",
                id: "status_link"
              }
            ]
          },
          
          // Mensaje secundario
          secondaryLoyaltyPoints: {
            balance: {
              string: `${max - stamps}`,
            },
            label: "Faltan para canjear",
          }
        },
      ],
    },
  };

  const token = jwt.sign(payload, creds.private_key, { algorithm: "RS256" });
  return `https://pay.google.com/gp/v/save/${token}`;
}

/**
 * Obtiene access token para API de Wallet
 */
export async function getWalletAccessToken() {
  const creds = loadServiceAccount();

  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const assertion = jwt.sign(claimSet, creds.private_key, { algorithm: "RS256" });

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error("Error al obtener token OAuth2: " + JSON.stringify(json));
  }
  return json.access_token;
}

/**
 * Verifica el estado de la clase de lealtad
 */
export async function checkLoyaltyClass() {
  try {
    const token = await getWalletAccessToken();
    const classId = process.env.GOOGLE_CLASS_ID;
    if (!classId) throw new Error("Falta GOOGLE_CLASS_ID.");

    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${encodeURIComponent(classId)}`;

    const response = await fetch(url, { 
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      } 
    });
    
    const data = await response.json();
    
    return { 
      status: response.status, 
      success: response.ok,
      classId: classId,
      data: data
    };
    
  } catch (error) {
    return {
      status: 500,
      success: false,
      error: error.message
    };
  }
}

/**
 * Crea o actualiza un objeto de lealtad individual
 */
export async function updateLoyaltyObject(cardId, name, stamps, max) {
  try {
    const token = await getWalletAccessToken();
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const classId = process.env.GOOGLE_CLASS_ID;
    
    const objectId = `${issuerId}.${cardId.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    
    const loyaltyObject = {
      id: objectId,
      classId: classId,
      state: "active",
      accountId: cardId,
      accountName: String(name || "Cliente"),
      loyaltyPoints: {
        balance: {
          string: `${stamps}`,
        },
        label: `Sellos (${stamps}/${max})`,
      }
    };

    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}`;
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(loyaltyObject)
    });
    
    const data = await response.json();
    
    return {
      status: response.status,
      success: response.ok,
      objectId: objectId,
      data: data
    };
    
  } catch (error) {
    return {
      status: 500,
      success: false,
      error: error.message
    };
  }
}