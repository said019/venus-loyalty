import express from 'express';
import { SkinWorkflowError } from '../services/ai/skinAdvisor/workflow.js';

export function createSkinAdvisorRouter({ workflow, authenticate, expectedOrigin }) {
  if (typeof authenticate !== 'function') throw new TypeError('authenticate is required');
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.use(authenticate);
  router.use((req, res, next) => {
    if (!req.admin?.uid) return res.status(401).json({ success: false, error: 'unauthenticated' });
    const writes = req.method !== 'GET' && req.method !== 'HEAD';
    if (writes || req.get('origin')) {
      let validOrigin = false;
      try { validOrigin = typeof expectedOrigin === 'string' && new URL(expectedOrigin).origin === expectedOrigin && req.get('origin') === expectedOrigin; } catch { /* fail closed */ }
      if (!validOrigin) return res.status(403).json({ success: false, error: 'invalid_origin' });
      if (writes && !req.is('application/json')) return res.status(415).json({ success: false, error: 'json_required' });
    }
    next();
  });
  router.use(express.json({ limit: '64kb' }));
  router.use((req, res, next) => {
    if (req.method === 'POST' && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return res.status(400).json({ success: false, error: 'invalid_input' });
    if (req.method === 'POST' && Buffer.byteLength(JSON.stringify(req.body)) > 64 * 1024) return res.status(413).json({ success: false, error: 'body_too_large' });
    next();
  });
  const handle = fn => async (req, res) => {
    try { res.json({ success: true, data: await fn(req) }); }
    catch (error) { res.status(error instanceof SkinWorkflowError ? error.status : 500).json({ success: false, error: error instanceof SkinWorkflowError ? error.code : 'internal_error' }); }
  };
  router.get('/config', handle(req => workflow.getConfig(req.admin.uid)));
  router.get('/records/:recordId', handle(req => workflow.getRecord(req.admin.uid, req.params.recordId)));
  router.post('/records/:recordId/photos/:photoId/preview', handle(req => workflow.previewPhoto(req.admin.uid, req.params.recordId, req.params.photoId, req.body)));
  router.post('/records/:recordId/assessments', handle(req => workflow.createDraft(req.admin.uid, req.params.recordId, req.body)));
  router.get('/assessments/:id', handle(req => workflow.getAssessment(req.admin.uid, req.params.id)));
  router.post('/assessments/:id/generate', handle(req => workflow.generate(req.admin.uid, req.params.id, req.body)));
  router.post('/assessments/:id/approve', handle(req => workflow.approve(req.admin.uid, req.params.id, req.body)));
  router.use((error, req, res, next) => res.status(error.type === 'entity.too.large' ? 413 : 400).json({ success: false, error: 'invalid_json' }));
  return router;
}
