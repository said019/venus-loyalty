import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ANSWER_FIELDS, CATALOG_VERSION, DECLARED_FLAG_FIELDS, ZONES } from './catalog.js';

const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PIXELS_PER_PHOTO = 12_000_000;
const MAX_TOTAL_PIXELS = 24_000_000;
const ALLOWED_MEDIA = new Map([
  ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp'],
]);
const ORIENTATIONS = new Set(['upright', 'rotated_90_cw', 'rotated_90_ccw', 'upside_down', 'unknown']);
const LATERAL_ZONES = new Set(['right_cheek', 'left_cheek', 'right_eye', 'left_eye']);
const preparedContexts = new WeakSet();

export class ContextError extends Error {
  constructor(code, message = 'The skin advisor context is invalid.') {
    super(message);
    this.name = 'SkinAdvisorContextError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new ContextError(code, message); };

const stringValue = (value, name, { max = 1_000, nullable = false } = {}) => {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (nullable) return null;
    fail('invalid_context', `${name} is required.`);
  }
  if (typeof value !== 'string' || value.length > max) fail('invalid_context', `${name} is invalid.`);
  return value.trim();
};

const isoTimestamp = (value, name) => {
  const text = stringValue(value, name, { max: 40 });
  if (!Number.isFinite(Date.parse(text))) fail('invalid_context', `${name} is invalid.`);
  return new Date(text).toISOString();
};

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const snapshotInput = (raw) => ({
  record: raw.record && { id: raw.record.id, version: raw.record.version },
  activation: raw.activation && {
    enabled: raw.activation.enabled,
    provider: raw.activation.provider,
    version: raw.activation.version,
    activatedAt: raw.activation.activatedAt,
  },
  consent: raw.consent && {
    provider: raw.consent.provider,
    accepted: raw.consent.accepted,
    version: raw.consent.version,
    acceptedAt: raw.consent.acceptedAt,
    scope: raw.consent.scope && {
      photoIds: Array.isArray(raw.consent.scope.photoIds) ? [...raw.consent.scope.photoIds] : raw.consent.scope.photoIds,
    },
  },
  patient: raw.patient && { age: raw.patient.age, objective: raw.patient.objective },
  answers: raw.answers && Object.fromEntries(ANSWER_FIELDS.map((key) => [key, raw.answers[key]])),
  photos: Array.isArray(raw.photos) ? raw.photos.map((photo) => ({
    id: photo?.id,
    recordId: photo?.recordId,
    ownershipVerified: photo?.ownershipVerified,
    bytes: Buffer.isBuffer(photo?.bytes) || photo?.bytes instanceof Uint8Array ? Buffer.from(photo.bytes) : photo?.bytes,
    mediaType: photo?.mediaType,
    zone: photo?.zone,
    light: photo?.light,
    capturedAt: photo?.capturedAt,
    orientation: photo?.orientation,
    lateralityResolved: photo?.lateralityResolved,
  })) : raw.photos,
  activeServices: Array.isArray(raw.activeServices) ? raw.activeServices.map((service) => ({
    id: service?.id, label: service?.label,
  })) : raw.activeServices,
  protocols: Array.isArray(raw.protocols) ? raw.protocols.map((protocol) => ({
    id: protocol?.id,
    version: protocol?.version,
    status: protocol?.status,
    serviceId: protocol?.serviceId,
    title: protocol?.title,
    instructions: Array.isArray(protocol?.instructions) ? [...protocol.instructions] : protocol?.instructions,
    prerequisites: Array.isArray(protocol?.prerequisites) ? [...protocol.prerequisites] : protocol?.prerequisites,
  })) : raw.protocols,
});

const normalizeAnswers = (raw = {}) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('invalid_context', 'answers is invalid.');
  return Object.fromEntries(ANSWER_FIELDS.map((key) => {
    const value = raw[key];
    if (DECLARED_FLAG_FIELDS.includes(key)) {
      if (value === undefined || value === null || value === '') return [key, null];
      if (typeof value !== 'boolean') fail('invalid_context', `${key} must be boolean or null.`);
      return [key, value];
    }
    return [key, stringValue(value, key, { nullable: true })];
  }));
};

const normalizePatient = (raw = {}) => {
  const age = raw.age ?? null;
  if (age !== null && (!Number.isInteger(age) || age < 13 || age > 120)) {
    fail('invalid_context', 'age must be a whole number between 13 and 120, or null.');
  }
  return { age, objective: stringValue(raw.objective, 'objective', { nullable: true }) };
};

