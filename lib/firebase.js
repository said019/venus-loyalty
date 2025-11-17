// lib/firebase.js
import admin from "firebase-admin";

let app;

if (!admin.apps.length) {
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saRaw) {
    throw new Error("Falta env FIREBASE_SERVICE_ACCOUNT");
  }

  const serviceAccount = JSON.parse(saRaw);

  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const firestore = admin.firestore();