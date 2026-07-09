// src/routes/expedientes.js
// Expedientes digitales: formularios públicos por token + gestión desde el admin.
import express from 'express';
import multer from 'multer';
import { prisma } from '../db/index.js';
import { adminAuth } from '../../lib/auth.js';
import { NotificationsRepo } from '../db/repositories.js';
import { signFichaToken, verifyFichaToken } from '../services/fichaTokens.js';
import { ensureClientFolder, uploadBuffer, isDriveConfigured } from '../services/driveService.js';
import { buildIntakePdf, buildConsentPdf, buildDiagnosisPdf } from '../services/expedientePdf.js';
import { getConsentText } from '../services/consentTexts.js';
import { WhatsAppService } from '../services/whatsapp-v2.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const fail = (res, code, msg) => res.status(code).json({ success: false, error: msg });

async function ensureRecord(cardId) {
  let record = await prisma.clientRecord.findUnique({ where: { cardId } });
  if (!record) record = await prisma.clientRecord.create({ data: { cardId } });
  return record;
}

async function cardFromToken(token, purpose) {
  const { cardId } = verifyFichaToken(token, purpose); // lanza si inválido
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) throw new Error('card_not_found');
  return card;
}

// Sube PDF a Drive y regresa campos para persistir; si Drive falla o no está
// configurado, marca pending para que el cron lo reintente.
async function pushPdfToDrive(card, filename, buffer) {
  if (!isDriveConfigured()) return { pdfDriveFileId: null, pdfWebViewLink: null, driveUploadPending: true };
  try {
    const folderId = await ensureClientFolder(card);
    const up = await uploadBuffer({ folderId, name: filename, mimeType: 'application/pdf', buffer });
    return { pdfDriveFileId: up.id, pdfWebViewLink: up.webViewLink, driveUploadPending: false };
  } catch (e) {
    console.error('[expedientes] Drive falló, queda pendiente:', e.message);
    return { pdfDriveFileId: null, pdfWebViewLink: null, driveUploadPending: true };
  }
}

const fechaHoy = () => new Date().toISOString().slice(0, 10);

/* ================= PÚBLICO (token) ================= */

router.get('/public/ficha/:token', async (req, res) => {
  try {
    const card = await cardFromToken(req.params.token, 'ficha');
    const record = await ensureRecord(card.id);
    let intake = await prisma.intakeForm.findUnique({ where: { recordId: record.id } });
    if (!intake) intake = await prisma.intakeForm.create({ data: { recordId: record.id, fullName: card.name, phone: card.phone } });
    const { signatureClient, signatureStaff, ...safe } = intake;
    res.json({ success: true, card: { name: card.name, phone: card.phone }, intake: safe });
  } catch (e) { return fail(res, 401, 'link_invalido_o_expirado'); }
});

router.put('/public/ficha/:token', async (req, res) => {
  try {
    const card = await cardFromToken(req.params.token, 'ficha');
    const record = await ensureRecord(card.id);
    const intake = await prisma.intakeForm.findUnique({ where: { recordId: record.id } });
    if (!intake) return fail(res, 404, 'ficha_no_iniciada');
    if (intake.status === 'signed') return fail(res, 409, 'ficha_ya_firmada');
    const allowed = ['fullName','birthDate','age','phone','profession','address','socialMedia','referralSource',
      'interestData','skinCondition','conditionSince','previousTreatments','treatmentReactions',
      'questionnaires','routineDay','routineNight','photoConsent'];
    const data = {};
    for (const k of allowed) if (k in req.body) data[k] = req.body[k];
    if ('age' in data && data.age != null) data.age = parseInt(data.age, 10) || null;
    await prisma.intakeForm.update({ where: { id: intake.id }, data });
    res.json({ success: true });
  } catch (e) { return fail(res, 401, 'link_invalido_o_expirado'); }
});

