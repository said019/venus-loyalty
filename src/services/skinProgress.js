import { buildZoneMap, numericScore } from './skinZones.js';

function compare(before, after) {
    const delta = after - before;
    return { before, after, delta, trend: delta >= 5 ? 'mejoró' : delta <= -5 ? 'empeoró' : 'estable' };
}
export function compareAnalyses(current, previous) {
    if (!current || !previous) return null;
    const elapsed = new Date(current.analyzedAt) - new Date(previous.analyzedAt);
    if (!Number.isFinite(elapsed) || elapsed < 0) return null;
    const metrics = (current.scores || []).flatMap(after => {
        const before = (previous.scores || []).find(s => s.metric === after.metric);
        const b = numericScore(before?.score), a = numericScore(after.score);
        return b === null || a === null ? [] : [{ metric: after.metric, labelEs: after.labelEs, ...compare(b, a), beforeImageUrl: before.imageUrl || null, afterImageUrl: after.imageUrl || null }];
    }).sort((a, b) => b.delta - a.delta);
    const oldZones = buildZoneMap(previous.rawResponse).zones;
    const zones = buildZoneMap(current.rawResponse).zones.flatMap(zone => {
        const old = oldZones.find(z => z.key === zone.key);
        const findings = zone.findings.flatMap(item => {
            const before = old?.findings.find(f => f.metric === item.metric);
            return item.score === null || before?.score == null ? [] : [{ metric: item.metric, labelEs: item.labelEs, shared: !!item.shared, ...compare(before.score, item.score) }];
        });
        return findings.length ? [{ key: zone.key, labelEs: zone.labelEs, findings }] : [];
    });
    return { days: Math.floor(elapsed / 86400000), previousDate: previous.analyzedAt, currentDate: current.analyzedAt, metrics, zones };
}

export async function loadSkinProgress(prisma, current, against) {
    if (!current.cardId) return { progress: null, available: [], invalid: !!against };
    const available = await prisma.skinAnalysis.findMany({
        where: { cardId: current.cardId, analyzedAt: { lt: current.analyzedAt } },
        orderBy: [{ analyzedAt: 'desc' }, { id: 'asc' }],
        select: { id: true, analyzedAt: true },
    });
    const selected = against ? available.find(a => a.id === against) : available[0];
    if (!selected) return { progress: null, available, invalid: !!against };
    const previous = await prisma.skinAnalysis.findFirst({
        where: { id: selected.id, cardId: current.cardId, analyzedAt: { lt: current.analyzedAt } },
        include: { scores: true },
    });
    return { progress: compareAnalyses(current, previous), available, selectedId: selected.id, invalid: !previous };
}
