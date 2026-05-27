#!/usr/bin/env node
// Crea o actualiza un usuario de recepción con email + contraseña.
// Uso:
//   node scripts/set-recepcion-password.js <email> <password>
//
// Si el email no existe, lo crea con role='recepcion'.
// Si existe, le actualiza el pass_hash (y fuerza role='recepcion').

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db/index.js';

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error('Uso: node scripts/set-recepcion-password.js <email> <password>');
  process.exit(1);
}

const norm = email.trim().toLowerCase();
const hash = await bcrypt.hash(password, 10);

try {
  const existing = await prisma.$queryRawUnsafe(
    "SELECT id, email, role FROM admins WHERE email = $1",
    norm
  );
  if (existing.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE admins SET pass_hash = $1, role = 'recepcion', "updatedAt" = NOW() WHERE email = $2`,
      hash, norm
    );
    console.log(`✓ Actualizado password de ${norm} (role=recepcion)`);
  } else {
    const id = `adm_${Date.now()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO admins (id, email, pass_hash, role, "createdAt", "updatedAt") VALUES ($1, $2, $3, 'recepcion', NOW(), NOW())`,
      id, norm, hash
    );
    console.log(`✓ Creado nuevo usuario recepción: ${norm} (id=${id})`);
  }
  console.log(`\nAhora puedes iniciar sesión en /admin-login.html con:`);
  console.log(`  Email:    ${norm}`);
  console.log(`  Password: ${password}`);
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await prisma.$disconnect();
}
