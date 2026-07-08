// src/services/fichaTokens.js
// Tokens firmados para que la clienta llene formularios sin login.
// El token viaja en el link de WhatsApp: /ficha/:token o /consentimiento/:token
import jwt from 'jsonwebtoken';

const SECRET = process.env.FICHA_TOKEN_SECRET || process.env.ADMIN_JWT_SECRET;
const EXPIRY = '30d';
const PURPOSES = new Set(['ficha', 'consent']);

export function signFichaToken(cardId, purpose) {
  if (!PURPOSES.has(purpose)) throw new Error(`purpose inválido: ${purpose}`);
  if (!SECRET) throw new Error('FICHA_TOKEN_SECRET/ADMIN_JWT_SECRET no configurado');
  return jwt.sign({ cardId, purpose }, SECRET, { expiresIn: EXPIRY });
}

export function verifyFichaToken(token, purpose) {
  const payload = jwt.verify(token, SECRET); // lanza si es inválido/expirado
  if (payload.purpose !== purpose) throw new Error('purpose no coincide');
  return { cardId: payload.cardId };
}
