// src/routes/skinAnalysis.js — Endpoints para análisis de piel (Yiyuan Analyzer)
//
// Rutas montadas en /api/skin-analysis
//   POST   /import              { shareId|shareUrl, cardId?, clientPhone?, clientName? }
//   GET    /:id                 - detalle con scores e imágenes
//   GET    /by-card/:cardId     - historial del cliente
//   GET    /                    - lista paginada (admin)
//   DELETE /:id                 - borra análisis

import express from 'express';
import { prisma } from '../db/index.js';
import { adminAuth } from '../../lib/auth.js';
import {
    fetchYiyuanShareDetail,
    extractShareId,
    YiyuanApiError,
} from '../services/yiyuan.js';
import { normalizeYiyuanResponse } from '../services/skinNormalizer.js';
import { compactForAI } from '../services/ai/compactAnalysis.js';
import { generateNarrativeSafe } from '../services/ai/claudeNarrative.js';

const router = express.Router();
router.use(adminAuth);

/**
 * POST /api/skin-analysis/import
 * Body: { shareId?, shareUrl?, cardId?, clientPhone?, clientName? }
 *
 * - Si llega cardId, vincula al Card y copia name/phone del Card.
 * - Si no, usa clientPhone + clientName del body (análisis sin tarjeta).
 * - Si un análisis con el mismo shareId ya existe, lo actualiza (idempotente).
 */
