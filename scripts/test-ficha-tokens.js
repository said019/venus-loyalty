// Prueba manual: node scripts/test-ficha-tokens.js
import 'dotenv/config';
import { signFichaToken, verifyFichaToken } from '../src/services/fichaTokens.js';

const t = signFichaToken('card_test_123', 'ficha');
const out = verifyFichaToken(t, 'ficha');
if (out.cardId !== 'card_test_123') throw new Error('cardId no coincide');

let threw = false;
try { verifyFichaToken(t, 'consent'); } catch { threw = true; }
if (!threw) throw new Error('debió rechazar propósito distinto');

try { verifyFichaToken('token-basura', 'ficha'); threw = false; } catch { threw = true; }
if (!threw) throw new Error('debió rechazar token inválido');

console.log('✅ fichaTokens OK');
