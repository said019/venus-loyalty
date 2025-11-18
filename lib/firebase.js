// lib/firebase.js
import fs from "fs";
import admin from "firebase-admin";

/**
 * Resuelve la ruta del archivo de credenciales.
 * Usamos:
 *  - FIREBASE_CREDENTIALS_PATH  (Render secret file)
 *  - o GOOGLE_APPLICATION_CREDENTIALS
 */
function resolveCredentialsPath() {
  const candidates = [
    process.env.FIREBASE_CREDENTIALS_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    "No se encontró el archivo de credenciales de Firebase. " +
      "Configura FIREBASE_CREDENTIALS_PATH o GOOGLE_APPLICATION_CREDENTIALS."
  );
}

// Cargar JSON del service account
const credPath = resolveCredentialsPath();
const serviceAccount = JSON.parse(fs.readFileSync(credPath, "utf8"));

// Inicializar Firebase Admin solo una vez
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id, // p.ej. "venus-bd439"
  });
}

// Exportar firestore
const firestore = admin.firestore();

export { firestore, admin };