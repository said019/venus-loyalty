// node scripts/test-expediente-pdf.js — genera PDFs de muestra en /tmp para revisión visual
import fs from 'fs';
import { buildIntakePdf, buildConsentPdf, buildDiagnosisPdf } from '../src/services/expedientePdf.js';

const card = { name: 'Clienta De Prueba', phone: '524271234567' };
const intake = {
  status: 'signed', fullName: 'Clienta De Prueba', birthDate: '31-Enero-1995', age: 30,
  phone: '4271234567', profession: 'Enfermera', address: 'Av. Ejemplo 123', socialMedia: '@ejemplo',
  referralSource: 'Instagram',
  interestData: {
    cicloMenstrual: 'R',
    embarazo: { value: false }, lactancia: { value: false },
    alergias: { value: true, detail: 'Asmática, colágeno' },
    vitaminas: { value: true, detail: 'Colágeno' }, medicamentos: { value: false },
    implantes: { value: false }, anticonceptivos: { value: false },
    intervenciones: { value: false }, protectorSolar: { value: true, detail: 'No reaplica' },
  },
  skinCondition: 'Reseca', conditionSince: 'Desde siempre', previousTreatments: 'No',
  treatmentReactions: '',
  questionnaires: { pielSensible: { q1: 'No', q2: 'Maquillaje', q3: 'Sí (entre 12 y 3pm)', q4: 'No' } },
  routineDay: ['Protector solar', 'Crema de día'], routineNight: ['Loreal de noche retinol'],
  photoConsent: true, signedAt: new Date(),
  signatureClient: null, signatureStaff: null,
};
fs.writeFileSync('/tmp/venus-ficha.pdf', await buildIntakePdf(intake, card));
fs.writeFileSync('/tmp/venus-consent.pdf', await buildConsentPdf({ type: 'laser-diodo', signedAt: new Date(), signatureClient: null }, card));
fs.writeFileSync('/tmp/venus-diag.pdf', await buildDiagnosisPdf({ skinType: 'Grasa', alteration: 'Desvitalizada, sensibilizada, obstruida', causes: 'Una incorrecta rutina de cuidado, falta de hidratación', cosmeticTx: 'Limpieza profunda', prognosis: 'Bueno', cost: '$700', createdAt: new Date() }, card));
console.log('✅ PDFs generados en /tmp/venus-*.pdf — ábrelos y revisa el formato');
