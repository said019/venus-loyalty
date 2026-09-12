import { randomUUID } from 'node:crypto';
import { validateAssessment } from './contract.js';
import { prepareContext } from './context.js';
import { CATALOG_VERSION } from './catalog.js';
import { PROMPT_VERSION } from './prompt.js';

const SCHEMA_VERSION = 'venus-skin-assessment-v1';
const HISTORY_LIMIT = 20;
const SAFE_GENERATION_CODES = new Set([
  'disabled', 'key_missing', 'timeout', 'aborted', 'provider_http', 'network',
  'response_too_large', 'malformed_response', 'refused', 'incomplete',
  'missing_output', 'ambiguous_output', 'invalid_assessment',
]);

class SessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SkinAdvisorSessionError';
    this.code = code;
  }
}

const sessionError = (code, message) => new SessionError(code, message);
const freezeClone = (value) => {
  const clone = structuredClone(value);
  const freeze = (item) => {
    if (!item || typeof item !== 'object') return item;
    for (const child of Object.values(item)) freeze(child);
    return Object.freeze(item);
  };
  return freeze(clone);
};

export function createAdvisorSession({ provider, authorizeReview, simulation = false, clock = () => new Date() } = {}) {
  if (!provider || typeof provider.generate !== 'function') throw new TypeError('provider.generate is required.');
  if (typeof authorizeReview !== 'function') throw new TypeError('authorizeReview callback is required.');
  if (typeof simulation !== 'boolean') throw new TypeError('simulation must be boolean.');
  const effectiveSimulation = simulation || provider.metadata?.simulation === true;

  const sessionId = randomUUID();
  let context = null;
  let revision = 0;
  let inflight = null;
  let current = {
    sessionId,
    status: 'empty',
    inputVersion: null,
    assessment: null,
    provenance: null,
    approval: null,
    failure: null,
    history: [],
  };

  const now = () => {
    const value = clock();
    return (value instanceof Date ? value : new Date(value)).toISOString();
  };
  const remember = (status, inputVersion, details = {}) => {
    current.history.push(structuredClone({ status, inputVersion, at: now(), ...details }));
    if (current.history.length > HISTORY_LIMIT) current.history.splice(0, current.history.length - HISTORY_LIMIT);
  };
  const snapshot = () => freezeClone(current);

  const replaceInput = async (raw) => {
    revision += 1;
    const ownRevision = revision;
    if (inflight) {
      inflight.controller.abort();
      remember('superseded', current.inputVersion);
      inflight = null;
    } else if (current.inputVersion) {
      remember('superseded', current.inputVersion);
    }
    context = null;
    current = { ...current, status: 'preparing', inputVersion: null, assessment: null, provenance: null, approval: null, failure: null };
    let prepared;
    try {
      prepared = await prepareContext(raw);
    } catch (error) {
      if (ownRevision === revision) {
        current = {
          ...current,
          status: 'failed',
          inputVersion: null,
          assessment: null,
          provenance: null,
          approval: null,
          failure: { code: 'invalid_input' },
        };
        remember('failed', null);
      }
      throw error;
    }
    if (ownRevision !== revision) return snapshot();
    context = prepared;
    current = { ...current, status: 'draft', inputVersion: prepared.inputFingerprint };
    return snapshot();
  };

  const generate = ({ signal, retry = false } = {}) => {
    if (inflight) return inflight.promise;
    if (!context || current.status === 'empty' || current.status === 'preparing') {
      return Promise.reject(sessionError('input_required', 'Prepared input is required.'));
    }
    if (['failed', 'refused', 'needs_information'].includes(current.status) && retry !== true) {
      return Promise.reject(sessionError('retry_required', 'An explicit retry is required.'));
    }
    if (!['draft', 'failed', 'refused', 'needs_information'].includes(current.status)) {
      return Promise.reject(sessionError('invalid_state', 'Generation is not allowed in the current state.'));
    }
    if (signal?.aborted) return Promise.reject(sessionError('aborted', 'The generation was cancelled.'));

    revision += 1;
    const ownRevision = revision;
    const ownContext = context;
    const controller = new AbortController();
    const relayAbort = () => controller.abort();
    signal?.addEventListener('abort', relayAbort, { once: true });
    let rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = reject; });
    aborted.catch(() => {});
    const rejectOnAbort = () => rejectAbort(sessionError('aborted', 'The generation was cancelled.'));
    controller.signal.addEventListener('abort', rejectOnAbort, { once: true });
    current = { ...current, status: 'generating', assessment: null, provenance: null, approval: null, failure: null };

    const promise = (async () => {
      try {
        // Yield once so inflight is assigned even if a custom provider throws
        // synchronously. This also lets an immediate cancellation skip the call.
        await Promise.resolve();
        if (controller.signal.aborted) throw sessionError('aborted', 'The generation was cancelled.');
        const providerTask = Promise.resolve().then(() => provider.generate(ownContext, { signal: controller.signal }));
        providerTask.catch(() => {});
        const assessment = await Promise.race([providerTask, aborted]);
        validateAssessment(assessment, ownContext);
        if (ownRevision !== revision || context !== ownContext) return snapshot();
        const needsInformation = assessment.quality.status === 'retake' || assessment.missingInformation.length > 0;
        const metadata = provider.metadata && typeof provider.metadata === 'object' ? provider.metadata : {};
        current = {
          ...current,
          status: needsInformation ? 'needs_information' : 'pending_review',
          assessment: structuredClone(assessment),
          provenance: {
            provider: typeof metadata.provider === 'string' ? metadata.provider : 'custom',
            model: typeof metadata.model === 'string' ? metadata.model : 'unspecified',
            simulation: effectiveSimulation,
            catalogVersion: CATALOG_VERSION,
            promptVersion: PROMPT_VERSION,
            schemaVersion: SCHEMA_VERSION,
            inputFingerprint: ownContext.inputFingerprint,
            photoIds: ownContext.photos.map(({ id }) => id),
            protocolVersions: ownContext.protocols.map(({ id, version }) => ({ id, version })),
            generatedAt: now(),
          },
        };
        remember(current.status, current.inputVersion);
        return snapshot();
      } catch (error) {
        if (ownRevision !== revision || context !== ownContext) return snapshot();
        const safeCode = SAFE_GENERATION_CODES.has(error?.code) ? error.code : 'generation_failed';
        const status = safeCode === 'refused' ? 'refused' : 'failed';
        current = { ...current, status, assessment: null, provenance: null, approval: null, failure: { code: safeCode } };
        remember(status, current.inputVersion);
        if (safeCode === error?.code) throw error;
        throw sessionError('generation_failed', 'The generation failed.');
      } finally {
        signal?.removeEventListener('abort', relayAbort);
        controller.signal.removeEventListener('abort', rejectOnAbort);
        if (inflight?.revision === ownRevision) inflight = null;
      }
    })();
    inflight = { promise, controller, revision: ownRevision };
    return promise;
  };

  const approve = async ({ inputVersion, actor, correctedAssessment = null, reviewNotes = null } = {}) => {
    if (effectiveSimulation) throw sessionError('simulation_not_approvable', 'Simulation results cannot be approved.');
    if (current.status !== 'pending_review') throw sessionError('invalid_state', 'Only a pending review can be approved.');
    if (typeof inputVersion !== 'string' || inputVersion !== current.inputVersion) throw sessionError('stale_input', 'The input version is no longer current.');
    if (!actor || typeof actor !== 'object' || typeof actor.id !== 'string' || actor.id.trim() === '') {
      throw sessionError('actor_required', 'A trusted reviewer identity is required.');
    }
    if (reviewNotes !== null && (typeof reviewNotes !== 'string' || reviewNotes.trim() === '' || reviewNotes.length > 2_000)) {
      throw sessionError('invalid_review', 'Review notes are invalid.');
    }
    let actorSnapshot;
    let correctionSnapshot;
    try {
      actorSnapshot = structuredClone(actor);
      correctionSnapshot = correctedAssessment === null ? null : structuredClone(correctedAssessment);
    } catch {
      throw sessionError('invalid_review', 'Review data could not be captured safely.');
    }
    if (correctionSnapshot !== null) validateAssessment(correctionSnapshot, context);
    const notesSnapshot = reviewNotes === null ? null : reviewNotes.trim();
    const approvalRevision = revision;
    const approvalContext = context;
    let authorized = false;
    try {
      authorized = await authorizeReview(actorSnapshot);
    } catch {
      authorized = false;
    }
    if (authorized !== true) throw sessionError('not_authorized', 'The reviewer is not authorized.');
    if (approvalRevision !== revision || approvalContext !== context || current.status !== 'pending_review' || current.inputVersion !== inputVersion) {
      throw sessionError('stale_input', 'The input version is no longer current.');
    }
    const approval = {
      actorId: actorSnapshot.id,
      inputVersion,
      approvedAt: now(),
      reviewNotes: notesSnapshot,
      correctedAssessment: correctionSnapshot,
    };
    current = {
      ...current,
      status: 'approved',
      approval,
    };
    remember('approved', inputVersion, { assessment: current.assessment, provenance: current.provenance, approval });
    return snapshot();
  };

  return Object.freeze({ replaceInput, generate, approve, snapshot });
}
