// scripts/seed-recepcion.js
// Uso: node scripts/seed-recepcion.js
// Crea o resetea la cuenta compartida "recepción" en Firestore.

import "dotenv/config";
import bcrypt from "bcryptjs";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString()
  );
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const firestore = admin.firestore();
const COL_ADMINS = "admins";
const EMAIL = "recepcion@venus.local";

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const pass = await rl.question("Password para recepcion@venus.local: ");
  rl.close();

  if (!pass || pass.length < 6) {
    console.error("La contraseña debe tener al menos 6 caracteres.");
    process.exit(1);
  }

  const pass_hash = await bcrypt.hash(pass, 10);
  const now = new Date().toISOString();

  const existing = await firestore
    .collection(COL_ADMINS)
    .where("email", "==", EMAIL)
    .limit(1)
    .get();

  if (!existing.empty) {
    const id = existing.docs[0].id;
    await firestore.collection(COL_ADMINS).doc(id).update({
      pass_hash,
      role: "recepcion",
      updatedAt: now,
    });
    console.log(`✓ Reseteada cuenta existente (${id}).`);
  } else {
    const id = `adm_recepcion_${Date.now()}`;
    await firestore.collection(COL_ADMINS).doc(id).set({
      id,
      email: EMAIL,
      pass_hash,
      role: "recepcion",
      createdAt: now,
      updatedAt: now,
    });
    console.log(`✓ Creada cuenta nueva (${id}).`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
