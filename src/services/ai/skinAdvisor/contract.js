import { ANSWER_FIELDS, AREAS, ZONES } from './catalog.js';
import { assertPreparedContext } from './context.js';

const text = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
const textArray = (maxItems, maxLength = 500) => ({ type: 'array', maxItems, items: text(maxLength) });
const evidence = {
  type: 'object', additionalProperties: false,
  required: ['photoIds', 'answerKeys'],
  properties: {
    photoIds: { type: 'array', maxItems: 4, items: text(128) },
    answerKeys: { type: 'array', maxItems: ANSWER_FIELDS.length, items: { type: 'string', enum: [...ANSWER_FIELDS] } },
  },
};

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['quality', 'observations', 'priorities', 'missingInformation', 'followUpQuestions', 'careDraft', 'professionalReview', 'summary'],
  properties: {
    quality: {
      type: 'object', additionalProperties: false,
      required: ['status', 'limits', 'zones'],
      properties: {
        status: { type: 'string', enum: ['usable', 'limited', 'retake'] },
        limits: textArray(8),
        zones: {
          type: 'array', maxItems: ZONES.length, items: {
            type: 'object', additionalProperties: false, required: ['zone', 'status', 'limits'],
            properties: {
              zone: { type: 'string', enum: [...ZONES] },
              status: { type: 'string', enum: ['evaluable', 'partial', 'not_evaluable'] },
              limits: textArray(6),
            },
          },
        },
      },
    },
    observations: {
      type: 'array', maxItems: 13, items: {
        type: 'object', additionalProperties: false,
        required: ['areaId', 'zone', 'description', 'evidence', 'limits'],
        properties: {
          areaId: { type: 'string', enum: AREAS.map(({ id }) => id) },
          zone: { type: 'string', enum: [...ZONES] },
          description: text(1_200), evidence, limits: textArray(6),
        },
      },
    },
    priorities: {
      type: 'array', maxItems: 3, items: {
        type: 'object', additionalProperties: false,
        required: ['areaId', 'description', 'evidence'],
        properties: { areaId: { type: 'string', enum: AREAS.map(({ id }) => id) }, description: text(800), evidence },
      },
    },
    missingInformation: textArray(10),
    followUpQuestions: textArray(5),
    careDraft: {
      type: 'object', additionalProperties: false, required: ['education', 'noProcedureAlternative', 'options'],
      properties: {
        education: textArray(8, 800),
        noProcedureAlternative: text(800),
        options: {
          type: 'array', maxItems: 3, items: {
            type: 'object', additionalProperties: false,
            required: ['serviceId', 'protocolId', 'protocolVersion', 'rationale', 'prerequisitesToConfirm', 'evidence'],
            properties: {
              serviceId: text(128), protocolId: text(128), protocolVersion: text(64),
              rationale: text(800), prerequisitesToConfirm: textArray(12, 800), evidence,
            },
          },
        },
      },
    },
    professionalReview: {
      type: 'object', additionalProperties: false, required: ['required', 'reasons'],
      properties: { required: { type: 'boolean' }, reasons: textArray(8, 800) },
    },
    summary: text(1_500),
  },
};

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const OUTPUT_SCHEMA = deepFreeze(schema);

class AssessmentError extends Error {
  constructor(message = 'The generated assessment did not satisfy the local contract.') {
    super(message);
    this.name = 'SkinAdvisorAssessmentError';
    this.code = 'invalid_assessment';
  }
}

const invalid = () => { throw new AssessmentError(); };
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => {
  if (!plainObject(value)) invalid();
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid();
};
const validText = (value, max) => typeof value === 'string' && value.length >= 1 && value.length <= max;
const validTextArray = (value, maxItems, maxLength = 500) => (
  Array.isArray(value) && value.length <= maxItems && value.every((item) => validText(item, maxLength))
);

const validateEvidence = (value, context, zone) => {
  exactKeys(value, ['photoIds', 'answerKeys']);
  if (!Array.isArray(value.photoIds) || value.photoIds.length > 4 || new Set(value.photoIds).size !== value.photoIds.length) invalid();
  if (!Array.isArray(value.answerKeys) || value.answerKeys.length > ANSWER_FIELDS.length || new Set(value.answerKeys).size !== value.answerKeys.length) invalid();
  if (value.photoIds.length + value.answerKeys.length === 0) invalid();
  for (const id of value.photoIds) {
    const photo = context.photos.find((candidate) => candidate.id === id);
    if (!photo) invalid();
    if (zone !== undefined && photo.zone !== zone) {
      if (photo.zone !== 'full_face' || zone === 'unknown') invalid();
      if ((zone.startsWith('left_') || zone.startsWith('right_')) && !photo.lateralityResolved) invalid();
    }
  }
  for (const key of value.answerKeys) {
    if (!ANSWER_FIELDS.includes(key) || context.answers[key] === null) invalid();
  }
};

