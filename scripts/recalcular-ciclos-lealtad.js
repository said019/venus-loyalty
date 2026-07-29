// Repara el contador de ciclos de las tarjetas de lealtad.
//
// Contexto: hasta jul-2026 el canje hecho desde el escáner de recepción
// (POST /api/redeem/:cardId) reiniciaba los sellos pero NO incrementaba
// `cycles`; solo el canje desde el panel lo hacía. Los dos caminos sí dejaban
// su evento `redeem`, así que el número real de ciclos completados se puede
// reconstruir contando esos eventos.
//
// Regla conservadora: cycles = max(cycles actual, eventos redeem). Nunca baja
// un contador — si una tarjeta trae ciclos de una importación sin eventos, se
// respeta.
//
// Uso:
//   node scripts/recalcular-ciclos-lealtad.js            → solo reporta (dry run)
//   node scripts/recalcular-ciclos-lealtad.js --apply    → escribe los cambios
import { prisma } from '../src/db/index.js';

const APLICAR = process.argv.includes('--apply');

async function main() {
  console.log(APLICAR ? '== APLICANDO CAMBIOS ==' : '== SIMULACIÓN (usa --apply para escribir) ==');

  const [cards, redeems] = await Promise.all([
    prisma.card.findMany({ select: { id: true, name: true, cycles: true } }),
    prisma.event.groupBy({ by: ['cardId'], where: { type: 'redeem' }, _count: { _all: true } }),
  ]);

  const canjesPorTarjeta = new Map(redeems.map(r => [r.cardId, r._count._all]));

  let porCorregir = 0;
  let ciclosAgregados = 0;

  for (const card of cards) {
    const actual = card.cycles || 0;
    const real = canjesPorTarjeta.get(card.id) || 0;
    if (real <= actual) continue;

    porCorregir++;
    ciclosAgregados += real - actual;
    console.log(`  ${card.name || card.id}: ${actual} → ${real} ciclos`);

    if (APLICAR) {
      await prisma.card.update({ where: { id: card.id }, data: { cycles: real } });
    }
  }

  console.log(`\nTarjetas revisadas: ${cards.length}`);
  console.log(`Tarjetas ${APLICAR ? 'corregidas' : 'por corregir'}: ${porCorregir}`);
  console.log(`Ciclos ${APLICAR ? 'recuperados' : 'que se recuperarían'}: ${ciclosAgregados}`);
  if (!APLICAR && porCorregir > 0) console.log('\nVuelve a correrlo con --apply para guardar.');
}

main()
  .catch(e => { console.error('Error:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
