// scripts/seed-caja-test.js — datos mínimos para probar la corrección de
// cobros en una base LOCAL. No tocar contra producción.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const hoy = new Date().toISOString().slice(0, 10);

async function main() {
  if (!process.env.DATABASE_URL?.includes('localhost')) {
    throw new Error('Este seed es solo para una base local');
  }

  await prisma.admin.upsert({
    where: { email: 'admin@venus.test' },
    update: { pass_hash: bcrypt.hashSync('venus123', 10), role: 'admin' },
    create: { email: 'admin@venus.test', pass_hash: bcrypt.hashSync('venus123', 10), role: 'admin', name: 'Admin Prueba' },
  });
  await prisma.admin.upsert({
    where: { email: 'recepcion@venus.test' },
    update: { pass_hash: bcrypt.hashSync('venus123', 10), role: 'recepcion' },
    create: { email: 'recepcion@venus.test', pass_hash: bcrypt.hashSync('venus123', 10), role: 'recepcion', name: 'Recepción Prueba' },
  });

  const card = await prisma.card.upsert({
    where: { phone: '5215550000001' },
    update: {},
    create: { name: 'Ana Prueba', phone: '5215550000001' },
  });

  // Saldo a favor: dejó $300 y se le aplicaron a la cita de hoy.
  await prisma.clientCredit.deleteMany({ where: { cardId: card.id } });
  await prisma.appointment.deleteMany({ where: { clientPhone: card.phone } });
  await prisma.sale.deleteMany({});

  const cita = await prisma.appointment.create({
    data: {
      clientName: card.name, clientPhone: card.phone, cardId: card.id,
      serviceName: 'Facial de limpieza profunda',
      date: hoy, time: '11:00',
      startDateTime: new Date(`${hoy}T11:00:00-06:00`),
      endDateTime: new Date(`${hoy}T12:00:00-06:00`),
      status: 'completed',
      confirmedAt: new Date(),
      totalPaid: 500, paymentMethod: 'tarjeta', creditApplied: 300,
    },
  });

  await prisma.clientCredit.create({
    data: {
      cardId: card.id, clientPhone: card.phone, type: 'deposito', amount: 300,
      paymentMethod: 'efectivo', note: 'Apartado de prueba', createdBy: 'seed',
    },
  });
  await prisma.clientCredit.create({
    data: {
      cardId: card.id, clientPhone: card.phone, type: 'aplicacion', amount: -300,
      appointmentId: cita.id, sourceRef: `appt:${cita.id}`, createdBy: 'seed',
    },
  });

  // El renglón espejo del cobro de la cita
  await prisma.sale.create({
    data: {
      appointmentId: cita.id, clientName: card.name, serviceName: cita.serviceName,
      serviceAmount: 500, productsAmount: 0, subtotal: 500, total: 500, totalAmount: 500,
      paymentMethod: 'tarjeta', date: new Date(),
    },
  });

  // Un ingreso manual capturado con el monto equivocado
  await prisma.sale.create({
    data: {
      clientName: 'Sofía Prueba', serviceName: 'Paquete 5 sesiones',
      serviceAmount: 1200, productsAmount: 0, subtotal: 1200, total: 1200, totalAmount: 1200,
      paymentMethod: 'efectivo', date: new Date(),
    },
  });

  // Venta de mostrador
  await prisma.sale.create({
    data: {
      clientName: 'Venta Mostrador', serviceAmount: 0, productsAmount: 350,
      subtotal: 350, total: 350, totalAmount: 350, paymentMethod: 'efectivo',
      productsSold: [{ name: 'Serum vitamina C', quantity: 1, price: 350, subtotal: 350 }],
      date: new Date(),
    },
  });

  console.log('Sembrado. Cita cobrada:', cita.id);
}

main().finally(() => prisma.$disconnect());
