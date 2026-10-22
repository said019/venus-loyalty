import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const hash = token => createHash('sha256').update(token).digest('hex');
const keyFor = cardId => `skin-report-access:${cardId}`;

// Only a private, authenticated workflow can issue a new share link.
// Rotation revokes previous links; only the digest is stored in Settings.
export function createSkinReportAccess({ prisma }) {
  return {
    async issue(cardId) {
      const token = randomBytes(32).toString('hex');
      const value = { digest: hash(token) };
      await prisma.setting.upsert({ where: { key: keyFor(cardId) }, create: { key: keyFor(cardId), value }, update: { value } });
      return token;
    },
    async verify(cardId, token) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
      const row = await prisma.setting.findUnique({ where: { key: keyFor(cardId) } });
      const digest = row?.value?.digest;
      if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) return false;
      return timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(hash(token), 'hex'));
    },
  };
}
