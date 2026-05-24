// Bootstrap de secretos para entornos donde NO se commitea el service account
// de Google (p.ej. Railway). Si existe la env var GOOGLE_SA_JSON_B64 (el JSON
// del service account en base64), lo escribe a disco al arrancar, en la misma
// ruta que leen lib/google.js y googleCalendarService.js.
//
// No-op si la variable no está definida (caso Render, donde el archivo ya está
// en el repo o se provee por otro medio).
import fs from "node:fs";
import path from "node:path";

const b64 = process.env.GOOGLE_SA_JSON_B64;
if (b64) {
  const target =
    process.env.GOOGLE_SA_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    "./secrets/google-sa.json";
  try {
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    // Validar que el base64 realmente sea el JSON del service account.
    const parsed = JSON.parse(decoded);
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("falta client_email/private_key");
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, decoded); // idempotente: sobrescribe en cada arranque
    console.log(`[ensure-secrets] ${target} escrito desde GOOGLE_SA_JSON_B64`);
  } catch (e) {
    console.error(
      "[ensure-secrets] GOOGLE_SA_JSON_B64 NO es un JSON válido en base64 (revisa que sea el google-sa.json):",
      e.message
    );
  }
}
