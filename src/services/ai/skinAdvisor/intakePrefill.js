// Pure mapping from a saved IntakeForm to the advisor answer fields.
const clean = (value) => (typeof value === 'string' ? value.trim().slice(0, 500) : '');
const list = (value) => (Array.isArray(value) ? value.map(clean).filter(Boolean).join(', ') : '');

export function prefillFromIntake(intake) {
  if (!intake || typeof intake !== 'object') return {};
  const interest = intake.interestData && typeof intake.interestData === 'object' ? intake.interestData : {};
  const sun = interest.protectorSolar;
  const raw = {
    symptoms: clean(intake.skinCondition),
    duration: clean(intake.conditionSince),
    previousTreatments: clean(intake.previousTreatments),
    reactions: clean(intake.treatmentReactions),
    routineDay: list(intake.routineDay),
    routineNight: list(intake.routineNight),
    allergies: interest.alergias?.value ? clean(interest.alergias.detail) : '',
    medications: interest.medicamentos?.value ? clean(interest.medicamentos.detail) : '',
    sunscreen: sun ? clean(sun.detail) || (sun.value ? 'Sí' : 'No') : '',
  };
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value).map(([key, value]) => [key, value.slice(0, 500)]));
}
