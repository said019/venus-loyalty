export const CARD_FEE_PERCENT = 5;
export const BANK_TIMEZONE = 'America/Mexico_City';
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: BANK_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export function isCard(method) { return /tarjeta/i.test(String(method || '')) || String(method).toLowerCase() === 'card'; }
export function mexicoDay(date = new Date()) { return dayFormatter.format(new Date(date)); }
export function cardAmounts(amount) {
  const grossCents = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(grossCents) || grossCents < 0) throw new Error('Monto inválido');
  const feeCents = Math.round(grossCents * CARD_FEE_PERCENT / 100);
  return { grossCents, feeCents, netCents: grossCents - feeCents };
}
export function expectedSettlement(paidAt) {
  const day = mexicoDay(paidAt);
  const d = new Date(`${day}T12:00:00Z`);
  const weekday = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (weekday === 5 ? 3 : weekday === 6 ? 2 : 1));
  const expectedDate = d.toISOString().slice(0, 10);
  return { expectedDate, expectedAt: `${expectedDate}T12:00:00-06:00` };
}
export function settlementStatus(payment, confirmation, now = new Date()) {
  const matches = confirmation?.grossCents === payment.grossCents && confirmation?.paidAt === payment.paidAt;
  if (confirmation?.confirmedAt && matches) return 'received';
  return new Date(now) >= new Date(payment.expectedAt) ? 'verify' : 'pending';
}