router.post('/public/ficha/:token/submit', async (req, res) => {
  try {
    const card = await cardFromToken(req.params.token, 'ficha');
    const record = await ensureRecord(card.id);
    const intake = await prisma.intakeForm.findUnique({ where: { recordId: record.id } });
    if (!intake) return fail(res, 404, 'ficha_no_iniciada');
    if (intake.status === 'signed') return fail(res, 409, 'ficha_ya_firmada');
    const { signature } = req.body || {};
    if (!signature?.startsWith('data:image/png;base64,')) return fail(res, 400, 'firma_requerida');

    const signed = await prisma.intakeForm.update({
      where: { id: intake.id },
      data: { status: 'signed', signatureClient: signature, signedAt: new Date(), driveUploadPending: true },
    });

    try {
      const pdf = await buildIntakePdf(signed, card);
      const drive = await pushPdfToDrive(card, `Ficha Clínica – ${fechaHoy()}.pdf`, pdf);
      await prisma.intakeForm.update({ where: { id: intake.id }, data: drive });
      if (drive.pdfDriveFileId) {
        await prisma.clientDocument.create({ data: { recordId: record.id, name: `Ficha Clínica – ${fechaHoy()}.pdf`, mimeType: 'application/pdf', driveFileId: drive.pdfDriveFileId, webViewLink: drive.pdfWebViewLink, source: 'generated' } });
      }
    } catch (pdfErr) {
      // La firma ya quedó persistida; el PDF/Drive se reintenta vía cron (driveUploadPending: true).
      console.error('[expedientes] PDF/Drive post-firma falló; queda pendiente:', pdfErr);
    }

    // Denormalizar resumen que el admin ya muestra
    const alergias = signed.interestData?.alergias;
    await prisma.clientRecord.update({
      where: { id: record.id },
      data: {
        age: signed.age ?? undefined,
        allergies: alergias?.value ? (alergias.detail || 'Sí') : alergias ? 'No' : undefined,
      },
    });

    await NotificationsRepo.create({ type: 'cliente', icon: 'clipboard-check', title: 'Ficha clínica completada', message: `${card.name} completó y firmó su ficha clínica`, read: false, entityId: card.id });
    res.json({ success: true });
  } catch (e) {
    console.error('[expedientes] submit ficha:', e);
    return fail(res, 401, 'link_invalido_o_expirado');
  }
});

router.get('/public/consent/:token', async (req, res) => {
  try {
    const card = await cardFromToken(req.params.token, 'consent');
    const record = await ensureRecord(card.id);
    const consent = await prisma.consentDoc.findFirst({ where: { recordId: record.id, type: 'laser-diodo' }, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, card: { name: card.name }, consentText: getConsentText('laser-diodo'), consent: consent ? { status: consent.status, signedAt: consent.signedAt } : null });
  } catch (e) { return fail(res, 401, 'link_invalido_o_expirado'); }
});

router.post('/public/consent/:token/submit', async (req, res) => {
  try {
    const card = await cardFromToken(req.params.token, 'consent');
    const record = await ensureRecord(card.id);
    const { signature } = req.body || {};
    if (!signature?.startsWith('data:image/png;base64,')) return fail(res, 400, 'firma_requerida');
    const existing = await prisma.consentDoc.findFirst({ where: { recordId: record.id, type: 'laser-diodo', status: 'signed' } });
    if (existing) return fail(res, 409, 'consentimiento_ya_firmado');

    const text = getConsentText('laser-diodo');
    const consent = await prisma.consentDoc.create({ data: { recordId: record.id, type: 'laser-diodo', textVersion: text.version, status: 'signed', signatureClient: signature, signedAt: new Date(), driveUploadPending: true } });
    try {
      const pdf = await buildConsentPdf(consent, card);
      const drive = await pushPdfToDrive(card, `Consentimiento Láser – ${fechaHoy()}.pdf`, pdf);
      await prisma.consentDoc.update({ where: { id: consent.id }, data: drive });
      if (drive.pdfDriveFileId) {
        await prisma.clientDocument.create({ data: { recordId: record.id, name: `Consentimiento Láser – ${fechaHoy()}.pdf`, mimeType: 'application/pdf', driveFileId: drive.pdfDriveFileId, webViewLink: drive.pdfWebViewLink, source: 'generated' } });
      }
    } catch (pdfErr) {
      // La firma ya quedó persistida; el PDF/Drive se reintenta vía cron (driveUploadPending: true).
      console.error('[expedientes] PDF/Drive post-firma falló; queda pendiente:', pdfErr);
    }
    await NotificationsRepo.create({ type: 'cliente', icon: 'file-signature', title: 'Consentimiento firmado', message: `${card.name} firmó el consentimiento de depilación láser`, read: false, entityId: card.id });
    res.json({ success: true });
  } catch (e) {
    console.error('[expedientes] submit consent:', e);
    return fail(res, 401, 'link_invalido_o_expirado');
  }
});

