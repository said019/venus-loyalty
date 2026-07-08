// src/services/expedientePdf.js
// Genera los PDFs del expediente con branding Venus (pdf-lib).
// Paleta: verde salvia #A8BFA0 (headers), tinta #243026, crema #FBF7EF.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getConsentText } from './consentTexts.js';

const SAGE = rgb(0.66, 0.75, 0.63);
const INK = rgb(0.14, 0.19, 0.15);
const MUTED = rgb(0.35, 0.40, 0.36);
const CREAM = rgb(0.984, 0.969, 0.937);

const A4 = [595.28, 841.89];
const MARGIN = 48;

// ---------- helpers ----------
function wrap(text, font, size, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const trial = line ? line + ' ' + w : w;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && line) { lines.push(line); line = w; }
    else line = trial;
  }
  if (line) lines.push(line);
  return lines;
}

class Doc {
  constructor(pdf, fonts) { this.pdf = pdf; this.fonts = fonts; this.page = null; this.y = 0; this.newPage(); }
  newPage() { this.page = this.pdf.addPage(A4); this.y = A4[1] - MARGIN; this.page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: CREAM }); }
  ensure(h) { if (this.y - h < MARGIN) this.newPage(); }
  title(text) {
    this.ensure(40);
    this.page.drawText(text, { x: MARGIN, y: this.y - 24, size: 22, font: this.fonts.serif, color: INK });
    this.y -= 40;
  }
  sectionHeader(text) {
    this.ensure(30);
    this.page.drawRectangle({ x: MARGIN, y: this.y - 20, width: A4[0] - MARGIN * 2, height: 20, color: SAGE });
    this.page.drawText(text.toUpperCase(), { x: MARGIN + 8, y: this.y - 14, size: 10, font: this.fonts.bold, color: rgb(1, 1, 1) });
    this.y -= 30;
  }
  field(label, value) {
    const text = `${label}: ${value ?? '—'}`;
    for (const line of wrap(text, this.fonts.sans, 10, A4[0] - MARGIN * 2)) {
      this.ensure(14);
      this.page.drawText(line, { x: MARGIN, y: this.y - 10, size: 10, font: this.fonts.sans, color: INK });
      this.y -= 14;
    }
    this.y -= 2;
  }
  paragraph(text, size = 9) {
    for (const raw of String(text || '').split('\n')) {
      for (const line of wrap(raw, this.fonts.sans, size, A4[0] - MARGIN * 2)) {
        this.ensure(size + 4);
        this.page.drawText(line, { x: MARGIN, y: this.y - size, size, font: this.fonts.sans, color: MUTED });
        this.y -= size + 3;
      }
      this.y -= 3;
    }
  }
  async signature(label, dataUrl, signedAt) {
    this.ensure(90);
    if (dataUrl?.startsWith('data:image/png;base64,')) {
      const png = await this.pdf.embedPng(Buffer.from(dataUrl.split(',')[1], 'base64'));
      const dims = png.scaleToFit(180, 60);
      this.page.drawImage(png, { x: MARGIN, y: this.y - 65, width: dims.width, height: dims.height });
    }
    this.page.drawLine({ start: { x: MARGIN, y: this.y - 70 }, end: { x: MARGIN + 200, y: this.y - 70 }, thickness: 0.8, color: INK });
    const when = signedAt ? new Date(signedAt).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' }) : '';
    this.page.drawText(`${label}${when ? ' — ' + when : ''}`, { x: MARGIN, y: this.y - 82, size: 8, font: this.fonts.sans, color: MUTED });
    this.y -= 95;
  }
}

