// Lo que la clienta ve de su reporte de piel aprobado, por tarjeta.
// Solo lectura. Nunca expone respuestas, paciente, procedencia, notas internas ni conteos.
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const VISIBLE_STATUS = ['approved', 'superseded'];
const MODES = ['image', 'image_positive', 'image_negative', 'image_uv', 'image_woods', 'image_blue'];
const WINDOW_MS = 10 * 60 * 1000;
const MAX_LIST = 12;
const MAX_PHOTOS = 24;

const validId = id => typeof id === 'string' && ID_RE.test(id);
const iso = value => {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};
const asArray = value => (Array.isArray(value) ? value : []);

// Misma lectura que public/skin-report-data.js (archivo de navegador, no importable).
function modeOf(photo) {
  const match = /(?:^|\|)\s*modo=([a-z_]+)/.exec((photo && photo.description) || '');
  return match && MODES.includes(match[1]) ? match[1] : 'unknown';
}

function isVisible(row) {
  return Boolean(row && row.approval && typeof row.approval === 'object' && !row.retiredAt);
}

function buildPhotos(row, catalog) {
  const selected = asArray(row.input && row.input.photos);
  const anchors = selected.map(p => Date.parse(p.sourceTakenAt || p.capturedAt)).filter(Number.isFinite);
  const photos = selected.map(p => ({ id: p.id, url: p.sourceUrl, mode: 'image', takenAt: iso(p.sourceTakenAt || p.capturedAt), analyzed: true }));
  for (const p of catalog) {
    const time = Date.parse(p.takenAt);
    if (modeOf(p) === 'unknown' || !Number.isFinite(time) || photos.some(item => item.id === p.id)) continue;
    if (!anchors.some(anchor => Math.abs(anchor - time) <= WINDOW_MS)) continue;
    photos.push({ id: p.id, url: p.url, mode: modeOf(p), takenAt: iso(p.takenAt), analyzed: false });
  }
  return photos.slice(0, MAX_PHOTOS);
}

export function createSkinClientReport({ prisma, clock = () => new Date() } = {}) {
  void clock;

  async function layersFor(recordId, photos) {
    const ids = photos.filter(p => p.analyzed).map(p => p.id);
    if (!ids.length) return {};
    const sets = await prisma.skinLayerSet.findMany({ where: { recordId, sourcePhotoId: { in: ids } }, orderBy: { createdAt: 'desc' } });
    const layers = {};
    for (const set of sets) { // ya vienen del más reciente al más antiguo
      if (layers[set.sourcePhotoId]) continue;
      layers[set.sourcePhotoId] = asArray(set.images).map(image => ({ key: image.key, url: image.url }));
    }
    return layers;
  }

  async function capturesOf(row, catalog) {
    const photos = buildPhotos(row, catalog);
    return { photos, layers: await layersFor(row.recordId, photos) };
  }

  async function listForCard(cardId) {
    if (!validId(cardId)) return null;
    const card = await prisma.card.findUnique({ where: { id: cardId }, select: { id: true, name: true, phone: true } });
    if (!card) return null;
    const record = await prisma.clientRecord.findUnique({ where: { cardId } });
    const venus = record
      ? (await prisma.skinAdvisorAssessment.findMany({ where: { recordId: record.id, status: { in: VISIBLE_STATUS }, retiredAt: null } }))
        .filter(isVisible)
        .map(row => ({ kind: 'venus', id: row.id, date: iso(row.approval.approvedAt), href: `/mi-piel.html?card=${cardId}&v=${row.id}` }))
        .filter(item => item.date)
      : [];
    const rows = await prisma.skinAnalysis.findMany({
      where: { OR: [{ cardId: card.id }, ...(card.phone ? [{ clientPhone: card.phone }] : [])] },
      orderBy: { analyzedAt: 'desc' },
      take: MAX_LIST,
      select: { id: true, analyzedAt: true, overallScore: true, skinType: true, ageBiological: true },
    });
    const imported = rows.map(row => ({
      kind: 'imported', id: row.id, date: iso(row.analyzedAt), href: `/skin-report.html?view=${row.id}`,
      overallScore: row.overallScore, skinType: row.skinType, ageBiological: row.ageBiological,
    }));
    return [...venus, ...imported].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, MAX_LIST);
  }

  async function getForCard(cardId, assessmentId) {
    if (!validId(cardId) || !validId(assessmentId)) return null;
    const card = await prisma.card.findUnique({ where: { id: cardId }, select: { id: true, name: true, phone: true } });
    if (!card) return null;
    const record = await prisma.clientRecord.findUnique({ where: { cardId } });
    if (!record) return null;
    const row = await prisma.skinAdvisorAssessment.findUnique({ where: { id: assessmentId } });
    if (!row || row.recordId !== record.id || !isVisible(row)) return null;

    const catalog = await prisma.clientPhoto.findMany({ where: { recordId: record.id }, orderBy: { takenAt: 'desc' } });
    const approval = row.approval;
    const result = approval.correctedAssessment || row.assessment || {};
    const { photos, layers } = await capturesOf(row, catalog);

    const approvedAt = iso(approval.approvedAt);
    const others = await prisma.skinAdvisorAssessment.findMany({ where: { recordId: record.id, retiredAt: null } });
    const prior = others
      .filter(o => o.id !== row.id && isVisible(o) && iso(o.approval.approvedAt) && Date.parse(o.approval.approvedAt) < Date.parse(approvedAt))
      .sort((a, b) => Date.parse(b.approval.approvedAt) - Date.parse(a.approval.approvedAt))[0];
    let previous = null;
    if (prior) {
      const captures = await capturesOf(prior, catalog);
      previous = { id: prior.id, approvedAt: iso(prior.approval.approvedAt), photos: captures.photos, layers: captures.layers, zoneProgress: prior.approval.zoneProgress ?? null };
    }

    return {
      id: row.id,
      approvedAt,
      clientName: String(card.name || '').trim().split(/\s+/)[0] || '',
      summary: result.summary ?? '',
      observations: asArray(result.observations).map(o => ({ zone: o.zone, areaId: o.areaId, description: o.description })),
      pendingToConfirm: asArray(result.missingInformation).filter(item => typeof item === 'string'),
      photos,
      layers,
      plan: approval.plan ?? [],
      homeRoutine: approval.homeRoutine ?? null,
      nextVisitWeek: approval.nextVisitWeek ?? null,
      zoneProgress: approval.zoneProgress ?? null,
      previous,
    };
  }

  return { listForCard, getForCard };
}
