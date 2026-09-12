export const CATALOG_VERSION = 'venus-skin-catalog-v1';

export const AREAS = Object.freeze([
  ['A01', 'Perfil visible de la piel', 'Síntesis de fotografías y respuestas, nunca un hecho aislado de una imagen.', 'No diagnostica ni sustituye la valoración profesional.'],
  ['A02', 'Brillo superficial', 'Apariencia visible de brillo superficial.', 'No estima porcentaje de sebo.'],
  ['A03', 'Resequedad o descamación visible', 'Apariencia visible de resequedad o descamación.', 'No estima porcentaje de hidratación.'],
  ['A04', 'Enrojecimiento y reactividad declarada', 'Enrojecimiento visible junto con reactividad declarada.', 'No diagnostica rosácea ni alergias.'],
  ['A05', 'Brotes visibles', 'Apariencia de brotes visibles.', 'No asigna severidad clínica de acné.'],
  ['A06', 'Posibles obstrucciones', 'Posibles puntos negros u obstrucciones visibles.', 'Puede confundirse con vello o sombras.'],
  ['A07', 'Poros visibles', 'Apariencia de poros visibles.', 'No mide micras ni realiza conteos exactos.'],
  ['A08', 'Tono y manchas visibles', 'Apariencia visible del tono y manchas.', 'No infiere origen hormonal, profundidad, daño UV ni malignidad.'],
  ['A09', 'Textura visible', 'Apariencia visual de la textura.', 'No es una medición calibrada de superficie.'],
  ['A10', 'Marcas o cicatrices aparentes', 'Apariencia de marcas o cicatrices.', 'No determina profundidad.'],
  ['A11', 'Líneas o arrugas visibles', 'Apariencia de líneas o arrugas.', 'No estima colágeno ni edad biológica.'],
  ['A12', 'Área de ojos', 'Apariencia de oscuridad, sombra, inflamación o líneas.', 'No infiere anemia ni calidad de sueño.'],
  ['A13', 'Contorno inferior visible', 'Apariencia visible del contorno inferior.', 'No estima firmeza ni porcentaje de elasticidad.'],
].map(([id, label, scope, limit]) => Object.freeze({ id, label, scope, limit })));

export const ZONES = Object.freeze([
  'forehead', 'nose', 'right_cheek', 'left_cheek', 'chin',
  'right_eye', 'left_eye', 'lower_contour', 'unknown',
]);

export const ANSWER_FIELDS = Object.freeze([
  'goal', 'duration', 'symptoms', 'routineDay', 'routineNight', 'allergies',
  'medications', 'previousTreatments', 'reactions', 'sunExposure', 'sunscreen',
  'declaredReactivity', 'changingLesion', 'bleedingLesion', 'growingLesion',
]);

export const DECLARED_FLAG_FIELDS = Object.freeze([
  'declaredReactivity', 'changingLesion', 'bleedingLesion', 'growingLesion',
]);
