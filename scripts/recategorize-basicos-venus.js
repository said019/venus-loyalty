// scripts/recategorize-basicos-venus.js
//
// Mueve un set de servicios a la categoría "Básicos Venus".
// Por ahora: ["Acné Consciente"].
//
// Uso: node scripts/recategorize-basicos-venus.js
// Requiere: GOOGLE_APPLICATION_CREDENTIALS apuntando al service account.
//
// Idempotente: si ya está en la categoría destino, lo reporta sin tocar nada.

import 'dotenv/config';
import { firestore } from '../src/db/compat.js';

const TARGET_CATEGORY = 'Básicos Venus';
const NAMES = ['Acné Consciente'];

async function main() {
  console.log(`→ Reclasificando a "${TARGET_CATEGORY}":`, NAMES);

  for (const name of NAMES) {
    const snap = await firestore.collection('services')
      .where('name', '==', name)
      .limit(1)
      .get();

    if (snap.empty) {
      console.warn(`  ⚠️  No encontrado: "${name}"`);
      continue;
    }

    const doc = snap.docs[0];
    const current = doc.data().category || '(sin categoría)';
    if (current === TARGET_CATEGORY) {
      console.log(`  ✓ Ya está en "${TARGET_CATEGORY}": "${name}"`);
      continue;
    }

    await doc.ref.update({
      category: TARGET_CATEGORY,
      updatedAt: new Date().toISOString(),
    });
    console.log(`  ✅ "${name}": "${current}" → "${TARGET_CATEGORY}"`);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
