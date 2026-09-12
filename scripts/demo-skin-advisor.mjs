import assert from 'node:assert/strict';
import { AREAS, createAdvisorSession } from '../src/services/ai/skinAdvisor/index.js';
import { makeInput, makeAssessment } from '../tests/fixtures/skin-advisor.js';

// This demonstration must never contact a provider, even accidentally.
globalThis.fetch = async () => { throw new Error('Network disabled in simulation'); };

console.log('SIMULACIÓN — sin OpenAI, fotos reales ni validación clínica');
const session = createAdvisorSession({
  simulation: true,
  provider: {
    metadata: { provider: 'simulation', model: 'offline-fixture', simulation: true },
    async generate(context) { return makeAssessment(context); },
  },
  authorizeReview: async () => false,
});
await session.replaceInput(await makeInput());
await session.generate();
const snapshot = session.snapshot();
assert.equal(snapshot.status, 'pending_review');
console.log('Estado:', snapshot.status);
console.log('Áreas del catálogo:', AREAS.length);
console.log('Resumen ficticio:', snapshot.assessment.summary);
console.log('Borrador ficticio listo para revisión; no aprobado ni publicado.');
