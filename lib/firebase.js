// lib/firebase.js
import admin from "firebase-admin";
import fs from "fs";

function resolveCredentialsPath() {
  // 1) Variable que te sugerí
  if (process.env.FIREBASE_CREDENTIALS_PATH) {
    return process.env.FIREBASE_CREDENTIALS_PATH;
  }

  // 2) Variable estándar de Google, por si la usas
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }

  // 3) Ruta por defecto de Render para el secret file "firebase-credentials"
  const defaultPath = "/etc/secrets/firebase-credentials";
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }

  throw new Error(
    "No se encontró el archivo de credenciales de Firebase. " +
      "Configura FIREBASE_CREDENTIALS_PATH o GOOGLE_APPLICATION_CREDENTIALS, " +
      "o asegúrate de que el secret file esté montado en /etc/secrets/firebase-credentials"
  );
}

if (!admin.apps.length) {
  const credPath = resolveCredentialsPath();
  const json = fs.readFileSync(credPath, "utf8");
  const serviceAccount = JSON.parse(json);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const firestore = admin.firestore();

export { firestore };