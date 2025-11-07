import fs from "node:fs";
import jwt from "jsonwebtoken";
import "dotenv/config";

function loadSa() {
  const raw = fs.readFileSync(process.env.GOOGLE_SA_JSON, "utf8");
  const { client_email, private_key } = JSON.parse(raw);
  return { client_email, private_key };
}

export function buildGoogleSaveUrl({ cardId, name, stamps, max }) {
  const { client_email, private_key } = loadSa();

  const payload = {
    iss: client_email,
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
            label: "Sellos",
          },
          textModulesData: [
            {
              header: "Programa de Lealtad Venus",
              body: "Completa 8 sellos y obtén un facial de cortesía 💆‍♀️",
            },
          ],
          barcode: { type: "QR_CODE", value: cardId }
        },
      ],
    },
  };

  const token = jwt.sign(payload, private_key, { algorithm: "RS256" });
  return `https://pay.google.com/gp/v/save/${token}`;
}