// lib/google.js
import jwt from "jsonwebtoken";
import "dotenv/config";
import fs from "fs";

/* =========================================================
   CONSTANTES
   ========================================================= */

const LOYALTY_CLASS_ID = "3388000000023035846.venus_loyalty_v1";

/* =========================================================
   HELPERS
   ========================================================= */

/**
 * Carga credenciales del Service Account
 * - Primero intenta con variables de entorno
 * - Si no, intenta con archivo JSON (GOOGLE_SA_JSON o ./secrets/google-sa.json)
 */
export function loadServiceAccount() {
  const client_email = process.env.GOOGLE_SA_EMAIL;
  const private_key = (process.env.GOOGLE_SA_PRIVATE_KEY || "").replace(
    /\\n/g,
    "\n"
  );

  if (client_email && private_key) {
    console.log("[GOOGLE] Usando credenciales desde variables de entorno");
    return { client_email, private_key };
  }

  const filePath = process.env.GOOGLE_SA_JSON || "./secrets/google-sa.json";
  if (fs.existsSync(filePath)) {
    console.log("[GOOGLE] Cargando credenciales desde archivo:", filePath);
    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw);
    if (!json.client_email || !json.private_key) {
      throw new Error(
        "El archivo del Service Account no contiene client_email/private_key."
      );
    }
    return json;
  }

  throw new Error("Credenciales de Service Account no encontradas.");
}

function normalizeBaseUrl(u) {
  if (!u) return "";
  return u.endsWith("/") ? u.slice(0, -1) : u;
}

/* =========================================================
   AUTH: TOKEN PARA WALLET API
   ========================================================= */

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

  const assertion = jwt.sign(claimSet, creds.private_key, {
    algorithm: "RS256",
  });

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

/* =========================================================
   CLASE DE LEALTAD
   ========================================================= */

/**
 * Crea la clase de lealtad en Google Wallet
 */
export async function createLoyaltyClass() {
  try {
    const token = await getWalletAccessToken();
    const issuerId = process.env.GOOGLE_ISSUER_ID;

    console.log("[GOOGLE API] Intentando crear clase:", LOYALTY_CLASS_ID);
    console.log("[GOOGLE API] Usando issuerId:", issuerId);

    const loyaltyClass = {
      id: LOYALTY_CLASS_ID,
      issuerName: "Venus Cosmetologia",
      programName: "Venus Lealtad",
      programLogo: {
        sourceUri: {
          uri: "https://i.ibb.co/HDWf7Lgw/Logos-0.png",
        },
      },
      reviewStatus: "UNDER_REVIEW",
      hexBackgroundColor: "#8c9668",
      title: {
        defaultValue: {
          language: "es",
          value: "Tarjeta de Lealtad Venus",
        },
      },
      welcomeMessage: {
        defaultValue: {
          language: "es",
          value:
            "¡Bienvenida a Venus Lealtad! Gana un sello por cada servicio facial o corporal. Completa 8 y disfruta un tratamiento gratuito.",
        },
      },
      multipleDevicesAndHoldersAllowedStatus: "MULTIPLE_HOLDERS",
    };

    const url =
      "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(loyaltyClass),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { rawResponse: text };
    }

    console.log("[GOOGLE API] Status createClass:", response.status);

    return {
      status: response.status,
      success: response.ok,
      classId: LOYALTY_CLASS_ID,
      data,
    };
  } catch (error) {
    console.error("[GOOGLE API] Error creando clase:", error);
    return {
      status: 500,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Verifica el estado de la clase de lealtad
 */
export async function checkLoyaltyClass() {
  try {
    const token = await getWalletAccessToken();
    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${encodeURIComponent(
      LOYALTY_CLASS_ID
    )}`;

    console.log("[GOOGLE API] Verificando clase:", LOYALTY_CLASS_ID);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    return {
      status: response.status,
      success: response.ok,
      classId: LOYALTY_CLASS_ID,
      data,
    };
  } catch (error) {
    console.error("[GOOGLE API] Error verificando clase:", error);
    return {
      status: 500,
      success: false,
      error: error.message,
    };
  }
}

/* =========================================================
   OBJETOS DE LEALTAD (TARJETAS)
   ========================================================= */

/**
 * Crea o actualiza un objeto de lealtad individual
 * Aquí añadimos el QR (barcode)
 */
export async function updateLoyaltyObject(cardId, name, stamps, max) {
  try {
    const token = await getWalletAccessToken();
    const issuerId = process.env.GOOGLE_ISSUER_ID;

    const safeCardId = cardId.replace(/[^a-zA-Z0-9._+-]/g, "_");
    const objectId = `${issuerId}.${safeCardId}`;

    const loyaltyObject = {
      id: objectId,
      classId: LOYALTY_CLASS_ID,
      state: "active",
      accountId: cardId,
      accountName: String(name || "Cliente"),

      // 👇 QR en la tarjeta
      barcode: {
        type: "qrCode",
        value: cardId,
        alternateText: cardId,
      },

      loyaltyPoints: {
        balance: {
          string: `${stamps}`,
        },
        label: `Sellos (${stamps}/${max})`,
      },

      textModulesData: [
        {
          id: "program_info",
          header: "Programa de Lealtad",
          body: "Completa tus sellos y canjea tu recompensa.",
        },
      ],

      linksModuleData: {
        uris: [
          {
            uri: `${normalizeBaseUrl(
              process.env.BASE_URL
            )}/api/card/${cardId}`,
            description: "Ver estado de mi tarjeta",
            id: "status_link",
          },
        ],
      },
    };

    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(
      objectId
    )}`;

    console.log("[GOOGLE API] Actualizando objeto:", { objectId });

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(loyaltyObject),
    });

    const data = await response.json();

    console.log("[GOOGLE API] Respuesta objeto:", {
      status: response.status,
      ok: response.ok,
    });

    return {
      status: response.status,
      success: response.ok,
      objectId,
      data,
    };
  } catch (error) {
    console.error("[GOOGLE API] Error actualizando objeto:", error);
    return {
      status: 500,
      success: false,
      error: error.message,
    };
  }
}