const normalizeServices = (raw) => {
  if (!Array.isArray(raw) || raw.length > 20) fail('invalid_context', 'activeServices is invalid.');
  const services = raw.map((item, index) => ({
    id: stringValue(item?.id, `activeServices[${index}].id`, { max: 128 }),
    label: stringValue(item?.label, `activeServices[${index}].label`, { max: 200 }),
  }));
  if (new Set(services.map(({ id }) => id)).size !== services.length) fail('invalid_context', 'Duplicate service id.');
  return services;
};

const normalizeProtocols = (raw, serviceIds) => {
  if (!Array.isArray(raw) || raw.length > 50) fail('invalid_context', 'protocols is invalid.');
  const protocols = raw.map((item, index) => {
    const protocol = {
      id: stringValue(item?.id, `protocols[${index}].id`, { max: 128 }),
      version: stringValue(item?.version, `protocols[${index}].version`, { max: 64 }),
      status: item?.status,
      serviceId: stringValue(item?.serviceId, `protocols[${index}].serviceId`, { max: 128 }),
      title: stringValue(item?.title, `protocols[${index}].title`, { max: 200 }),
      instructions: item?.instructions,
      prerequisites: item?.prerequisites,
    };
    if (protocol.status !== 'approved' || !serviceIds.has(protocol.serviceId)) {
      fail('invalid_context', 'Protocols must be approved and belong to an active service.');
    }
    for (const field of ['instructions', 'prerequisites']) {
      if (!Array.isArray(protocol[field]) || protocol[field].length > 12) fail('invalid_context', `Protocol ${field} is invalid.`);
      protocol[field] = protocol[field].map((value) => stringValue(value, `protocol.${field}`, { max: 800 }));
    }
    return protocol;
  });
  const keys = protocols.map(({ id, version }) => `${id}\u0000${version}`);
  if (new Set(keys).size !== keys.length) fail('invalid_context', 'Duplicate protocol version.');
  return protocols;
};

const normalizePhoto = async (raw, recordId, index) => {
  const id = stringValue(raw?.id, `photos[${index}].id`, { max: 128 });
  if (raw?.recordId !== recordId || raw?.ownershipVerified !== true) {
    fail('photo_ownership', 'Photo ownership could not be verified.');
  }
  if (!Buffer.isBuffer(raw?.bytes) && !(raw?.bytes instanceof Uint8Array)) {
    fail('invalid_photo', 'Photo bytes are required.');
  }
  const bytes = Buffer.from(raw.bytes);
  if (bytes.length === 0) fail('invalid_photo', 'Photo bytes are empty.');
  if (bytes.length > MAX_PHOTO_BYTES) fail('photo_too_large', 'Photo exceeds the byte limit.');
  if (!ZONES.includes(raw.zone)) fail('invalid_context', 'Photo zone is invalid.');
  if (raw.light !== 'white') fail('invalid_context', 'Only white-light captures are accepted.');
  if (typeof raw.lateralityResolved !== 'boolean') fail('invalid_context', 'Photo laterality metadata is required.');
  if (LATERAL_ZONES.has(raw.zone) && raw.lateralityResolved !== true) {
    fail('unresolved_laterality', 'Patient-relative laterality must be resolved for a lateral zone.');
  }
  if (raw.zone === 'unknown' && raw.lateralityResolved === true) {
    fail('invalid_context', 'Unknown zone cannot claim resolved laterality.');
  }
  if (!ORIENTATIONS.has(raw.orientation)) fail('invalid_context', 'Photo orientation is invalid.');
  if (raw.orientation === 'unknown' && raw.zone !== 'unknown') {
    fail('unresolved_laterality', 'Unknown orientation requires an unknown zone.');
  }

  let metadata;
  try {
    metadata = await sharp(bytes, { limitInputPixels: MAX_PIXELS_PER_PHOTO, animated: false }).metadata();
  } catch {
    fail('invalid_photo', 'Photo could not be decoded safely.');
  }
  const decodedMediaType = ALLOWED_MEDIA.get(metadata.format);
  if (!decodedMediaType) fail('invalid_photo', 'Photo format is unsupported.');
  if (raw.mediaType !== decodedMediaType) fail('photo_mismatch', 'Declared and decoded photo formats do not match.');
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS_PER_PHOTO || (metadata.pages ?? 1) !== 1) {
    fail('invalid_photo', 'Photo dimensions are invalid.');
  }

  let clean;
  try {
    // The value describes the current source orientation; rotate in the opposite
    // direction to produce an upright derivative.
    const angle = { upright: 0, rotated_90_cw: -90, rotated_90_ccw: 90, upside_down: 180, unknown: 0 }[raw.orientation];
    clean = await sharp(bytes, { limitInputPixels: MAX_PIXELS_PER_PHOTO, animated: false })
      .rotate(angle)
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
  } catch {
    fail('invalid_photo', 'Photo could not be normalized safely.');
  }

  return {
    id,
    mediaType: 'image/jpeg',
    zone: raw.zone,
    light: 'white',
    capturedAt: isoTimestamp(raw.capturedAt, `photos[${index}].capturedAt`),
    sourceOrientation: raw.orientation,
    orientation: raw.orientation === 'unknown' ? 'unknown' : 'upright',
    lateralityResolved: raw.lateralityResolved,
    width: clean.info.width,
    height: clean.info.height,
    dataBase64: clean.data.toString('base64'),
  };
};