/* ================= ADMIN ================= */

router.use(adminAuth);

router.get('/:cardId', async (req, res) => {
  try {
    const card = await prisma.card.findUnique({ where: { id: req.params.cardId } });
    if (!card) return fail(res, 404, 'card_not_found');
    const record = await ensureRecord(card.id);
    const [intake, consents, diagnoses, laserSessions, documents] = await Promise.all([
      prisma.intakeForm.findUnique({ where: { recordId: record.id } }),
      prisma.consentDoc.findMany({ where: { recordId: record.id }, orderBy: { createdAt: 'desc' } }),
      prisma.facialDiagnosis.findMany({ where: { recordId: record.id }, orderBy: { createdAt: 'desc' } }),
      prisma.laserSessionLog.findMany({ where: { recordId: record.id }, orderBy: { date: 'desc' } }),
      prisma.clientDocument.findMany({ where: { recordId: record.id }, orderBy: { uploadedAt: 'desc' } }),
    ]);
    res.json({ success: true, record: { id: record.id, fichaLinkSentAt: record.fichaLinkSentAt }, intake, consents, diagnoses, laserSessions, documents });
  } catch (e) { console.error(e); return fail(res, 500, e.message); }
});

async function sendLink(req, res, purpose) {
  try {
    const card = await prisma.card.findUnique({ where: { id: req.params.cardId } });
    if (!card) return fail(res, 404, 'card_not_found');
    if (!card.phone) return fail(res, 400, 'clienta_sin_telefono');
    const record = await ensureRecord(card.id);
    const token = signFichaToken(card.id, purpose);
    const base = process.env.BASE_URL || 'https://venuscosmetologia.com.mx';
    const url = purpose === 'ficha' ? `${base}/ficha/${token}` : `${base}/consentimiento/${token}`;
    if (purpose === 'ficha') await WhatsAppService.sendFichaClinicaLink(card, url);
    else await WhatsAppService.sendConsentimientoLink(card, url);
    await prisma.clientRecord.update({ where: { id: record.id }, data: { fichaLinkSentAt: new Date() } });
    res.json({ success: true, url });
  } catch (e) { console.error(e); return fail(res, 500, e.message); }
}
router.post('/:cardId/send-ficha', (req, res) => sendLink(req, res, 'ficha'));
router.post('/:cardId/send-consent', (req, res) => sendLink(req, res, 'consent'));

router.put('/:cardId/diagnosis', async (req, res) => {
  try {
    const record = await ensureRecord(req.params.cardId);
    const { id, skinType, alteration, causes, cosmeticTx, prognosis, cost, staffName } = req.body || {};
    const data = { skinType, alteration, causes, cosmeticTx, prognosis, cost, staffName };
    if (id) {
      const existing = await prisma.facialDiagnosis.findUnique({ where: { id } });
      if (!existing || existing.recordId !== record.id) return fail(res, 404, 'diagnostico_no_encontrado');
    }
    const diag = id
      ? await prisma.facialDiagnosis.update({ where: { id }, data })
      : await prisma.facialDiagnosis.create({ data: { recordId: record.id, ...data } });
    res.json({ success: true, diagnosis: diag });
  } catch (e) { console.error(e); return fail(res, 500, e.message); }
});

