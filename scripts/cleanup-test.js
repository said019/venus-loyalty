import { prisma } from '../src/db/index.js';

async function cleanup() {
  await prisma.appointment.delete({ where: { id: 'cmk50g4bj0002yl2epjipue24' } });
  await prisma.card.delete({ where: { id: 'cmk50g45x0000yl2e89fq140s' } });
  console.log('✅ Cita y tarjeta de prueba eliminadas');
  await prisma.$disconnect();
}

cleanup();
