// Read-only UI review. No provider calls, approvals, uploads or database writes.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !process.env.REVIEW_RECORD_ID) throw new Error('DATABASE_URL and REVIEW_RECORD_ID required');
const prisma = new PrismaClient();
let photos;
try {
  photos = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    return tx.clientPhoto.findMany({ where: { recordId: process.env.REVIEW_RECORD_ID }, select: { url: true, takenAt: true, description: true, area: true }, orderBy: { takenAt: 'desc' } });
  });
} finally { await prisma.$disconnect(); }
photos = photos.map((p, i) => ({ ...p, id: 'review-photo-' + i }));
const photo = photos.find(p => /modo=image\s*\|/.test(p.description || ''));
if (!photo) throw new Error('No white-light native capture available');
const row = {
  id: 'review-assessment', status: 'pending_review', createdAt: photo.takenAt, version: 2,
  provenance: { simulation: true, provider: 'offline-ui-test', model: 'none' },
  input: { photos: [{ id: photo.id, sourceUrl: photo.url, zone: 'full_face', orientation: 'upright', lateralityResolved: true, capturedAt: photo.takenAt }] },
  assessment: {
    summary: 'Prueba de interfaz. Esta fotografia no ha sido analizada; no hay conclusiones sobre la piel.',
    observations: [{ zone: 'forehead', description: 'Zona de prueba, sin interpretacion clinica.', evidence: { photoIds: [photo.id] }, limits: ['Simulacion de interfaz.'] }],
    priorities: [], missingInformation: [], followUpQuestions: [],
    careDraft: { options: [], education: [], noProcedureAlternative: 'Sin recomendacion: prueba visual.' },
    professionalReview: { required: true, reasons: ['No entregar como valoracion real.'] },
    quality: { limits: ['Prueba visual, no analisis.'], status: 'limited' },
  },
};
const root = fileURLToPath(new URL('../public/', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
http.createServer(async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    const url = new URL(req.url, 'http://localhost');
    let data;
    if (url.pathname === '/api/skin-advisor/config') data = { enabled: false, configured: false, simulation: true, canApprove: false, consentText: 'Simulacion, sin envio a terceros.' };
    if (url.pathname === '/api/skin-advisor/records/review') data = { record: { id: 'review' }, photos, assessments: [row] };
    if (url.pathname === '/api/skin-advisor/assessments/review-assessment') data = row;
    if (data) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success: true, data })); return; }
    if (url.pathname.startsWith('/api/')) { res.writeHead(404).end(); return; }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const content = await fs.readFile(file);
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(content);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
}).listen(8129, '127.0.0.1', () => console.log('Local UI simulation: http://127.0.0.1:8129/skin-advisor.html?recordId=review'));