router.post('/:cardId/diagnosis/:id/pdf', async (req, res) => {
  try {
    const card = await prisma.card.findUnique({ where: { id: req.params.cardId } });
    const record = await ensureRecord(card.id);
    const diag = await prisma.facialDiagnosis.findUnique({ where: { id: req.params.id } });
    if (!diag || diag.recordId !== record.id) return fail(res, 404, 'diagnostico_no_encontrado');
    const pdf = await buildDiagnosisPdf(diag, card);
    const drive = await pushPdfToDrive(card, `Diagnóstico Facial – ${fechaHoy()}.pdf`, pdf);
    await prisma.facialDiagnosis.update({ where: { id: diag.id }, data: { pdfDriveFileId: drive.pdfDriveFileId, pdfWebViewLink: drive.pdfWebViewLink } });
    if (drive.pdfDriveFileId) {
      await prisma.clientDocument.create({ data: { recordId: record.id, name: `Diagnóstico Facial – ${fechaHoy()}.pdf`, mimeType: 'application/pdf', driveFileId: drive.pdfDriveFileId, webViewLink: drive.pdfWebViewLink, source: 'generated' } });
    }
    res.json({ success: true, webViewLink: drive.pdfWebViewLink, pending: drive.driveUploadPending });
  } catch (e) { console.error(e); return fail(res, 500, e.message); }
});

router.post('/:cardId/laser-sessions', async (req, res) => {
  try {
    const record = await ensureRecord(req.params.cardId);
    const { date, staffName, zone, frequency, fluence, laserIntensity, observations } = req.body || {};
    const session = await prisma.laserSessionLog.create({ data: { recordId: record.id, date: date ? new Date(date) : new Date(), staffName, zone, frequency, fluence, laserIntensity, observations } });
    res.json({ success: true, session });
  } catch (e) { console.error(e); return fail(res, 500, e.message); }
});

router.put('/:cardId/laser-sessions/:id', async (req, res) => {
  try {
    const record = await ensureRecord(req.params.cardId);
    const existing = await prisma.laserSessionLog.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.recordId !== record.id) return fail(res, 404, 'sesion_no_encontrada');
    const { date, staffName, zone, frequency, fluence, laserIntensity, observations } = req.body || {};
    const session = await prisma.laserSessionLog.update({ where: { id: req.params.id }, data: { date: date ? new Date(date) : undefined, staffName, zone, frequency, fluence, laserIntensity, observations } });
    res.json({ success: true, session });
  } catch (e) { console.error(e); return fail(res, 500, e.message); }
});

router.delete('/:cardId/laser-sessions/:id', async (req, res) => {
  try {
    const record = await ensureRecord(req.params.cardId);
    const result = await prisma.laserSessionLog.deleteMany({ where: { id: req.params.id, recordId: record.id } });
    if (result.count === 0) return fail(res, 404, 'sesion_no_encontrada');
    res.json({ success: true });
  }
  catch (e) { console.error(e); return fail(res, 500, e.message); }
});

router.post('/:cardId/documents', upload.array('files', 10), async (req, res) => {
  try {
    const card = await prisma.card.findUnique({ where: { id: req.params.cardId } });
    if (!card) return fail(res, 404, 'card_not_found');
    if (!isDriveConfigured()) return fail(res, 503, 'drive_no_configurado');
    const record = await ensureRecord(card.id);
    const folderId = await ensureClientFolder(card);
    const saved = [];
    for (const f of req.files || []) {
      const up = await uploadBuffer({ folderId, name: f.originalname, mimeType: f.mimetype, buffer: f.buffer });
      saved.push(await prisma.clientDocument.create({ data: { recordId: record.id, name: f.originalname, mimeType: f.mimetype, driveFileId: up.id, webViewLink: up.webViewLink, source: 'scan-import', sizeBytes: f.size } }));
    }
    res.json({ success: true, documents: saved });
  } catch (e) { console.error(e); return fail(res, 500, e.message); }
});

router.delete('/:cardId/documents/:docId', async (req, res) => {
  try {
    const record = await ensureRecord(req.params.cardId);
    const result = await prisma.clientDocument.deleteMany({ where: { id: req.params.docId, recordId: record.id } });
    if (result.count === 0) return fail(res, 404, 'documento_no_encontrado');
    res.json({ success: true });
  }
  catch (e) { console.error(e); return fail(res, 500, e.message); }
});

export default router;
