// Isolated, synthetic demonstration. No database, credentials or provider calls.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVisualPreview } from '../src/services/skinVisualPreview.js';
const root = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const takenAt = '2026-09-22T20:00:00.000Z';
const photos = [0, 1, 2].map(i => ({ id: 'demo-photo-' + i, takenAt, url: '/assets/skin-demo-frontal.png', description: 'DEMO | modo=image | disparo=' + i }));
let rows = [];
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url, 'http://localhost');
  const send = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: status === 200, data })); };
  try {
    if (url.pathname === '/api/skin-advisor/config') return send({ enabled: true, configured: true, simulation: true, canApprove: false, consentVersion: 'demo', consentText: 'DEMO: imagen sintética, sin clientas reales ni envío a OpenAI.' });
    if (url.pathname === '/api/skin-advisor/records/demo') return send({ record: { id: 'demo', objectives: 'Conocer mi piel y mejorar mi rutina' }, photos, assessments: rows });
    if (req.method === 'POST') {
      let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 64000) return send(null, 413); }
      const body = JSON.parse(text || '{}');
      const previewPhoto = photos.find(p => url.pathname === '/api/skin-advisor/records/demo/photos/' + p.id + '/preview');
      if (previewPhoto) return send({ ...await createVisualPreview(await fs.readFile(path.join(root, 'assets/skin-demo-frontal.png')), body.mode), sourcePhotoId: previewPhoto.id, sourceUrl: previewPhoto.url });
      if (url.pathname === '/api/skin-advisor/records/demo/assessments') {
        if (!body.consentAccepted || !body.whiteLightOriginalConfirmed || !body.photos?.length) return send(null, 400);
        const row = { id: 'demo-' + Date.now(), status: 'draft', version: 1, createdAt: new Date().toISOString(), input: { ...body, photos: body.photos.map(p => ({ ...p, sourceUrl: photos.find(source => source.id === p.id)?.url })) }, provenance: { provider: 'demo-local', model: 'ninguno', simulation: true } };
        rows.unshift(row); return send(row);
      }
      const row = rows.find(r => url.pathname === '/api/skin-advisor/assessments/' + r.id + '/generate');
      if (row) {
        row.status = 'pending_review'; row.version++;
        row.assessment = { summary: 'Ejemplo de presentación. Esta imagen sintética no ha sido analizada.', observations: ['forehead', 'right_cheek', 'chin'].map((zone, i) => ({ areaId: ['A09', 'A08', 'A05'][i], zone, description: 'Observación de demostración, sin valoración real de la piel.', limits: [], evidence: { photoIds: [row.input.photos[0].id] } })), priorities: [{ areaId: 'A09', description: 'Ejemplo: revisar la captura original con la profesional.' }], missingInformation: [], followUpQuestions: [], careDraft: { options: [], education: ['Aquí aparecerán los cuidados sujetos a revisión profesional.'], noProcedureAlternative: 'Sin recomendación en esta demostración.' }, professionalReview: { required: true, reasons: ['No entregar como reporte real.'] }, quality: { limits: ['Imagen sintética y contenido de ejemplo.'], status: 'limited' } };
        return send(row);
      }
      return send(null, 405);
    }
    const row = rows.find(r => url.pathname === '/api/skin-advisor/assessments/' + r.id);
    if (row) return send(row);
    if (url.pathname.startsWith('/api/')) return send(null, 404);
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) && file !== root) return send(null, 403);
    const content = await fs.readFile(file);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(content);
  } catch { if (!res.headersSent) send(null, 400); else res.end(); }
});
server.listen(Number(process.env.PORT || 8131), '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port + '/skin-advisor.html?recordId=demo'));
