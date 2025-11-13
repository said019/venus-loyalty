// lib/google.js - CÓDIGO COMPLETO CORREGIDO
import jwt from "jsonwebtoken";
import "dotenv/config";
import fs from "fs";

/**
 * Carga credenciales del servicio
 */
export function loadServiceAccount() {
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
  // CORRECCIÓN: Usar Class ID explícito para evitar problemas de formato
  const classId = "3388000000023035846.venus_loyalty_program_v1";
  const baseUrl = normalizeBaseUrl(process.env.BASE_URL);

  if (!issuerId) {
    throw new Error("Falta GOOGLE_ISSUER_ID.");
  }
  if (!baseUrl) {
    throw new Error("Falta BASE_URL.");
  }

  // CORRECCIÓN: Object ID debe seguir formato exacto
  const objectId = `${issuerId}.${cardId.replace(/[^a-zA-Z0-9._+-]/g, '_')}`;

  console.log("[GOOGLE WALLET] Generando pase:", { 
    objectId, 
    classId, 
    issuerId,
    serviceAccount: creds.client_email 
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
          classId: classId, // CORRECCIÓN: Usar classId explícito
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
              header: "Programa de Lealtad",
              body: "Completa tus sellos y canjea tu recompensa",
            },
          ],
          
          linksModuleData: {
            uris: [
              {
                uri: `${baseUrl}/api/card/${cardId}`,
                description: "Ver estado de mi tarjeta",
                id: "status_link"
              }
            ]
          },
          
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
    // CORRECCIÓN: Usar Class ID explícito
    const classId = "3388000000023035846.venus_loyalty_program_v1";

    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${encodeURIComponent(classId)}`;

    console.log("[GOOGLE API] Verificando clase:", classId);

    const response = await fetch(url, { 
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      } 
    });
    
    const data = await response.json();
    
    console.log("[GOOGLE API] Respuesta clase:", { status: response.status, ok: response.ok });

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
    // CORRECCIÓN: Usar Class ID explícito
    const classId = "3388000000023035846.venus_loyalty_program_v1";
    
    const loyaltyClass = {
      id: classId,
      issuerName: process.env.GOOGLE_ISSUER_NAME || "Venus Cosmetologia",
      programName: "Venus Lealtad",
      programLogo: {
        sourceUri: {
          uri: "https://i.ibb.co/HDWf7Lgw/Logos-0.png",
        },
        contentDescription: {
          defaultValue: {
            language: "es",
            value: "Logo Venus Loyalty"
          }
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
      
      // CORRECCIÓN: Agregar configuración de múltiples holders
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
    
    console.log("[GOOGLE API] Respuesta creación:", { status: response.status, ok: response.ok });

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
 * Crea o actualiza un objeto de lealtad individual
 */
export async function updateLoyaltyObject(cardId, name, stamps, max) {
  try {
    const token = await getWalletAccessToken();
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    // CORRECCIÓN: Usar Class ID explícito
    const classId = "3388000000023035846.venus_loyalty_program_v1";
    
    const objectId = `${issuerId}.${cardId.replace(/[^a-zA-Z0-9._+-]/g, '_')}`;
    
    const loyaltyObject = {
      id: objectId,
      classId: classId, // CORRECCIÓN: Class ID explícito
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
          header: "Programa de Lealtad",
          body: "Completa tus sellos y canjea tu recompensa",
        },
      ],
      linksModuleData: {
        uris: [
          {
            uri: `${normalizeBaseUrl(process.env.BASE_URL)}/api/card/${cardId}`,
            description: "Ver estado de mi tarjeta",
            id: "status_link"
          }
        ]
      }
    };

    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}`;
    
    console.log("[GOOGLE API] Actualizando objeto:", { objectId, classId });

    const response = await fetch(url, {
      method: 'PUT',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(loyaltyObject)
    });
    
    const data = await response.json();
    
    console.log("[GOOGLE API] Respuesta objeto:", { status: response.status, ok: response.ok });

    return {
      status: response.status,
      success: response.ok,
      objectId: objectId,
      data: data
    };
    
  } catch (error) {
    console.error("[GOOGLE API] Error actualizando objeto:", error);
    return {
      status: 500,
      success: false,
      error: error.message
    };
  }
}

/**
 * Elimina un objeto de lealtad
 */
export async function deleteLoyaltyObject(cardId) {
  try {
    const token = await getWalletAccessToken();
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const objectId = `${issuerId}.${cardId.replace(/[^a-zA-Z0-9._+-]/g, '_')}`;

    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 
        Authorization: `Bearer ${token}`
      }
    });
    
    return {
      status: response.status,
      success: response.ok,
      objectId: objectId
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
 * Obtiene la lista de clases de lealtad
 */
export async function listLoyaltyClasses() {
  try {
    const token = await getWalletAccessToken();
    const issuerId = process.env.GOOGLE_ISSUER_ID;

    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass?issuerId=${encodeURIComponent(issuerId)}`;
    
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
 * Diagnóstico completo de Google Wallet
 */
export async function googleWalletDiagnostics() {
  try {
    const diagnostics = {
      environment: {
        GOOGLE_ISSUER_ID: process.env.GOOGLE_ISSUER_ID,
        GOOGLE_CLASS_ID: process.env.GOOGLE_CLASS_ID,
        GOOGLE_SA_EMAIL: !!process.env.GOOGLE_SA_EMAIL,
        GOOGLE_SA_JSON: !!process.env.GOOGLE_SA_JSON,
        BASE_URL: process.env.BASE_URL
      },
      serviceAccount: null,
      loyaltyClass: null,
      loyaltyClasses: null
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

    // Verificar Loyalty Class específica
    try {
      const classCheck = await checkLoyaltyClass();
      diagnostics.loyaltyClass = classCheck;
    } catch (e) {
      diagnostics.loyaltyClass = {
        error: e.message
      };
    }

    // Listar todas las clases
    try {
      const classes = await listLoyaltyClasses();
      diagnostics.loyaltyClasses = classes;
    } catch (e) {
      diagnostics.loyaltyClasses = {
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

/**
 * Nuevo: Probar creación directa de objeto
 */
export async function testObjectCreation() {
  try {
    const token = await getWalletAccessToken();
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const classId = "3388000000023035846.venus_loyalty_program_v1";
    const objectId = `${issuerId}.test-${Date.now()}`;
    
    const loyaltyObject = {
      id: objectId,
      classId: classId,
      state: "active",
      accountId: "test-account",
      accountName: "Test Client",
      loyaltyPoints: {
        balance: {
          string: "2",
        },
        label: "Sellos (2/8)",
      }
    };

    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}`;
    
    console.log("[GOOGLE TEST] Creando objeto de prueba:", objectId);

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