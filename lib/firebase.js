// lib/firebase.js
import admin from "firebase-admin";
import fs from "fs";

if (!admin.apps.length) {
  const path = process.env.FIREBASE_CREDENTIALS_PATH;
  if (!path) {
    throw new Error("Falta FIREBASE_CREDENTIALS_PATH");
  }

  const json = fs.readFileSync(path, "utf8");
  const serviceAccount = JSON.parse(json);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const firestore = admin.firestore();

export { firestore };