// src/routes/calendarRoutes.js
import express from 'express';
const router = express.Router();

import {
    createEvent,
    updateEvent,
    deleteEvent,
} from '../services/googleCalendarService.js';

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
