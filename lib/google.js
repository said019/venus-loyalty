// lib/google.js
import jwt from "jsonwebtoken";
import "dotenv/config";
import fs from "fs";

export function buildGoogleSaveUrl({ cardId, name, stamps, max }) {
  let creds = {};
  // Lee el archivo JSON de credenciales si existe (Render usa esta ruta segura)
  if (process.env.GOOGLE_SA_JSON && fs.existsSync(process.env.GOOGLE_SA_JSON)) {
    creds = JSON.parse(fs.readFileSync(process.env.GOOGLE_SA_JSON, "utf8"));
  }

  const payload = {
    iss: creds.client_email,
    aud: "google",
    origins: [process.env.BASE_URL],
    typ: "savetowallet",
    payload: {
      loyaltyObjects: [
        {
          id: `${process.env.GOOGLE_ISSUER_ID}.${cardId}`,
          classId: process.env.GOOGLE_CLASS_ID,
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
          ],
        }
      ],
    },
  };

  const privateKey = creds.private_key.replace(/\\n/g, "\n");
  const token = jwt.sign(payload, privateKey, { algorithm: "RS256" });
  return `https://pay.google.com/gp/v/save/${token}`;
}