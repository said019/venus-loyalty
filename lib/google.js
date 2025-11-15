import jwt from "jsonwebtoken";
import "dotenv/config";
import fs from "fs";

/**
 * Carga credenciales del servicio
 */
export function loadServiceAccount() {
  // ... (mantener igual tu código existente)
  const client_email = process.env.GOOGLE_SA_EMAIL;
  const private_key = (process.env.GOOGLE_SA_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  
  if (client_email && private_key) {
    console.log("[GOOGLE] Usando credenciales de variables de entorno");
    return { client_email, private_key };
  }

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
 * Obtiene access token para API de Wallet
 */
export async function getWalletAccessToken() {
  // ... (mantener igual tu código existente)
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
 * Crea la clase de lealtad en Google Wallet - VERSIÓN MEJORADA CON DISEÑO APPLE
 */
export async function createLoyaltyClass() {
  try {
    const token = await getWalletAccessToken();
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const classId = "3388000000023035846.venus_loyalty_v2"; // Cambiar versión para forzar update
    
    console.log("[GOOGLE API] Creando clase con diseño Apple:", classId);

    const loyaltyClass = {
      id: classId,
      issuerName: "Venus Cosmetologia",
      programName: "Lealtad Venus",
      
      // DISEÑO COMO APPLE WALLET
      programLogo: {
        sourceUri: {
          uri: "https://i.ibb.co/HDWf7Lgw/Logos-0.png", // Tu logo actual
        }
      },
      
      // FONDO ELEGANTE COMO APPLE
      heroImage: {
        sourceUri: {
          uri: "https://i.ibb.co/your-hero-image/hero-venus.jpg", // Cambiar por tu imagen de fondo
        }
      },
      
      // COLORES IDÉNTICOS A APPLE WALLET
      hexBackgroundColor: "#cdd8a6", // Verde claro igual que Apple
      hexFontColor: "#5d4037", // Texto marrón oscuro
      
      reviewStatus: "UNDER_REVIEW",
      
      // ESTRUCTURA DE CAMPOS COMO APPLE
      title: {
        defaultValue: {
          language: "es",
          value: "Venus Lealtad"
        }
      },
      
      // MENSAJE MÁS ELEGANTE
      welcomeMessage: {
        defaultValue: {
          language: "es", 
          value: "Bienvenida a Venus Cosmetología. Disfruta de recompensas exclusivas."
        }
      },
      
      multipleDevicesAndHoldersAllowedStatus: "MULTIPLE_HOLDERS"
    };

    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass`;
    
    console.log("[GOOGLE API] Creando clase con diseño mejorado");

    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(loyaltyClass)
    });
    
    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      data = { rawResponse: responseText };
    }
    
    console.log("[GOOGLE API] Status:", response.status);

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
 * Crea o actualiza un objeto de lealtad individual - VERSIÓN MEJORADA
 */
export async function updateLoyaltyObject(cardId, name, stamps, max) {
  try {
    const token = await getWalletAccessToken();
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const classId = "3388000000023035846.venus_loyalty_v2"; // Usar nueva versión
    
    const objectId = `${issuerId}.${cardId.replace(/[^a-zA-Z0-9._+-]/g, '_')}`;
    
    const safeStamps = Math.max(0, Math.min(Number(stamps) || 0, Number(max) || 8));
    const stampPercentage = Math.round((safeStamps / (max || 8)) * 100);

    const loyaltyObject = {
      id: objectId,
      classId: classId,
      state: "active",
      accountId: cardId,
      accountName: String(name || "Cliente"),
      
      // SISTEMA DE PUNTOS MEJORADO
      loyaltyPoints: {
        balance: {
          string: `${safeStamps}`,
        },
        label: `Sellos (${safeStamps}/${max})`,
      },

      // CAMPOS ORGANIZADOS COMO APPLE WALLET
      primaryFields: [
        {
          fieldSelector: {
            fieldPath: "object.primaryFields[0]"
          },
          defaultValue: {
            language: "es",
            value: name || "Cliente"
          }
        }
      ],
      
      secondaryFields: [
        {
          fieldSelector: {
            fieldPath: "object.secondaryFields[0]"
          },
          defaultValue: {
            language: "es", 
            value: `${safeStamps}/${max}`
          }
        },
        {
          fieldSelector: {
            fieldPath: "object.secondaryFields[1]"
          },
          defaultValue: {
            language: "es",
            value: "Lealtad Venus"
          }
        }
      ],

      // MÓDULOS DE TEXTO MEJORADOS
      textModulesData: [
        {
          id: "progress_text",
          header: "PROGRESO",
          body: `${stampPercentage}% completado`,
        },
        {
          id: "reward_info",
          header: "RECOMPENSA",
          body: safeStamps >= max ? "🎉 ¡Recompensa disponible!" : "Completa 8 sellos para tu facial gratis",
        }
      ],

      // IMAGEN DE PROGRESO DINÁMICA (como el strip de Apple)
      imageModulesData: [
        {
          mainImage: {
            sourceUri: {
              uri: `https://tudominio.com/assets/stamp-strip-${safeStamps}.png`, // Usar mismo sistema que Apple
            }
          },
          id: "stamps_progress"
        }
      ],

      // BANDA DE CÓDIGO QR
      barcode: {
        kind: "walletobjects#barcode",
        type: "QR_CODE", 
        value: cardId,
        alternateText: cardId
      },

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
    
    console.log("[GOOGLE API] Actualizando objeto con diseño Apple:", { objectId });

    const response = await fetch(url, {
      method: 'PUT',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(loyaltyObject)
    });
    
    const data = await response.json();
    
    console.log("[GOOGLE API] Respuesta objeto:", { status: response.status });

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
 * Genera el enlace "Guardar en Google Wallet" - VERSIÓN MEJORADA
 */
export function buildGoogleSaveUrl({ cardId, name, stamps, max }) {
  const creds = loadServiceAccount();

  const issuerId = process.env.GOOGLE_ISSUER_ID;
  const classId = "3388000000023035846.venus_loyalty_v2"; // Nueva versión
  const baseUrl = normalizeBaseUrl(process.env.BASE_URL);

  if (!issuerId) {
    throw new Error("Falta GOOGLE_ISSUER_ID.");
  }
  if (!baseUrl) {
    throw new Error("Falta BASE_URL.");
  }

  const objectId = `${issuerId}.${cardId.replace(/[^a-zA-Z0-9._+-]/g, '_')}`;

  const safeStamps = Math.max(0, Math.min(Number(stamps) || 0, Number(max) || 8));

  console.log("[GOOGLE WALLET] Generando pase con diseño Apple:", { objectId });

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
          
          // ESTRUCTURA MEJORADA
          primaryFields: [
            {
              fieldSelector: {
                fieldPath: "object.primaryFields[0]"
              },
              defaultValue: {
                language: "es",
                value: name || "Cliente"
              }
            }
          ],
          
          secondaryFields: [
            {
              fieldSelector: {
                fieldPath: "object.secondaryFields[0]"
              },
              defaultValue: {
                language: "es", 
                value: `${safeStamps}/${max}`
              }
            },
            {
              fieldSelector: {
                fieldPath: "object.secondaryFields[1]"
              },
              defaultValue: {
                language: "es",
                value: "Lealtad Venus"
              }
            }
          ],
          
          loyaltyPoints: {
            balance: {
              string: `${safeStamps}`,
            },
            label: `Sellos (${safeStamps}/${max})`,
          },
          
          textModulesData: [
            {
              id: "program_header",
              header: "PROGRAMA",
              body: "Lealtad Venus",
            },
            {
              id: "progress_info",
              header: "PROGRESO",
              body: `${Math.round((safeStamps / (max || 8)) * 100)}% completado`,
            }
          ],
          
          // IMAGEN DE PROGRESO
          imageModulesData: [
            {
              mainImage: {
                sourceUri: {
                  uri: `https://tudominio.com/assets/stamp-strip-${safeStamps}.png`,
                }
              },
              id: "stamps_progress"
            }
          ],
          
          // CÓDIGO QR
          barcode: {
            kind: "walletobjects#barcode",
            type: "QR_CODE",
            value: cardId,
            alternateText: cardId
          },
          
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
    console.log("[GOOGLE WALLET] JWT generado con diseño Apple");
    return `https://pay.google.com/gp/v/save/${token}`;
  } catch (error) {
    console.error("[GOOGLE WALLET] Error generando JWT:", error);
    throw new Error("Error generando token de Google Wallet: " + error.message);
  }
}

// ... (mantener las otras funciones igual: checkLoyaltyClass, googleWalletDiagnostics, testObjectCreation)

/**
 * Verifica el estado de la clase de lealtad
 */
export async function checkLoyaltyClass() {
  try {
    const token = await getWalletAccessToken();
    const classId = "3388000000023035846.venus_loyalty_v2"; // Nueva versión

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

// ... (mantener googleWalletDiagnostics y testObjectCreation sin cambios)