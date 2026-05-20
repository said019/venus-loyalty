#!/usr/bin/env node
// Lista los usuarios con role='recepcion' en Postgres.
// Uso: node scripts/list-recepcion-admins.js
//
// Lee DATABASE_URL del .env y hace un SELECT solo de lectura.
// NO modifica datos. NO imprime el hash de la contraseña.

import 'dotenv/config';
import { prisma } from '../src/db/index.js';

try {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT id, email, role, created_at FROM admins ORDER BY created_at DESC"
  );
  const recep = rows.filter(r => r.role === 'recepcion');
  console.log('\n=== Admins totales ===');
  console.table(rows.map(r => ({ id: r.id, email: r.email, role: r.role })));
  console.log(`\n=== Usuarios de recepción (${recep.length}) ===`);
  if (recep.length === 0) {
    console.log('(ninguno — usa scripts/create-recepcion.js para crear uno)');
  } else {
    console.table(recep.map(r => ({ email: r.email, id: r.id })));
  }
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await prisma.$disconnect();
}
