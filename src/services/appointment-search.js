export async function searchAppointments(repo, { q, scope = 'all', offset = 0 }, now = new Date()) {
  const query = String(q || '').trim().slice(0, 100);
  const skip = Math.max(0, Math.min(100000, Number.parseInt(offset, 10) || 0));
  const limit = 20;
  if (query.length < 2) return { data: [], hasMore: false, total: 0 };
  const digits = query.replace(/\D/g, '');
  const match = { OR: [
    { AND: query.split(/\s+/).map(word => ({ clientName: { contains: word, mode: 'insensitive' } })) },
    { clientPhone: { contains: digits.length >= 3 ? digits : query } }
  ] };
  const upcoming = { ...match, startDateTime: { gte: now } };
  const past = { ...match, startDateTime: { lt: now } };
  const select = { id: true, clientName: true, clientPhone: true, serviceName: true, date: true, time: true, durationMinutes: true, status: true, cardId: true };
  const find = (where, direction, skip, take) => repo.findMany({ where, select, orderBy: [{ startDateTime: direction }, { id: 'asc' }], skip, take });
  let data, total;
  if (scope === 'upcoming' || scope === 'past') {
    const where = scope === 'past' ? past : upcoming;
    [data, total] = await Promise.all([find(where, scope === 'past' ? 'desc' : 'asc', skip, limit), repo.count({ where })]);
  } else {
    const [futureCount, pastCount] = await Promise.all([repo.count({ where: upcoming }), repo.count({ where: past })]);
    total = futureCount + pastCount;
    data = skip < futureCount ? await find(upcoming, 'asc', skip, limit) : [];
    if (data.length < limit) data.push(...await find(past, 'desc', Math.max(0, skip - futureCount), limit - data.length));
  }
  return { data, total, hasMore: skip + data.length < total };
}
