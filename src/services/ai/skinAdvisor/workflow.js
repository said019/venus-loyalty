import { randomUUID } from 'node:crypto';
import { prepareContext } from './context.js';
import { validateAssessment } from './contract.js';
import { ANSWER_FIELDS, DECLARED_FLAG_FIELDS, ZONES, CATALOG_VERSION } from './catalog.js';
import { PROMPT_VERSION } from './prompt.js';
import { normalizeApprovalExtras } from './approvalExtras.js';
import { prefillFromIntake } from './intakePrefill.js';
import { SKIN_MENU_CATEGORIES } from '../skinMenu.js';
import { createVisualPreview, VISUAL_MODES } from '../../skinVisualPreview.js';

export class SkinWorkflowError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new SkinWorkflowError(code, status); };
const idValid = (v) => typeof v === 'string' && v.length > 0 && v.length <= 128 && v === v.trim();
const iso = (v) => new Date(v).toISOString();
const validCaptureTime = (value, latest) => {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!parts) return false;
  const [year, month, day] = parts.slice(1, 4).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] && Number.isFinite(Date.parse(value)) && Date.parse(value) <= latest;
};
const active = ['draft', 'generating', 'pending_review', 'needs_information', 'approved'];
const safeCodes = new Set(['timeout', 'refused', 'network', 'provider_http', 'invalid_assessment', 'invalid_photo', 'photo_too_large', 'photo_mismatch', 'unresolved_laterality']);
const publicRow = (row) => {
  const { attemptToken, leaseUntil, ...safe } = row;
  if (safe.retiredAt) safe.retiredAt = new Date(safe.retiredAt).toISOString();
  return safe;
};

