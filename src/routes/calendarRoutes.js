// src/routes/calendarRoutes.js
import express from 'express';
const router = express.Router();

import {
    createEvent,
    updateEvent,
    deleteEvent,
} from '../services/googleCalendarService.js';

// OAuth2 service (nueva integración)
import oauthService from '../services/googleCalendarOAuth.js';

// Auth guard (importado del mismo lugar que el resto del servidor)
import { adminAuth } from '../../lib/auth.js';

// ─────────────────────────────────────────────────────────
//  RUTAS OAUTH2 — Conectar Google Calendar a Venus
// ─────────────────────────────────────────────────────────

/**
 * GET /api/admin/calendar/auth
 * Devuelve la URL de autorización de Google. El admin hace clic y
 * es redirigido a Google para conceder acceso.
 */
router.get('/auth', adminAuth, (req, res) => {
    try {
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
            return res.status(503).json({
                success: false,
                error: 'oauth_not_configured',
                message: 'Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en las variables de entorno.',
            });
        }
        const url = oauthService.getAuthUrl();
        res.json({ success: true, authUrl: url });
    } catch (err) {
        console.error('[Calendar /auth]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/admin/calendar/callback?code=...
 * Google redirige aquí después de que el admin autoriza el acceso.
 * Intercambia el code por tokens y los persiste en BD.
 */
router.get('/callback', async (req, res) => {
    const { code, error } = req.query;

    if (error) {
        console.error('[Calendar /callback] Google rechazó la autorización:', error);
        return res.redirect('/admin.html?calendar=error&reason=' + encodeURIComponent(error));
    }

    if (!code) {
        return res.status(400).json({ success: false, error: 'missing_code' });
    }

    try {
        await oauthService.handleCallback(code);
        // Redirigir de vuelta al admin con bandera de éxito
        res.redirect('/admin.html?calendar=connected');
    } catch (err) {
        console.error('[Calendar /callback]', err);
        res.redirect('/admin.html?calendar=error&reason=' + encodeURIComponent(err.message));
    }
});

/**
 * GET /api/admin/calendar/status
 * Devuelve el estado de la conexión OAuth2.
 */
router.get('/status', adminAuth, async (req, res) => {
    try {
        const status = await oauthService.getStatus();
        res.json({ success: true, ...status });
    } catch (err) {
        console.error('[Calendar /status]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/admin/calendar/disconnect
 * Revoca los tokens y desconecta Google Calendar.
 */
router.post('/disconnect', adminAuth, async (req, res) => {
    try {
        await oauthService.disconnect();
        res.json({ success: true, message: 'Google Calendar desconectado correctamente.' });
    } catch (err) {
        console.error('[Calendar /disconnect]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/admin/calendar/sync
 * Re-sincroniza todas las citas activas futuras con Google Calendar.
 */
router.post('/sync', adminAuth, async (req, res) => {
    try {
        const result = await oauthService.syncAllActive();
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Calendar /sync]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────
//  RUTAS LEGACY — Service Account (mantener compatibilidad)
// ─────────────────────────────────────────────────────────

/**
 * Crear evento
 */
router.post("/", async (req, res) => {
    try {
        const { title, description, location, startISO, endISO, attendees } =
            req.body || {};

        if (!title || !startISO || !endISO) {
            return res.status(400).json({
                error: "missing_fields",
                required: ["title", "startISO", "endISO"],
            });
        }

        const eventId = await createEvent({
            title,
            description,
            location,
            startISO,
            endISO,
            attendees,
        });

        return res.json({ success: true, eventId });
    } catch (err) {
        console.error("Error creando evento:", err);
        res.status(500).json({ error: "server_error" });
    }
});

/**
 * Editar evento
 */
router.put("/:eventId", async (req, res) => {
    try {
        const { eventId } = req.params;
        const { title, description, location, startISO, endISO, attendees } =
            req.body || {};

        await updateEvent(eventId, {
            title,
            description,
            location,
            startISO,
            endISO,
            attendees,
        });

        return res.json({ success: true });
    } catch (err) {
        console.error("Error actualizando evento:", err);
        res.status(500).json({ error: "server_error" });
    }
});

/**
 * Eliminar evento
 */
router.delete("/:eventId", async (req, res) => {
    try {
        const { eventId } = req.params;

        await deleteEvent(eventId);

        return res.json({ success: true });
    } catch (err) {
        console.error("Error eliminando evento:", err);
        res.status(500).json({ error: "server_error" });
    }
});

export default router;
