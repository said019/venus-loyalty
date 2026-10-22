import express from 'express';

const ID = /^[A-Za-z0-9_-]{1,128}$/;

export function createSkinClientRouter({ report, access }) {
  const router = express.Router();
  const handle = (ids, fn) => async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    try {
      if (!ids.every(name => typeof req.params[name] === 'string' && ID.test(req.params[name]))) {
        return res.status(400).json({ success: false, error: 'invalid_input' });
      }
      const token = (req.get('authorization') || '').replace(/^Bearer /, '');
      if (!access || !await access.verify(req.params.cardId, token)) {
        return res.status(404).json({ success: false, error: 'not_found' });
      }
      const data = await fn(req);
      if (data == null) return res.status(404).json({ success: false, error: 'not_found' });
      res.json({ success: true, data });
    } catch (error) {
      console.error('[skin-client]', error);
      res.status(500).json({ success: false, error: 'internal_error' });
    }
  };
  router.get('/:cardId/skin-reports', handle(['cardId'], req => report.listForCard(req.params.cardId)));
  router.get('/:cardId/skin-reports/:assessmentId', handle(['cardId', 'assessmentId'], req => report.getForCard(req.params.cardId, req.params.assessmentId)));
  return router;
}