async function newDoc() {
  const pdf = await PDFDocument.create();
  const fonts = {
    serif: await pdf.embedFont(StandardFonts.TimesRomanBold),
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  return new Doc(pdf, fonts);
}

const YESNO = (e) => (e == null ? '—' : e.value ? `Sí${e.detail ? ` (${e.detail})` : ''}` : 'No');

const INTEREST_LABELS = {
  cicloMenstrual: 'Ciclo menstrual', embarazo: 'Embarazo', lactancia: 'Lactancia',
  alergias: 'Alergias', vitaminas: 'Vitaminas / Suplementos', medicamentos: 'Medicamentos',
  implantes: 'Implantes o dispositivos', anticonceptivos: 'Anticonceptivos',
  intervenciones: 'Intervenciones estéticas o quirúrgicas', protectorSolar: 'Protector solar',
};

const QUESTIONNAIRE_TITLES = {
  acne: 'Acné', cicatrices: 'Cicatrices atróficas', pigmentaciones: 'Pigmentaciones',
  envejecimiento: 'Envejecimiento', ojerasInflamadas: 'Ojeras inflamadas',
  ojerasPigmentadas: 'Ojeras pigmentadas', pielSensible: 'Piel sensible',
};

// Preguntas oficiales (transcritas del formato): clave = id de condición, valor = array en orden q1..qN
export const QUESTIONNAIRES = {
  acne: [
    '¿Cómo es tu ingesta de lácteos, embutidos, azúcares y/o comida chatarra?',
    '¿Utilizas base de maquillaje todos los días?',
    '¿Con qué frecuencia lavas tus brochas?',
    '¿Compartes tu maquillaje con amigos o familiares?',
    '¿Con qué te desmaquillas el rostro?',
    '¿Con qué frecuencia cambias las fundas de tus almohadas?',
    '¿Cómo es tu nivel de estrés?',
    '¿Tiendes a manipular, pellizcar o rascar las lesiones del acné?',
  ],
  cicatrices: [
    '¿Padeciste acné en alguna etapa de tu vida? ¿Cuánto tiempo?',
    '¿Presentaban inflamación o lesiones muy grandes?',
    '¿Cómo trataste tu acné?',
    '¿Manipulabas, pellizcabas o rascabas tus lesiones?',
  ],
  pigmentaciones: [
    '¿Cuánto tiempo llevas con la pigmentación en tu piel?',
    '¿Te expones mucho tiempo al sol?',
    'Describe el ambiente climático en el que te encuentras en tu trabajo',
    '¿Pasas mucho tiempo frente a la radiación de luz azul?',
    '¿Tomas o has tomado medicamentos que puedan sensibilizar tu piel?',
  ],
  envejecimiento: [
    '¿Cuánto tiempo tienes usando protector solar?',
    '¿A partir de qué edad empezaste a cuidar tu piel?',
    '¿En qué posición duermes?',
    '¿Fumas?',
    '¿Te expones mucho al sol? ¿Cuánto?',
  ],
  ojerasInflamadas: [
    '¿Ingieres alimentos muy condimentados y con mucha sal?',
    '¿Cómo es la calidad de tu sueño al dormir?',
    '¿Tu familia tiene o presenta inflamación en el contorno de ojos?',
  ],
  ojerasPigmentadas: [
    '¿Cómo es tu técnica de desmaquillado?',
    '¿Frotas constantemente tus ojos?',
    '¿Cuántas horas estás durmiendo por las noches? ¿Y a qué hora te duermes?',
    '¿Tu familia tiene o presenta pigmentación en las ojeras?',
    '¿Presentas alguna alergia que afecte tus ojos?',
  ],
  pielSensible: [
    '¿Recientemente te has realizado algún tratamiento invasivo? ¿Cuál?',
    '¿Tu piel no tolera muy bien todos los productos para la piel?',
    '¿Normalmente tu piel tiene una temperatura alta?',
    '¿En tu familia hay enfermedades o condiciones de la piel como piel sensible, reactiva, con cáncer de piel o rosácea?',
  ],
};

export async function buildIntakePdf(intake, card) {
  const d = await newDoc();
  d.title('FICHA CLÍNICA — VENUS');
  d.sectionHeader('Datos personales');
  d.field('Nombre completo', intake.fullName || card.name);
  d.field('Fecha de nacimiento', intake.birthDate);
  d.field('Edad', intake.age);
  d.field('Teléfono', intake.phone || card.phone);
  d.field('Profesión', intake.profession);
  d.field('Dirección', intake.address);
  d.field('Redes sociales', intake.socialMedia);
  d.field('Medio por el cual se enteró de nosotros', intake.referralSource);

  d.sectionHeader('Datos de interés');
  const i = intake.interestData || {};
  d.field('Ciclo menstrual (R / IR / NP)', i.cicloMenstrual);
  for (const k of ['embarazo','lactancia','alergias','vitaminas','medicamentos','implantes','anticonceptivos','intervenciones','protectorSolar']) {
    d.field(INTEREST_LABELS[k], YESNO(i[k]));
  }

  d.sectionHeader('Condiciones, padecimientos y enfermedades de la piel');
  d.field('Condición de la piel que se busca mejorar', intake.skinCondition);
  d.field('Desde cuándo se padece la condición', intake.conditionSince);
  d.field('Tratamientos realizados anteriormente', intake.previousTreatments);
  d.field('Reacciones positivas o negativas después del tratamiento', intake.treatmentReactions);

  const qs = intake.questionnaires || {};
  for (const [key, answers] of Object.entries(qs)) {
    if (!answers || !QUESTIONNAIRES[key]) continue;
    d.sectionHeader(QUESTIONNAIRE_TITLES[key] || key);
    QUESTIONNAIRES[key].forEach((question, idx) => {
      d.field(`${idx + 1}. ${question}`, answers[`q${idx + 1}`]);
    });
  }

  d.sectionHeader('Rutina skincare');
  d.field('Día', (intake.routineDay || []).join(' · ') || '—');
  d.field('Noche', (intake.routineNight || []).join(' · ') || '—');

  d.sectionHeader('Autorización de fotografías');
  d.paragraph('DECLARO QUE TODA LA INFORMACIÓN DADA ANTERIORMENTE ES VERÍDICA. Y AUTORIZO QUE CONSULTORIO COSMETOLÓGICO VENUS TOME FOTOGRAFÍAS CONFIDENCIALES DE MI PROCEDIMIENTO ESTÉTICO CON EL ÚNICO FIN DE OBSERVAR LOS RESULTADOS Y EL AVANCE DE MI TRATAMIENTO. En caso de que CONSULTORIO COSMETOLÓGICO VENUS tenga la intención de publicar las fotos como evidencia de un buen resultado, tendrá la obligación de pedirle autorización previa al paciente para dicha publicación; en caso de ser así se mantendrá en todo momento la confidencialidad del paciente.');
  d.field('Autorización', intake.photoConsent === true ? 'SÍ AUTORIZO' : intake.photoConsent === false ? 'NO AUTORIZO' : '—');

  await d.signature('Firma del paciente', intake.signatureClient, intake.signedAt);
  if (intake.signatureStaff) await d.signature('Firma cosmetóloga', intake.signatureStaff, intake.signedAt);
  return Buffer.from(await d.pdf.save());
}

export async function buildConsentPdf(consent, card) {
  const d = await newDoc();
  const text = getConsentText(consent.type || 'laser-diodo');
  d.title('CONSENTIMIENTO INFORMADO — VENUS');
  d.field('Paciente', card.name);
  d.field('Teléfono', card.phone);
  d.field('Documento', text.title);
  d.field('Versión del texto', consent.textVersion || text.version);
  for (const s of text.sections) {
    if (s.heading) d.sectionHeader(s.heading);
    d.paragraph(s.body);
  }
  await d.signature('Firma del paciente', consent.signatureClient, consent.signedAt);
  return Buffer.from(await d.pdf.save());
}

export async function buildDiagnosisPdf(diag, card) {
  const d = await newDoc();
  d.title('DIAGNÓSTICO FACIAL — VENUS');
  d.sectionHeader('Paciente');
  d.field('Nombre', card.name);
  d.field('Fecha', diag.createdAt ? new Date(diag.createdAt).toLocaleDateString('es-MX', { dateStyle: 'long' }) : '—');
  d.sectionHeader('Diagnóstico');
  d.field('Tipo de piel', diag.skinType);
  d.field('Alteración y/o condición de piel', diag.alteration);
  d.field('Causas', diag.causes);
  d.field('TX cosmético', diag.cosmeticTx);
  d.field('Pronóstico', diag.prognosis);
  d.field('Costo', diag.cost);
  if (diag.staffName) d.field('Cosmetóloga', diag.staffName);
  return Buffer.from(await d.pdf.save());
}