export function validateAssessment(result, context) {
  assertPreparedContext(context);
  exactKeys(result, ['quality', 'observations', 'priorities', 'missingInformation', 'followUpQuestions', 'careDraft', 'professionalReview', 'summary']);
  exactKeys(result.quality, ['status', 'limits', 'zones']);
  if (!['usable', 'limited', 'retake'].includes(result.quality.status) || !validTextArray(result.quality.limits, 8)) invalid();
  if (!Array.isArray(result.quality.zones) || result.quality.zones.length > ZONES.length) invalid();
  const suppliedZones = [...new Set(context.photos.map(({ zone }) => zone))].sort();
  const assessedZones = [];
  for (const qualityZone of result.quality.zones) {
    exactKeys(qualityZone, ['zone', 'status', 'limits']);
    if (!ZONES.includes(qualityZone.zone) || !['evaluable', 'partial', 'not_evaluable'].includes(qualityZone.status)) invalid();
    if (!validTextArray(qualityZone.limits, 6)) invalid();
    assessedZones.push(qualityZone.zone);
  }
  assessedZones.sort();
  if (new Set(assessedZones).size !== assessedZones.length || suppliedZones.length !== assessedZones.length || suppliedZones.some((zone, index) => zone !== assessedZones[index])) invalid();

  if (!Array.isArray(result.observations) || result.observations.length > 13) invalid();
  for (const observation of result.observations) {
    exactKeys(observation, ['areaId', 'zone', 'description', 'evidence', 'limits']);
    if (!AREAS.some(({ id }) => id === observation.areaId) || !ZONES.includes(observation.zone)) invalid();
    if (!validText(observation.description, 1_200) || !validTextArray(observation.limits, 6)) invalid();
    validateEvidence(observation.evidence, context, observation.zone);
  }

  if (!Array.isArray(result.priorities) || result.priorities.length > 3) invalid();
  for (const priority of result.priorities) {
    exactKeys(priority, ['areaId', 'description', 'evidence']);
    if (!AREAS.some(({ id }) => id === priority.areaId) || !validText(priority.description, 800)) invalid();
    validateEvidence(priority.evidence, context);
  }

  if (!validTextArray(result.missingInformation, 10) || !validTextArray(result.followUpQuestions, 5)) invalid();
  exactKeys(result.careDraft, ['education', 'noProcedureAlternative', 'options']);
  if (!validTextArray(result.careDraft.education, 8, 800) || !validText(result.careDraft.noProcedureAlternative, 800) || !Array.isArray(result.careDraft.options) || result.careDraft.options.length > 3) invalid();
  for (const option of result.careDraft.options) {
    exactKeys(option, ['serviceId', 'protocolId', 'protocolVersion', 'rationale', 'prerequisitesToConfirm', 'evidence']);
    if (!validText(option.rationale, 800) || !validTextArray(option.prerequisitesToConfirm, 12, 800)) invalid();
    const protocol = context.protocols.find((candidate) => (
      candidate.id === option.protocolId && candidate.version === option.protocolVersion &&
      candidate.serviceId === option.serviceId && candidate.status === 'approved'
    ));
    if (!protocol || !context.activeServices.some(({ id }) => id === option.serviceId)) invalid();
    if (option.prerequisitesToConfirm.some((item) => !protocol.prerequisites.includes(item))) invalid();
    validateEvidence(option.evidence, context);
  }

  exactKeys(result.professionalReview, ['required', 'reasons']);
  if (typeof result.professionalReview.required !== 'boolean' || !validTextArray(result.professionalReview.reasons, 8, 800)) invalid();
  if (result.professionalReview.required !== true || result.professionalReview.reasons.length === 0) invalid();
  if (!validText(result.summary, 1_500)) invalid();

  const lesionFlag = ['changingLesion', 'bleedingLesion', 'growingLesion'].some((key) => context.answers[key] === true);
  if (lesionFlag && result.careDraft.options.length !== 0) invalid();
  return true;
}
