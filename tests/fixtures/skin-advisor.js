import sharp from 'sharp';

export async function makeInput(overrides = {}) {
  const bytes = await sharp({
    create: {
      width: 12,
      height: 12,
      channels: 3,
      background: { r: 198, g: 158, b: 139 },
    },
  }).png().toBuffer();

  const base = {
    record: { id: 'record-fictional-1', version: 'v7' },
    activation: {
      enabled: true,
      provider: 'openai',
      version: 'activation-v1',
      activatedAt: '2026-09-11T12:00:00.000Z',
    },
    consent: {
      provider: 'openai',
      accepted: true,
      version: 'consent-v2',
      acceptedAt: '2026-09-11T12:01:00.000Z',
      scope: { photoIds: ['photo-fictional-front'] },
    },
    patient: { age: 34, objective: 'Mejorar apariencia de textura' },
    answers: {
      goal: 'Rutina sencilla',
      duration: '',
      symptoms: null,
      routineDay: 'Limpiador y protector solar',
      routineNight: 'Limpiador',
      allergies: null,
      medications: null,
      previousTreatments: null,
      reactions: null,
      sunExposure: 'Ocasional',
      sunscreen: 'Diario',
      declaredReactivity: false,
      changingLesion: false,
      bleedingLesion: false,
      growingLesion: false,
    },
    photos: [{
      id: 'photo-fictional-front',
      recordId: 'record-fictional-1',
      ownershipVerified: true,
      bytes,
      mediaType: 'image/png',
      zone: 'forehead',
      light: 'white',
      capturedAt: '2026-09-11T11:55:00.000Z',
      orientation: 'upright',
      lateralityResolved: true,
    }],
    activeServices: [{ id: 'service-facial', label: 'Cuidado facial' }],
    protocols: [{
      id: 'protocol-calm',
      version: '3',
      status: 'approved',
      serviceId: 'service-facial',
      title: 'Protocolo calmante',
      instructions: ['Aplicación conservadora según valoración profesional.'],
      prerequisites: ['Confirmar tolerancia y contraindicaciones.'],
    }],
  };

  const result = {
    ...base,
    ...overrides,
    record: { ...base.record, ...overrides.record },
    activation: { ...base.activation, ...overrides.activation },
    consent: {
      ...base.consent,
      ...overrides.consent,
      scope: { ...base.consent.scope, ...overrides.consent?.scope },
    },
    patient: { ...base.patient, ...overrides.patient },
    answers: { ...base.answers, ...overrides.answers },
  };
  return result;
}

export function makeAssessment(context) {
  const photo = context.photos[0];
  return {
    quality: {
      status: 'usable',
      limits: [],
      zones: [...new Set(context.photos.map(({ zone }) => zone))].map((zone) => ({
        zone,
        status: 'evaluable',
        limits: [],
      })),
    },
    observations: [{
      areaId: 'A01',
      zone: photo.zone,
      description: 'Perfil visual limitado a la fotografía y respuestas aportadas.',
      evidence: { photoIds: [photo.id], answerKeys: ['goal'] },
      limits: ['No sustituye una valoración profesional presencial.'],
    }],
    priorities: [{
      areaId: 'A01',
      description: 'Mantener una rutina conservadora.',
      evidence: { photoIds: [photo.id], answerKeys: ['goal'] },
    }],
    missingInformation: [],
    followUpQuestions: [],
    careDraft: {
      education: ['Observar tolerancia y suspender ante irritación.'],
      noProcedureAlternative: 'Mantener cuidados básicos mientras se realiza la revisión profesional.',
      options: [{
        serviceId: 'service-facial',
        protocolId: 'protocol-calm',
        protocolVersion: '3',
        rationale: 'Opción sujeta a revisión profesional.',
        prerequisitesToConfirm: ['Confirmar tolerancia y contraindicaciones.'],
        evidence: { photoIds: [photo.id], answerKeys: ['goal'] },
      }],
    },
    professionalReview: { required: true, reasons: ['Revisión humana obligatoria.'] },
    summary: 'Borrador visual para revisión profesional.',
  };
}