export function createSkinAdvisorWorkflow({ prisma, provider, loadPhoto, layersEngine, layerStore, clientReport, config = {}, clock = () => new Date() }) {
  const now = () => new Date(clock());
  const previewActors = new Set();
  const pipelineTimeoutMs = config.pipelineTimeoutMs ?? 90_000;
  if (!Number.isInteger(pipelineTimeoutMs) || pipelineTimeoutMs < 1 || pipelineTimeoutMs > 90_000) throw new TypeError('pipelineTimeoutMs must be between 1 and 90000.');
  const checkSignal = signal => { if (signal?.aborted) fail('timeout', 504); };
  const tx = (fn) => prisma.$transaction(fn, { isolationLevel: 'Serializable' }).catch((error) => {
    if (error?.code === 'P2034') fail('stale_version', 409);
    throw error;
  });
  async function account(db, actorId, permission) {
    if (!idValid(actorId)) fail('unauthenticated', 401);
    const user = await db.admin.findUnique({ where: { id: actorId } });
    if (!user || !['admin', 'staff', 'recepcion'].includes(user.role)) fail('unauthenticated', 401);
    if (permission === 'approve' && !['admin', 'staff'].includes(user.role)) fail('not_authorized', 403);
    if (permission === 'owner' && (actorId !== config.approverId || user.role !== 'admin')) fail('not_authorized', 403);
    return user;
  }
  const loadServices = (db) => db.service.findMany({ where: { isActive: true, category: { in: SKIN_MENU_CATEGORIES } }, select: { id: true, name: true, price: true, durationMinutes: true, category: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  async function record(db, recordId) {
    if (!idValid(recordId)) fail('invalid_input');
    const row = await db.clientRecord.findUnique({ where: { id: recordId } });
    if (!row) fail('not_found', 404);
    return row;
  }
  async function assessment(db, id) {
    if (!idValid(id)) fail('invalid_input');
    const row = await db.skinAdvisorAssessment.findUnique({ where: { id } });
    if (!row) fail('not_found', 404);
    return row;
  }
  const checkVersion = (row, version, status) => {
    if (!Number.isInteger(version) || version < 1) fail('invalid_version');
    if (row.version !== version || (status && row.status !== status)) fail('stale_version', 409);
  };
  async function expire(db) {
    await db.skinAdvisorAssessment.updateMany({ where: { status: 'generating', leaseUntil: { lte: now() } }, data: { status: 'failed', failureCode: 'timeout', attemptToken: null, leaseUntil: null, version: { increment: 1 } } });
  }
  async function contextFor(row, signal) {
    checkSignal(signal);
    const current = await record(prisma, row.recordId);
    if (iso(current.updatedAt) !== row.input.record.version) fail('stale_input', 409);
    const photos = await prisma.clientPhoto.findMany({ where: { recordId: row.recordId, id: { in: row.input.photos.map(p => p.id) } } });
    if (photos.length !== row.input.photos.length) fail('stale_input', 409);
    const loaded = [];
    for (const selected of row.input.photos) {
      checkSignal(signal);
      const photo = photos.find(p => p.id === selected.id);
      if (!photo || photo.url !== selected.sourceUrl || iso(photo.takenAt) !== selected.sourceTakenAt) fail('stale_input', 409);
      const media = await loadPhoto(photo, { signal });
      checkSignal(signal);
      loaded.push({ ...selected, ...media, recordId: row.recordId, ownershipVerified: true, light: 'white' });
    }
    return prepareContext({ ...row.input, record: { id: current.id, version: iso(current.updatedAt) }, photos: loaded });
  }
  function draftInput(body, photos, current) {
    if (!body || body.consentAccepted !== true || body.consentVersion !== config.consentVersion || !config.consentVersion) fail('consent_required');
    if (body.whiteLightOriginalConfirmed !== true) fail('white_light_confirmation_required');
    const patient = { age: body.patient?.age ?? null, objective: body.patient?.objective ?? null };
    if (patient.age !== null && (!Number.isInteger(patient.age) || patient.age < 13 || patient.age > 120)) fail('invalid_input');
    if (patient.objective !== null && (typeof patient.objective !== 'string' || patient.objective.length > 1000)) fail('invalid_input');
    if (body.answers !== undefined && (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers))) fail('invalid_input');
    const answers = Object.fromEntries(ANSWER_FIELDS.map(key => {
      const value = body.answers?.[key] ?? null;
      if (value !== null && (DECLARED_FLAG_FIELDS.includes(key) ? typeof value !== 'boolean' : typeof value !== 'string' || value.length > 1000)) fail('invalid_input');
      return [key, value];
    }));
    const selected = body.photos.map(p => {
      if (!ZONES.includes(p.zone) || !['upright', 'rotated_90_cw', 'rotated_90_ccw', 'upside_down', 'unknown'].includes(p.orientation) || typeof p.lateralityResolved !== 'boolean') fail('invalid_input');
      if ((p.zone.startsWith('right_') || p.zone.startsWith('left_')) && !p.lateralityResolved) fail('unresolved_laterality');
      if ((p.orientation === 'unknown' && p.zone !== 'unknown') || (p.zone === 'unknown' && p.lateralityResolved)) fail('unresolved_laterality');
      const photo = photos.find(item => item.id === p.id);
      if (!photo) fail('photo_ownership');
      const captureMode = /(?:^|\|)\s*modo=([a-z_]+)/.exec(photo.description || '');
      if (captureMode && captureMode[1] !== 'image') fail('invalid_photo');
      if (p.capturedAtConfirmed !== true || !validCaptureTime(p.capturedAt, now().getTime())) fail('capture_time_confirmation_required');
      return { id: photo.id, zone: p.zone, orientation: p.orientation, lateralityResolved: p.lateralityResolved, capturedAt: iso(p.capturedAt), capturedAtConfirmed: true, sourceTakenAt: iso(photo.takenAt), sourceUrl: photo.url };
    });
    return { record: { id: current.id, version: iso(current.updatedAt) }, patient, answers, photos: selected, whiteLightOriginalConfirmed: true,
      activation: { enabled: config.enabled === true, provider: config.provider || 'openai', version: config.activationVersion || 'venus-skin-activation-v1', activatedAt: iso(config.activatedAt || now()) },
      consent: { accepted: true, provider: config.provider || 'openai', version: config.consentVersion, acceptedAt: now().toISOString(), scope: { photoIds: selected.map(p => p.id) } },
      activeServices: structuredClone(config.activeServices || []), protocols: structuredClone(config.protocols || []) };
  }
  const layersEnabled = () => layersEngine?.enabled === true && typeof layerStore?.save === 'function' && typeof layerStore?.remove === 'function';
  async function whitePhoto(recordId, photoId) {
    if (!idValid(photoId)) fail('invalid_input');
    const photos = await prisma.clientPhoto.findMany({ where: { recordId, id: { in: [photoId] } } });
    const photo = photos.find(p => p.id === photoId);
    if (!photo) fail('photo_ownership', 404);
    if (!/(?:^|\|)\s*modo=image\s*(?:\||$)/.test(photo.description || '')) fail('invalid_photo');
    return photo;
  }
  // Storage identifiers stay server-side; the browser only receives image URLs.
  const publicLayerSet = (row, photo) => ({ id: row.id, createdAt: iso(row.createdAt), method: row.method, validated: false, notice: row.notice,
    sourcePhotoId: photo.id, sourceUrl: photo.url, images: row.images.map(({ key, url, candidateCount }) => ({ key, url, candidateCount })) });
  const storedUrl = (value) => {
    try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' && !u.port && !u.username && !u.password; }
    catch { return false; }
  };
  async function storeLayers(actorId, recordId, photo, result) {
    const images = [];
    try {
      for (const image of result.images) {
        const stored = await layerStore.save(image.bytes, { recordId, key: image.key });
        if (stored?.publicId) images.push({ key: image.key, url: stored.url, publicId: stored.publicId, candidateCount: image.candidateCount ?? null });
        if (!storedUrl(stored?.url) || typeof stored.publicId !== 'string' || !stored.publicId) throw new Error('invalid_stored_layer');
      }
      return await prisma.skinLayerSet.create({ data: { recordId, sourcePhotoId: photo.id, method: result.method, notice: result.notice, images, createdById: actorId } });
    } catch {
      await Promise.allSettled(images.map(image => layerStore.remove(image.publicId)));
      fail('layers_storage_unavailable', 503);
    }
  }
  return Object.freeze({
    async photoLayers(actorId, recordId, photoId) {
      await account(prisma, actorId);
      await record(prisma, recordId);
      if (!layersEnabled()) fail('layers_disabled', 503);
      const photo = await whitePhoto(recordId, photoId);
      let result;
      try {
        const media = await loadPhoto(photo);
        result = await layersEngine.generate(media.bytes);
      } catch (error) {
        if (error.code === 'layers_busy') fail('layers_busy', 429);
        if (error.code === 'layers_timeout') fail('layers_timeout', 504);
        fail('layers_unavailable', 422);
      }
      return publicLayerSet(await storeLayers(actorId, recordId, photo, result), photo);
    },
    async savedLayers(actorId, recordId, photoId) {
      await account(prisma, actorId);
      await record(prisma, recordId);
      const photo = await whitePhoto(recordId, photoId);
      const row = await prisma.skinLayerSet.findFirst({ where: { recordId, sourcePhotoId: photo.id }, orderBy: { createdAt: 'desc' } });
      return row ? publicLayerSet(row, photo) : null;
    },
    async previewPhoto(actorId, recordId, photoId, body = {}) {
      await account(prisma, actorId);
      await record(prisma, recordId);
      if (!idValid(photoId) || !VISUAL_MODES.includes(body.mode)) fail('invalid_input');
      if (previewActors.has(actorId) || previewActors.size >= 2) fail('preview_busy', 429);
      previewActors.add(actorId);
      try {
        const photos = await prisma.clientPhoto.findMany({ where: { recordId, id: { in: [photoId] } } });
        const photo = photos.find(p => p.id === photoId);
        if (!photo) fail('photo_ownership', 404);
        const mode = /(?:^|\|)\s*modo=([a-z_]+)/.exec(photo.description || '');
        if (!mode || !['image', 'image_negative'].includes(mode[1])) fail('preview_mode_unavailable');
        const media = await loadPhoto(photo);
        const result = await createVisualPreview(media.bytes, body.mode);
        return { ...result, sourcePhotoId: photo.id, sourceUrl: photo.url };
      } catch (error) {
        if (error instanceof SkinWorkflowError) throw error;
        fail('preview_unavailable', 422);
      } finally { previewActors.delete(actorId); }
    },
    async getConfig(actorId) {
      const user = await account(prisma, actorId);
      return { enabled: config.enabled === true, configured: config.configured === true, layersEnabled: layersEnabled(), sequenceEnabled: config.sequenceEnabled === true, simulation: provider.metadata?.simulation === true, canApprove: ['admin', 'staff'].includes(user.role), isOwner: user.role === 'admin' && user.id === config.approverId, consentVersion: config.consentVersion, consentText: config.consentText, userId: user.id };
    },
    async getRecord(actorId, recordId) {
      await account(prisma, actorId);
      const current = await record(prisma, recordId);
      await expire(prisma);
      const photos = await prisma.clientPhoto.findMany({ where: { recordId }, orderBy: { takenAt: 'desc' } });
      const rows = await prisma.skinAdvisorAssessment.findMany({ where: { recordId }, orderBy: { createdAt: 'desc' }, take: 50 });
      const intake = await prisma.intakeForm.findUnique({ where: { recordId } });
      return { prefill: prefillFromIntake(intake), record: { id: current.id, age: current.age, objectives: current.objectives }, photos: photos.map(({ id, url, takenAt, area, description }) => ({ id, url, takenAt, area, description })), assessments: rows.map(publicRow) };
    },
    async clientView(actorId, id) {
      await account(prisma, actorId);
      const row = await assessment(prisma, id);
      const current = await record(prisma, row.recordId);
      const view = current.cardId && clientReport ? await clientReport.getForCard(current.cardId, id) : null;
      if (!view) fail('not_found', 404);
      return view;
    },
    async createDraft(actorId, recordId, body) {
      return tx(async db => {
        await account(db, actorId);
        const current = await record(db, recordId);
        await expire(db);
        if (await db.skinAdvisorAssessment.count({ where: { recordId, status: 'generating' } })) fail('already_generating', 409);
        if (!Array.isArray(body?.photos) || body.photos.length < 1 || body.photos.length > 4 || body.photos.some(p => !idValid(p?.id)) || new Set(body.photos.map(p => p.id)).size !== body.photos.length) fail('invalid_input');
        const photos = await db.clientPhoto.findMany({ where: { recordId, id: { in: body.photos.map(p => p.id) } } });
        const input = draftInput(body, photos, current);
        await db.skinAdvisorAssessment.updateMany({ where: { recordId, status: { in: active } }, data: { status: 'superseded', version: { increment: 1 }, attemptToken: null, leaseUntil: null } });
        return publicRow(await db.skinAdvisorAssessment.create({ data: { recordId, input, createdById: actorId } }));
      });
    },
    async getAssessment(actorId, id) {
      await account(prisma, actorId);
      await expire(prisma);
      return publicRow(await assessment(prisma, id));
    },
    async generate(actorId, id, { version } = {}) {
      const token = randomUUID();
      const row = await tx(async db => {
        await account(db, actorId);
        if (config.enabled !== true || config.configured !== true) fail('disabled', 503);
        await expire(db);
        const current = await assessment(db, id);
        checkVersion(current, version, 'draft');
        if (current.input.activation.enabled !== true) fail('activation_required', 409);
        if (current.input.consent.provider !== (config.provider || 'openai') || current.input.consent.version !== config.consentVersion) fail('consent_required', 409);
        if (await db.skinAdvisorAssessment.count({ where: { status: 'generating', generatedById: actorId } })) fail('already_generating', 409);
        const claim = await db.skinAdvisorAssessment.updateMany({ where: { id, version, status: 'draft' }, data: { status: 'generating', generatedById: actorId, attemptToken: token, leaseUntil: new Date(now().getTime() + 120_000) } });
        if (claim.count !== 1) fail('stale_version', 409);
        return current;
      });
      const controller = new AbortController();
      let timer;
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new SkinWorkflowError('timeout', 504)); }, pipelineTimeoutMs);
      });
      const pipeline = async () => {
        const context = await contextFor(row, controller.signal);
        checkSignal(controller.signal);
        const output = await provider.generate(context, { signal: controller.signal });
        checkSignal(controller.signal);
        validateAssessment(output, context);
        const metadata = provider.metadata || {};
        return await tx(async db => {
          await account(db, actorId);
          const latestRecord = await record(db, row.recordId);
          const latestPhotos = await db.clientPhoto.findMany({ where: { recordId: row.recordId, id: { in: row.input.photos.map(p => p.id) } } });
          if (iso(latestRecord.updatedAt) !== context.record.version || latestPhotos.length !== row.input.photos.length || row.input.photos.some(p => !latestPhotos.some(q => q.id === p.id && q.url === p.sourceUrl && iso(q.takenAt) === p.sourceTakenAt))) fail('stale_input', 409);
          checkSignal(controller.signal);
          const saved = await db.skinAdvisorAssessment.updateMany({ where: { id, version, status: 'generating', attemptToken: token, leaseUntil: { gt: now() } }, data: {
            status: output.quality.status === 'retake' ? 'needs_information' : 'pending_review', assessment: structuredClone(output),
            provenance: { provider: metadata.provider || 'custom', model: metadata.model || 'unspecified', simulation: metadata.simulation === true, inputFingerprint: context.inputFingerprint, photoIds: context.photos.map(p => p.id), generatedAt: now().toISOString(), catalogVersion: CATALOG_VERSION, promptVersion: PROMPT_VERSION, schemaVersion: 'venus-skin-assessment-v1' },
            attemptToken: null, leaseUntil: null, version: { increment: 1 } } });
          if (saved.count !== 1) fail('stale_version', 409);
          const result = publicRow(await assessment(db, id));
          checkSignal(controller.signal);
          return result;
        });
      };
      try {
        return await Promise.race([pipeline(), deadline]);
      } catch (error) {
        const failureCode = safeCodes.has(error?.code) ? error.code : 'generation_failed';
        await prisma.skinAdvisorAssessment.updateMany({ where: { id, version, status: 'generating', attemptToken: token }, data: { status: 'failed', failureCode, attemptToken: null, leaseUntil: null, version: { increment: 1 } } });
        if (error instanceof SkinWorkflowError) throw error;
        fail(failureCode, 502);
      } finally {
        clearTimeout(timer);
      }
    },
    async services(actorId) {
      await account(prisma, actorId);
      return (await loadServices(prisma)).map(({ id, name, price, durationMinutes, category }) => ({ id, name, price: Number(price), durationMinutes, category }));
    },
    async approve(actorId, id, { version, correctedAssessment = null, reviewNotes = null, plan, homeRoutine, nextVisitWeek, zoneProgress } = {}) {
      const correction = correctedAssessment === null ? null : structuredClone(correctedAssessment);
      await account(prisma, actorId, 'approve');
      const row = await assessment(prisma, id);
      checkVersion(row, version, 'pending_review');
      if (row.provenance?.simulation || provider.metadata?.simulation) fail('simulation_not_approvable', 403);
      if (reviewNotes !== null && (typeof reviewNotes !== 'string' || reviewNotes.length > 2000)) fail('invalid_review');
      const context = await contextFor(row);
      if (context.inputFingerprint !== row.provenance?.inputFingerprint) fail('stale_input', 409);
      try { validateAssessment(correction || row.assessment, context); } catch { fail('invalid_assessment'); }
      if ((correction || row.assessment).quality.status === 'retake') fail('needs_information', 409);
      const zones = [...new Set([...row.input.photos.map(p => p.zone), ...(correction || row.assessment).observations.map(o => o.zone)])];
      const catalogue = await loadServices(prisma);
      let extras;
      try { extras = normalizeApprovalExtras({ plan, homeRoutine, nextVisitWeek, zoneProgress }, { services: catalogue, zones }); } catch { fail('invalid_review'); }
      return tx(async db => {
        await account(db, actorId, 'approve');
        const current = await assessment(db, id);
        checkVersion(current, version, 'pending_review');
        const currentRecord = await record(db, row.recordId);
        if (iso(currentRecord.updatedAt) !== context.record.version) fail('stale_input', 409);
        const photos = await db.clientPhoto.findMany({ where: { recordId: row.recordId, id: { in: row.input.photos.map(p => p.id) } } });
        if (photos.length !== row.input.photos.length || row.input.photos.some(p => !photos.some(q => q.id === p.id && q.url === p.sourceUrl && iso(q.takenAt) === p.sourceTakenAt))) fail('stale_input', 409);
        const changed = await db.skinAdvisorAssessment.updateMany({ where: { id, version, status: 'pending_review' }, data: { status: 'approved', version: { increment: 1 }, approval: { actorId, approvedAt: now().toISOString(), inputFingerprint: context.inputFingerprint, correctedAssessment: correction, reviewNotes, ...extras } } });
        if (changed.count !== 1) fail('stale_version', 409);
        return publicRow(await assessment(db, id));
      });
    },
    async retire(actorId, id, { version } = {}) {
      await account(prisma, actorId, 'owner');
      const row = await assessment(prisma, id);
      if (!row.approval) fail('not_approved', 409);
      if (row.retiredAt) fail('already_retired', 409);
      if (!Number.isInteger(version) || version !== row.version) fail('stale_version', 409);
      return tx(async db => {
        await account(db, actorId, 'owner');
        const changed = await db.skinAdvisorAssessment.updateMany({ where: { id, version }, data: { retiredAt: now(), retiredById: actorId, version: { increment: 1 } } });
        if (changed.count !== 1) fail('stale_version', 409);
        return publicRow(await assessment(db, id));
      });
    },
  });
}
