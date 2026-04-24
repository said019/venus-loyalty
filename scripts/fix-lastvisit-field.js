// fix-lastvisit-field.js
// Script para verificar y corregir el campo lastVisit en tarjetas existentes

import { firestore } from './lib/firebase.js';

async function fixLastVisitField() {
    try {
        console.log('🔍 Verificando tarjetas sin campo lastVisit...\n');

        const cardsSnap = await firestore.collection('cards').get();
        let fixed = 0;
        let alreadyHave = 0;
        let total = cardsSnap.size;

        console.log(`📊 Total de tarjetas: ${total}\n`);

        for (const doc of cardsSnap.docs) {
            const card = doc.data();
            
            // Si ya tiene lastVisit, skip
            if (card.lastVisit) {
                alreadyHave++;
                continue;
            }

            // Si no tiene lastVisit, usar updatedAt o createdAt
            const fallbackDate = card.updatedAt || card.createdAt;
            
            if (fallbackDate) {
                await firestore.collection('cards').doc(doc.id).update({
                    lastVisit: fallbackDate
                });
                
                console.log(`✅ ${card.name || doc.id}: lastVisit = ${fallbackDate}`);
                fixed++;
            } else {
                console.log(`⚠️  ${card.name || doc.id}: No hay fecha disponible`);
            }
        }

        console.log(`\n📊 Resumen:`);
        console.log(`   Total: ${total}`);
        console.log(`   Ya tenían lastVisit: ${alreadyHave}`);
        console.log(`   Corregidas: ${fixed}`);
        console.log(`   Sin fecha: ${total - alreadyHave - fixed}`);
        
        if (fixed > 0) {
            console.log(`\n✅ Se actualizaron ${fixed} tarjetas`);
            console.log('💡 Refresca el dashboard para ver los cambios');
        } else {
            console.log(`\n✅ Todas las tarjetas ya tienen el campo lastVisit`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

// Ejecutar
fixLastVisitField();
