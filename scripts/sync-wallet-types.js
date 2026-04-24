/**
 * Script: Sincronizar walletType en tarjetas con dispositivos registrados
 * 
 * Propósito:
 * - Actualizar el campo 'walletType' en tarjetas basado en dispositivos registrados
 * - Asegurar que Apple Wallet y Google Wallet se sincronicen correctamente
 * - Facilitar debugging y administración de dispositivos
 * 
 * Uso:
 * node sync-wallet-types.js
 */

import { firestore } from './lib/firebase.js';

const COL_CARDS = 'cards';
const COL_DEVICES = 'apple_devices';
const COL_GOOGLE_DEVICES = 'google_devices';

async function syncWalletTypes() {
  try {
    console.log('🔄 Sincronizando walletType en tarjetas...\n');

    // 1. Obtener todas las tarjetas
    const cardsSnap = await firestore.collection(COL_CARDS).get();
    console.log(`📊 Total de tarjetas: ${cardsSnap.size}\n`);

    // 2. Obtener dispositivos Apple
    const appleDevicesSnap = await firestore.collection(COL_DEVICES).get();
    const appleCardIds = new Set();
    appleDevicesSnap.forEach(doc => {
      const data = doc.data();
      if (data.cardId) appleCardIds.add(data.cardId);
    });
    console.log(`🍎 Tarjetas con Apple Wallet: ${appleCardIds.size}`);

    // 3. Obtener dispositivos Google
    const googleDevicesSnap = await firestore.collection(COL_GOOGLE_DEVICES).get();
    const googleCardIds = new Set();
    googleDevicesSnap.forEach(doc => {
      const data = doc.data();
      if (data.cardId) googleCardIds.add(data.cardId);
    });
    console.log(`🤖 Tarjetas con Google Wallet: ${googleCardIds.size}\n`);

    // 4. Actualizar tarjetas
    let updated = 0;
    let alreadyCorrect = 0;
    let noWallet = 0;

    for (const doc of cardsSnap.docs) {
      const cardId = doc.id;
      const card = doc.data();

      // Determinar walletType basado en dispositivos
      let newWalletType = null;
      if (appleCardIds.has(cardId) && googleCardIds.has(cardId)) {
        newWalletType = 'both';
      } else if (appleCardIds.has(cardId)) {
        newWalletType = 'apple';
      } else if (googleCardIds.has(cardId)) {
        newWalletType = 'google';
      }

      // Verificar si necesita actualización
      const currentWalletType = card.walletType;

      if (newWalletType === currentWalletType) {
        alreadyCorrect++;
        // console.log(`✓ ${card.name}: ${newWalletType} (correcto)`);
      } else if (newWalletType) {
        // Actualizar
        await firestore.collection(COL_CARDS).doc(cardId).update({
          walletType: newWalletType
        });
        updated++;
        console.log(`✅ ${card.name}: ${currentWalletType} → ${newWalletType}`);
      } else {
        // Sin wallets
        noWallet++;
        if (currentWalletType) {
          // Limpiar walletType anterior
          await firestore.collection(COL_CARDS).doc(cardId).update({
            walletType: null
          });
          console.log(`🧹 ${card.name}: Sin wallets (limpiado)`);
        }
      }
    }

    console.log(`\n📊 Resumen:`);
    console.log(`   Total tarjetas: ${cardsSnap.size}`);
    console.log(`   Ya correctas: ${alreadyCorrect}`);
    console.log(`   Actualizadas: ${updated}`);
    console.log(`   Sin wallets: ${noWallet}`);

    if (updated > 0) {
      console.log(`\n✅ Se actualizaron ${updated} tarjetas`);
      console.log('💡 Refresca el dashboard para ver los cambios');
    } else {
      console.log(`\n✅ Todas las tarjetas ya están sincronizadas`);
    }

    console.log(`\n🔍 Resumen por tipo:`);
    console.log(`   Apple Wallet: ${appleCardIds.size} tarjetas`);
    console.log(`   Google Wallet: ${googleCardIds.size} tarjetas`);
    console.log(`   Ambos: ${Array.from(appleCardIds).filter(id => googleCardIds.has(id)).length} tarjetas`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Ejecutar
syncWalletTypes();