export async function prepareContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('invalid_context');
  raw = snapshotInput(raw);
  const record = {
    id: stringValue(raw.record?.id, 'record.id', { max: 128 }),
    version: stringValue(raw.record?.version, 'record.version', { max: 128 }),
  };
  const activation = {
    enabled: raw.activation?.enabled,
    provider: raw.activation?.provider,
    version: stringValue(raw.activation?.version, 'activation.version', { max: 128 }),
    activatedAt: isoTimestamp(raw.activation?.activatedAt, 'activation.activatedAt'),
  };
  if (activation.enabled !== true || !['openai', 'ollama'].includes(activation.provider)) {
    fail('activation_required', 'Explicit OpenAI activation is required.');
  }
  const consent = {
    provider: raw.consent?.provider,
    accepted: raw.consent?.accepted,
    version: stringValue(raw.consent?.version, 'consent.version', { max: 128 }),
    acceptedAt: isoTimestamp(raw.consent?.acceptedAt, 'consent.acceptedAt'),
    photoIds: raw.consent?.scope?.photoIds,
  };
  if (consent.provider !== activation.provider || consent.accepted !== true) {
    fail('consent_required', 'Specific accepted OpenAI processing consent is required.');
  }
  if (!Array.isArray(raw.photos) || raw.photos.length < 1 || raw.photos.length > MAX_PHOTOS) {
    fail('invalid_context', 'One to four photos are required.');
  }
  const photos = await Promise.all(raw.photos.map((photo, index) => normalizePhoto(photo, record.id, index)));
  const photoIds = photos.map(({ id }) => id);
  if (new Set(photoIds).size !== photoIds.length) fail('invalid_context', 'Duplicate photo id.');
  if (!Array.isArray(consent.photoIds) || consent.photoIds.some((id) => typeof id !== 'string')) {
    fail('consent_scope', 'Consent photo scope is invalid.');
  }
  const consentIds = [...new Set(consent.photoIds)].sort();
  if (consentIds.length !== photoIds.length || consentIds.some((id, index) => id !== [...photoIds].sort()[index])) {
    fail('consent_scope', 'Consent must exactly match the selected photos.');
  }
  const totalPixels = photos.reduce((sum, photo) => sum + photo.width * photo.height, 0);
  if (totalPixels > MAX_TOTAL_PIXELS) fail('invalid_photo', 'Combined photo dimensions exceed the limit.');

  const activeServices = normalizeServices(raw.activeServices);
  const protocols = normalizeProtocols(raw.protocols, new Set(activeServices.map(({ id }) => id)));
  const context = {
    kind: 'venus.skin-advisor.prepared',
    catalogVersion: CATALOG_VERSION,
    record,
    activation,
    consent: { ...consent, photoIds: consentIds },
    patient: normalizePatient(raw.patient),
    answers: normalizeAnswers(raw.answers),
    photos,
    activeServices,
    protocols,
  };
  context.inputFingerprint = createHash('sha256').update(JSON.stringify(context)).digest('hex');
  deepFreeze(context);
  preparedContexts.add(context);
  return context;
}

export function assertPreparedContext(context) {
  if (!context || !preparedContexts.has(context)) fail('untrusted_context', 'A trusted prepared context is required.');
  if (context.activation.enabled !== true || !['openai', 'ollama'].includes(context.activation.provider)) fail('activation_required');
  if (context.consent.accepted !== true || context.consent.provider !== context.activation.provider) fail('consent_required');
  return context;
}
