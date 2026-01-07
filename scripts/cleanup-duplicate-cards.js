/**
 * Script para limpiar tarjetas duplicadas
 * Elimina tarjetas con prefijo 52 cuando existe una versión sin prefijo del mismo teléfono
 */

import { prisma } from '../src/db/index.js';

async function cleanupDuplicateCards() {
  console.log('🔍 Buscando tarjetas duplicadas...\n');

  try {
    // Obtener todas las tarjetas
    const allCards = await prisma.card.findMany({
      orderBy: { createdAt: 'asc' }
    });

    console.log(`Total de tarjetas: ${allCards.length}\n`);

    const duplicates = [];
    const toDelete = [];

    // Buscar duplicados
    for (const card of allCards) {
      if (card.phone.startsWith('52') && card.phone.length === 12) {
        const phoneWithout52 = card.phone.substring(2);

        // Buscar si existe una tarjeta con el mismo teléfono sin el 52
        const duplicate = allCards.find(c =>
          c.phone === phoneWithout52 && c.id !== card.id
        );

        if (duplicate) {
          duplicates.push({
            with52: card,
            without52: duplicate
          });

          // Decidir cuál eliminar: eliminar la MÁS NUEVA (la que tiene 52)
          // Mantener la más antigua (la que no tiene 52)
          toDelete.push(card);
        }
      }
    }

    if (duplicates.length === 0) {
      console.log('✅ No se encontraron tarjetas duplicadas.');
      return;
    }

    console.log(`📋 Se encontraron ${duplicates.length} pares de tarjetas duplicadas:\n`);

    for (const dup of duplicates) {
      console.log(`  Duplicado:`);
      console.log(`    ❌ Eliminar: ${dup.with52.name} - ${dup.with52.phone} (ID: ${dup.with52.id})`);
      console.log(`       Creada: ${dup.with52.createdAt.toLocaleString('es-MX')}`);
      console.log(`       Sellos: ${dup.with52.stamps}/${dup.with52.max}`);
      console.log(`    ✅ Mantener: ${dup.without52.name} - ${dup.without52.phone} (ID: ${dup.without52.id})`);
      console.log(`       Creada: ${dup.without52.createdAt.toLocaleString('es-MX')}`);
      console.log(`       Sellos: ${dup.without52.stamps}/${dup.without52.max}`);
      console.log('');
    }

    // Verificar si las tarjetas a eliminar tienen citas asociadas
    console.log('🔍 Verificando citas asociadas...\n');

    for (const card of toDelete) {
      const appointments = await prisma.appointment.findMany({
        where: { cardId: card.id }
      });

      if (appointments.length > 0) {
        console.log(`  ⚠️  ${card.name} (${card.phone}) tiene ${appointments.length} citas asociadas`);

        // Buscar la tarjeta a mantener
        const phoneWithout52 = card.phone.substring(2);
        const keepCard = allCards.find(c => c.phone === phoneWithout52);

        if (keepCard) {
          console.log(`     → Se reasignarán a ${keepCard.name} (${keepCard.phone})`);

          // Reasignar las citas a la tarjeta que se mantiene
          await prisma.appointment.updateMany({
            where: { cardId: card.id },
            data: { cardId: keepCard.id }
          });

          console.log(`     ✅ ${appointments.length} citas reasignadas`);
        }
      }
    }

    console.log('\n🗑️  Eliminando tarjetas duplicadas...\n');

    // Eliminar las tarjetas duplicadas
    for (const card of toDelete) {
      await prisma.card.delete({
        where: { id: card.id }
      });
      console.log(`  ✅ Eliminada: ${card.name} - ${card.phone}`);
    }

    console.log(`\n✅ Limpieza completada. Se eliminaron ${toDelete.length} tarjetas duplicadas.`);

  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar el script
cleanupDuplicateCards()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