router.post('/import', async (req, res) => {
    try {
        const { shareId: rawShareId, shareUrl, cardId, clientPhone, clientName } = req.body || {};

        // 1. Extraer shareId
        const shareId = rawShareId
            ? extractShareId(rawShareId)
            : shareUrl
                ? extractShareId(shareUrl)
                : null;

        if (!shareId) {
            return res.status(400).json({
                success: false,
                error: 'No pude extraer shareId. Manda shareId o shareUrl válidos.',
            });
        }

        // 2. Resolver cliente (Card o datos sueltos)
        let card = null;
        let resolvedName = clientName;
        let resolvedPhone = clientPhone;

        if (cardId) {
            card = await prisma.card.findUnique({ where: { id: cardId } });
            if (!card) {
                return res.status(404).json({ success: false, error: 'Card no encontrada' });
            }
            resolvedName = card.name;
            resolvedPhone = card.phone;
        }

        if (!resolvedName) {
            return res.status(400).json({
                success: false,
                error: 'Falta clientName (o cardId válido)',
            });
        }

        // 3. Descargar reporte de Yiyuan
        let raw;
        try {
            raw = await fetchYiyuanShareDetail(shareId);
        } catch (err) {
            if (err instanceof YiyuanApiError) {
                console.warn('[SkinAnalysis] Yiyuan error:', err.message);
                return res.status(err.status || 502).json({
                    success: false,
                    error: err.message,
                    code: err.code,
                });
            }
            throw err;
        }

        // 4. Normalizar
        const normalized = normalizeYiyuanResponse(raw);

        // 5. Persistir (upsert por shareId — idempotente)
        const analysis = await prisma.skinAnalysis.upsert({
            where: { yiyuanShareId: shareId },
            create: {
                cardId: card?.id || null,
                clientPhone: resolvedPhone || normalized.client.mobile || null,
                clientName: resolvedName,
                yiyuanShareId: shareId,
                yiyuanAnalysisId: normalized.yiyuanAnalysisId
                    ? BigInt(normalized.yiyuanAnalysisId)
                    : null,
                analyzedAt: new Date(normalized.analyzedAt),
                locale: normalized.locale,
                ageReal: normalized.client.ageReal,
                ageBiological: normalized.client.ageBiological,
                sex: normalized.client.sex,
                skinType: normalized.client.skinType || null,
                skinColor: normalized.client.skinColor || null,
                ita: normalized.client.ita,
                overallScore: normalized.overallScore || null,
                appearanceScore: normalized.appearance,
                faceShape: normalized.faceShape || null,
                goldenTriangle: normalized.goldenTriangle,
                rawResponse: normalized.rawResponse,
            },
            update: {
                // Re-importar refresca los campos derivados pero preserva vínculos
                analyzedAt: new Date(normalized.analyzedAt),
                ageReal: normalized.client.ageReal,
                ageBiological: normalized.client.ageBiological,
                sex: normalized.client.sex,
                skinType: normalized.client.skinType || null,
                skinColor: normalized.client.skinColor || null,
                ita: normalized.client.ita,
                overallScore: normalized.overallScore || null,
                appearanceScore: normalized.appearance,
                faceShape: normalized.faceShape || null,
                goldenTriangle: normalized.goldenTriangle,
                rawResponse: normalized.rawResponse,
                ...(card ? { cardId: card.id, clientPhone: card.phone, clientName: card.name } : {}),
            },
        });

        // 6. Reemplazar scores (delete + insert en transacción)
        await prisma.$transaction([
            prisma.skinAnalysisScore.deleteMany({ where: { analysisId: analysis.id } }),
            prisma.skinAnalysisScore.createMany({
                data: normalized.metrics.map((m) => ({
                    analysisId: analysis.id,
                    metric: m.key,
                    labelEs: m.labelEs,
                    score: m.score,
                    level: m.level,
                    count: m.count,
                    severity: m.severity,
                    imageUrl: m.imageUrl,
                })),
            }),
        ]);

        // 7. Reemplazar imágenes
        await prisma.$transaction([
            prisma.skinAnalysisImage.deleteMany({ where: { analysisId: analysis.id } }),
            prisma.skinAnalysisImage.createMany({
                data: normalized.images.map((img) => ({
                    analysisId: analysis.id,
                    imageType: img.type,
                    labelEs: img.labelEs,
                    originalUrl: img.url,
                })),
            }),
        ]);

        // 8. Narrativa IA (no bloquea si falla — devuelve null)
        const compact = compactForAI(normalized);
        const narrative = await generateNarrativeSafe(compact);

        if (narrative) {
            await prisma.skinAnalysis.update({
                where: { id: analysis.id },
                data: {
                    aiSummaryEs: narrative.summary,
                    aiRecommendations: narrative,
                    treatmentSuggestions: narrative.recommendations,
                },
            });
        }

        // 9. Top concerns para el response
        const topConcerns = normalized.metrics
            .filter((m) => m.severity === 'critical' || m.severity === 'concern')
            .sort((a, b) => a.score - b.score)
            .slice(0, 3)
            .map((m) => ({ key: m.key, label: m.labelEs, score: m.score, severity: m.severity }));

        console.log(`✅ [SkinAnalysis] Importado ${shareId} para ${resolvedName}${narrative ? ' (con narrativa IA)' : ''}`);

        return res.json({
            success: true,
            analysisId: analysis.id,
            shareId,
            narrativeGenerated: !!narrative,
            summary: {
                client: normalized.client,
                overallScore: normalized.overallScore,
                skinType: normalized.client.skinType,
                topConcerns,
                metricsCount: normalized.metrics.length,
                imagesCount: normalized.images.length,
            },
        });
    } catch (err) {
        console.error('[SkinAnalysis /import] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/skin-analysis/:id
 * Devuelve el análisis con scores e imágenes embebidos.
 */
router.get('/:id', async (req, res) => {
    try {
        const analysis = await prisma.skinAnalysis.findUnique({
            where: { id: req.params.id },
            include: {
                scores: { orderBy: { score: 'asc' } },
                images: { orderBy: { createdAt: 'asc' } },
                card: { select: { id: true, name: true, phone: true, email: true, birthday: true } },
            },
        });

        if (!analysis) {
            return res.status(404).json({ success: false, error: 'Análisis no encontrado' });
        }

        // BigInt no serializa nativo en JSON
        const serialized = {
            ...analysis,
            yiyuanAnalysisId: analysis.yiyuanAnalysisId ? String(analysis.yiyuanAnalysisId) : null,
        };

        return res.json({ success: true, data: serialized });
    } catch (err) {
        console.error('[SkinAnalysis /:id] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/skin-analysis/by-card/:cardId
 * Historial completo del cliente, sin scores pesados (solo metadata + top concerns).
 */
router.get('/by-card/:cardId', async (req, res) => {
    try {
        const analyses = await prisma.skinAnalysis.findMany({
            where: { cardId: req.params.cardId },
            orderBy: { analyzedAt: 'desc' },
            select: {
                id: true,
                analyzedAt: true,
                overallScore: true,
                appearanceScore: true,
                skinType: true,
                skinColor: true,
                ageReal: true,
                ageBiological: true,
                scores: {
                    where: { severity: { in: ['critical', 'concern'] } },
                    orderBy: { score: 'asc' },
                    take: 3,
                    select: { metric: true, labelEs: true, score: true, severity: true },
                },
            },
        });

        return res.json({ success: true, data: analyses });
    } catch (err) {
        console.error('[SkinAnalysis /by-card] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/skin-analysis?phone=...&limit=50
 * Lista paginada. Útil para admin.
 */
router.get('/', async (req, res) => {
    try {
        const { phone, limit = 50, offset = 0 } = req.query;
        const take = Math.min(parseInt(limit, 10) || 50, 200);
        const skip = parseInt(offset, 10) || 0;

        const where = phone ? { clientPhone: { contains: String(phone) } } : {};

        const [items, total] = await Promise.all([
            prisma.skinAnalysis.findMany({
                where,
                orderBy: { analyzedAt: 'desc' },
                take,
                skip,
                select: {
                    id: true,
                    clientName: true,
                    clientPhone: true,
                    cardId: true,
                    analyzedAt: true,
                    overallScore: true,
                    skinType: true,
                    skinColor: true,
                },
            }),
            prisma.skinAnalysis.count({ where }),
        ]);

        return res.json({ success: true, data: items, total, limit: take, offset: skip });
    } catch (err) {
        console.error('[SkinAnalysis /] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/skin-analysis/:id/regenerate-narrative
 * Regenera la narrativa IA desde el rawResponse guardado. Útil cuando se
 * cambia el menú Venus, se afina el prompt, o el admin quiere otra versión.
 */
router.post('/:id/regenerate-narrative', async (req, res) => {
    try {
        const existing = await prisma.skinAnalysis.findUnique({
            where: { id: req.params.id },
            select: { id: true, rawResponse: true },
        });
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Análisis no encontrado' });
        }

        // Re-normalizar desde el raw guardado
        const normalized = normalizeYiyuanResponse(existing.rawResponse);
        const compact = compactForAI(normalized);
        const narrative = await generateNarrativeSafe(compact);

        if (!narrative) {
            return res.status(502).json({
                success: false,
                error: 'IA no disponible o error generando narrativa (revisa logs del server)',
            });
        }

        await prisma.skinAnalysis.update({
            where: { id: existing.id },
            data: {
                aiSummaryEs: narrative.summary,
                aiRecommendations: narrative,
                treatmentSuggestions: narrative.recommendations,
            },
        });

        return res.json({ success: true, narrative });
    } catch (err) {
        console.error('[SkinAnalysis /regenerate-narrative] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * DELETE /api/skin-analysis/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        await prisma.skinAnalysis.delete({ where: { id: req.params.id } });
        return res.json({ success: true });
    } catch (err) {
        if (err.code === 'P2025') {
            return res.status(404).json({ success: false, error: 'Análisis no encontrado' });
        }
        console.error('[SkinAnalysis DELETE] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
