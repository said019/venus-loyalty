// lib/google.js - VERSIÓN COMPLETA ACTUALIZADA
import jwt from "jsonwebtoken";
import "dotenv/config";
import fs from "fs";

/**
 * Carga credenciales del servicio
 */
export function loadServiceAccount() {
  // Primero intentar con variables de entorno
  const client_email = process.env.GOOGLE_SA_EMAIL;
  const private_key = (process.env.GOOGLE_SA_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  
  if (client_email && private_key) {
    console.log("[GOOGLE] Usando credenciales de variables de entorno");
    return { client_email, private_key };
  }

  // Si no, buscar archivo en secrets/
  const filePath = process.env.GOOGLE_SA_JSON || './secrets/google-sa.json';
  if (fs.existsSync(filePath)) {
    console.log("[GOOGLE] Cargando credenciales desde:", filePath);
    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw);
    if (!json.client_email || !json.private_key) {
      throw new Error("El archivo del Service Account no contiene client_email/private_key.");
    }
    return json;
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
  // ✅ CLASS ID CORREGIDO
  const classId = "3388000000023035846.venus_loyalty_v1";
  const baseUrl = normalizeBaseUrl(process.env.BASE_URL);

  if (!issuerId) {
    throw new Error("Falta GOOGLE_ISSUER_ID.");
  }
  if (!baseUrl) {
    throw new Error("Falta BASE_URL.");
  }

  const objectId = `${issuerId}.${cardId.replace(/[^a-zA-Z0-9._+-]/g, '_')}`;

  console.log("[GOOGLE WALLET] Generando pase:", { 
    objectId, 
    classId,
    issuerId
  });

  const payload = {
    iss: creds.client_email,
    aud: "google",
    typ: "savetowallet",
    origins: [baseUrl],
    payload: {
      loyaltyObjects: [
        {
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
          },
          
          textModulesData: [
            {
              id: "program_info",
              header: "Programa de Lealtad Venus",
              body: "Completa tus sellos y canjea tu recompensa",
            },
          ],
          
          linksModuleData: {
            uris: [
              {
                uri: `${baseUrl}/card/${cardId}`,
                description: "Ver estado de mi tarjeta",
                id: "status_link"
              }
            ]
          }
        },
      ],
    },
  };

  try {
    const token = jwt.sign(payload, creds.private_key, { algorithm: "RS256" });
    console.log("[GOOGLE WALLET] JWT generado exitosamente");
    return `https://pay.google.com/gp/v/save/${token}`;
  } catch (error) {
    console.error("[GOOGLE WALLET] Error generando JWT:", error);
    throw new Error("Error generando token de Google Wallet: " + error.message);
  }
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

  console.log("[GOOGLE AUTH] Obteniendo token para:", creds.client_email);

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
    console.error("[GOOGLE AUTH] Error obteniendo token:", json);
    throw new Error("Error al obtener token OAuth2: " + JSON.stringify(json));
  }

  console.log("[GOOGLE AUTH] Token obtenido exitosamente");
  return json.access_token;
}

/**
 * Verifica el estado de la clase de lealtad
 */
export async function checkLoyaltyClass() {
  try {
    const token = await getWalletAccessToken();
    const classId = "3388000000023035846.venus_loyalty_v1";

    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${encodeURIComponent(classId)}`;

    console.log("[GOOGLE API] Verificando clase:", classId);

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
    console.error("[GOOGLE API] Error verificando clase:", error);
    return {
      status: 500,
      success: false,
      error: error.message
    };
  }
}

/**
 * Crea la clase de lealtad en Google Wallet
 */
export async function createLoyaltyClass() {
  try {
    const token = await getWalletAccessToken();
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const classId = "3388000000023035846.venus_loyalty_v1";
    
    const loyaltyClass = {
      id: classId,
      issuerName: process.env.GOOGLE_ISSUER_NAME || "Venus Cosmetologia",
      programName: "Venus Lealtad",
      programLogo: {
        sourceUri: {
          uri: "https://i.ibb.co/HDWf7Lgw/Logos-0.png",
        }
      },
      reviewStatus: "UNDER_REVIEW",
      hexBackgroundColor: "#8c9668",
      
      title: {
        defaultValue: {
          language: "es",
          value: "Tarjeta de Lealtad Venus"
        }
      },
      
      welcomeMessage: {
        defaultValue: {
          language: "es", 
          value: "¡Bienvenida a Venus Lealtad! Gana un sello por cada servicio facial o corporal. Completa 8 y disfruta un tratamiento gratuito."
        }
      },
      
      multipleDevicesAndHoldersAllowedStatus: "MULTIPLE_HOLDERS"
    };

    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${encodeURIComponent(classId)}`;
    
    console.log("[GOOGLE API] Creando clase:", classId);

    const response = await fetch(url, {
      method: 'PUT',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(loyaltyClass)
    });
    
    const data = await response.json();
    
    return {
      status: response.status,
      success: response.ok,
      classId: classId,
      data: data
    };
    
  } catch (error) {
    console.error("[GOOGLE API] Error creando clase:", error);
    return {
      status: 500,
      success: false,
      error: error.message
    };
  }
}

/**
 * Diagnóstico completo de Google Wallet
 */
export async function googleWalletDiagnostics() {
  try {
    const diagnostics = {
      environment: {
        GOOGLE_ISSUER_ID: process.env.GOOGLE_ISSUER_ID,
        BASE_URL: process.env.BASE_URL,
        GOOGLE_SA_EMAIL: !!process.env.GOOGLE_SA_EMAIL
      },
      serviceAccount: null,
      loyaltyClass: null
    };

    // Verificar Service Account
    try {
      const creds = loadServiceAccount();
      diagnostics.serviceAccount = {
        hasCredentials: true,
        clientEmail: creds.client_email,
        issuerId: process.env.GOOGLE_ISSUER_ID
      };
    } catch (e) {
      diagnostics.serviceAccount = {
        hasCredentials: false,
        error: e.message
      };
    }

    // Verificar Loyalty Class
    try {
      const classCheck = await checkLoyaltyClass();
      diagnostics.loyaltyClass = classCheck;
    } catch (e) {
      diagnostics.loyaltyClass = {
        error: e.message
      };
    }

    return diagnostics;
  } catch (error) {
    return {
      status: 500,
      success: false,
      error: error.message
    };
  }
}