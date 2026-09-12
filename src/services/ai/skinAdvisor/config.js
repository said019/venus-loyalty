export const SKIN_CONSENT_VERSION = 'venus-openai-photos-v1';
export const SKIN_CONSENT_TEXT = 'Autorizo que Venus envíe las fotografías seleccionadas de mi piel y las respuestas relevantes de esta consulta a OpenAI para preparar observaciones cosméticas orientativas. Una persona autorizada revisará el borrador. No se enviarán mi nombre, teléfono ni mi expediente completo. Entiendo que el procesamiento ocurre con un proveedor externo y que no constituye un diagnóstico médico.';

// Called explicitly at the application boundary, never reads process.env itself.
export function skinAdvisorConfig(env = {}) {
  const model = typeof env.SKIN_ADVISOR_MODEL === 'string' ? env.SKIN_ADVISOR_MODEL.trim() : '';
  const apiKey = typeof env.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY : '';
  return {
    enabled: env.SKIN_ADVISOR_ENABLED === 'true',
    configured: Boolean(model && apiKey.trim()),
    approverId: env.SKIN_ADVISOR_APPROVER_ID || '',
    consentVersion: SKIN_CONSENT_VERSION,
    consentText: SKIN_CONSENT_TEXT,
    activationVersion: 'venus-skin-activation-v1',
    model, apiKey,
    // No unreviewed commercial catalogue is interpreted as a clinical protocol.
    activeServices: [], protocols: [],
  };
}
