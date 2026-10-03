// Cobros por su fecha contable; citas históricas sin venta usan su fecha de cita.
export async function paymentAppointments(prisma, from, to) {
  const range = { gte: new Date(from), lte: new Date(to) };
  const sales = await prisma.sale.findMany({ where: { appointmentId: { not: null }, date: range }, orderBy: { date: 'asc' } });
  const candidates = await prisma.appointment.findMany({ where: { status: 'completed', OR: [
    { id: { in: sales.map(s => s.appointmentId) } }, { startDateTime: range }
  ] } });
  const linked = await prisma.sale.findMany({ where: { appointmentId: { in: candidates.map(a => a.id) } }, select: { appointmentId: true } });
  const linkedIds = new Set(linked.map(s => s.appointmentId));
  const byId = new Map(candidates.map(a => [a.id, a]));
  return [
    ...sales.filter(s => byId.has(s.appointmentId)).map(s => ({ ...byId.get(s.appointmentId),
      id: s.id, paidAt: s.date, totalPaid: s.totalAmount, serviceAmount: s.serviceAmount,
      discountAmount: s.discountAmount, productsSold: s.productsSold, paymentMethod: s.paymentMethod })),
    ...candidates.filter(a => !linkedIds.has(a.id))
  ];
}