/* =========================================================
   LINK "GUARDAR EN GOOGLE WALLET"
   ========================================================= */

export function buildGoogleSaveUrl({ cardId, name, stamps, max }) {
  const creds = loadServiceAccount();

  const issuerId = process.env.GOOGLE_ISSUER_ID;
  const baseUrl = normalizeBaseUrl(process.env.BASE_URL);

  if (!issuerId) {
    throw new Error("Falta GOOGLE_ISSUER_ID.");
  }
  if (!baseUrl) {
    throw new Error("Falta BASE_URL.");
  }

  const safeCardId = cardId.replace(/[^a-zA-Z0-9._+-]/g, "_");
  const objectId = `${issuerId}.${safeCardId}`;

  console.log("[GOOGLE WALLET] Generando pase:", {
    objectId,
    classId: LOYALTY_CLASS_ID,
    issuerId,
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
          classId: LOYALTY_CLASS_ID,
          state: "active",
          accountId: cardId,
          accountName: String(name || "Cliente"),

          // 👇 QR también en el JWT
          barcode: {
            type: "qrCode",
            value: cardId,
            alternateText: cardId,
          },

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
              body: "Completa tus sellos y canjea tu recompensa.",
            },
          ],

          linksModuleData: {
            uris: [
              {
                uri: `${baseUrl}/card/${cardId}`,
                description: "Ver estado de mi tarjeta",
                id: "status_link",
              },
            ],
          },
        },
      ],
    },
  };

  try {
    const token = jwt.sign(payload, creds.private_key, {
      algorithm: "RS256",
    });
    console.log("[GOOGLE WALLET] JWT generado exitosamente");
    return `https://pay.google.com/gp/v/save/${token}`;
  } catch (error) {
    console.error("[GOOGLE WALLET] Error generando JWT:", error);
    throw new Error(
      "Error generando token de Google Wallet: " + error.message
    );
  }
}

/* =========================================================
   DIAGNÓSTICOS
   ========================================================= */

export async function googleWalletDiagnostics() {
  try {
    const diagnostics = {
      environment: {
        GOOGLE_ISSUER_ID: process.env.GOOGLE_ISSUER_ID,
        BASE_URL: process.env.BASE_URL,
        GOOGLE_SA_EMAIL: !!process.env.GOOGLE_SA_EMAIL,
      },
      serviceAccount: null,
      loyaltyClass: null,
    };

    try {
      const creds = loadServiceAccount();
      diagnostics.serviceAccount = {
        hasCredentials: true,
        clientEmail: creds.client_email,
        issuerId: process.env.GOOGLE_ISSUER_ID,
      };
    } catch (e) {
      diagnostics.serviceAccount = {
        hasCredentials: false,
        error: e.message,
      };
    }

    try {
      const classCheck = await checkLoyaltyClass();
      diagnostics.loyaltyClass = classCheck;
    } catch (e) {
      diagnostics.loyaltyClass = {
        error: e.message,
      };
    }

    return diagnostics;
  } catch (error) {
    return {
      status: 500,
      success: false,
      error: error.message,
    };
  }
}

/* =========================================================
   TEST: CREAR OBJETO DE PRUEBA
   ========================================================= */

export async function testObjectCreation() {
  try {
    const token = await getWalletAccessToken();
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const objectId = `${issuerId}.test-${Date.now()}`;

    const loyaltyObject = {
      id: objectId,
      classId: LOYALTY_CLASS_ID,
      state: "active",
      accountId: "test-account",
      accountName: "Test Client",
      loyaltyPoints: {
        balance: {
          string: "2",
        },
        label: "Sellos (2/8)",
      },
      barcode: {
        type: "qrCode",
        value: "test-account",
        alternateText: "test-account",
      },
    };

    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(
      objectId
    )}`;

    console.log("[GOOGLE TEST] Creando objeto de prueba:", objectId);

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(loyaltyObject),
    });

    const data = await response.json();

    return {
      status: response.status,
      success: response.ok,
      objectId,
      data,
    };
  } catch (error) {
    return {
      status: 500,
      success: false,
      error: error.message,
    };
  }
}