// lib/google.js
import jwt from "jsonwebtoken";
import "dotenv/config";
import fs from "fs";

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

export function buildGoogleSaveUrl({ cardId, name, stamps, max }) {
  const creds = loadServiceAccount();

  const issuerId = process.env.GOOGLE_ISSUER_ID;     // 3388000000023035846
  const classId  = process.env.GOOGLE_CLASS_ID;      // 3388...venus_loyalty_v1
  const objectId = `${issuerId}.${cardId}`;

  const payload = {
    iss: creds.client_email,
    aud: "google",
    // importante: que coincida con el dominio desde donde abres el enlace
    origins: [
      process.env.BASE_URL,            // https://venus-loyalty.onrender.com
      "http://localhost:3000"          // opcional, para pruebas locales
    ],
    typ: "savetowallet",
    payload: {
      // 👇 SOLO OBJETOS. Nada de loyaltyClasses porque ya existe la clase.
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
  return `https://pay.google.com/gp/v/save/${token}`;
}