import express from 'express';
import { ClientsController, ServicesController, AppointmentsController } from '../controllers/index.js';
import { adminAuth } from '../../lib/auth.js';

const router = express.Router();

// Clients
router.post('/clients', adminAuth, ClientsController.createOrUpdate);

// Services
router.get('/services', ServicesController.getAll);
router.post('/services', adminAuth, ServicesController.create);
router.put('/services/:id', adminAuth, ServicesController.update);
router.delete('/services/:id', adminAuth, ServicesController.delete);

// Appointments
// NOTA: Todas las rutas de appointments ahora están definidas en server.js con Prisma
// Comentadas para evitar duplicados y conflictos con las rutas refactorizadas
// router.post('/appointments', adminAuth, AppointmentsController.create);
// router.get('/appointments/month', adminAuth, AppointmentsController.getByMonth);
router.get('/appointments/client', adminAuth, AppointmentsController.getByClient);
// router.patch('/appointments/:id/cancel', adminAuth, AppointmentsController.cancel);
// router.patch('/appointments/:id', adminAuth, AppointmentsController.update);
// router.get('/appointments', adminAuth, AppointmentsController.getByDate);
// Nota: GET /appointments/:id, POST /appointments/:id/payment, PATCH /appointments/:id/status
// y PATCH /appointments/:id/cancel están definidos en server.js con lógica más completa

// Debug: Ver citas pendientes de recordatorio
router.get('/debug/pending-reminders', async (req, res) => {
    try {
        const { AppointmentModel } = await import('../models/index.js');
        const now = new Date();

        // Helper para convertir a ISO con offset de México (-06:00)
        const toMexicoCityISO = (date) => {
            const ts = date.getTime();
            const mexicoOffset = 6 * 60 * 60 * 1000;
            const localDate = new Date(ts - mexicoOffset);
            return localDate.toISOString().replace('Z', '-06:00');
        };

        // Rango 24h
        const date24hStart = new Date(now.getTime() + 23.5 * 60 * 60 * 1000);
        const date24hEnd = new Date(now.getTime() + 24.5 * 60 * 60 * 1000);
        const start24h = toMexicoCityISO(date24hStart);
        const end24h = toMexicoCityISO(date24hEnd);

        // Rango 2h
        const date2hStart = new Date(now.getTime() + 1.5 * 60 * 60 * 1000);
        const date2hEnd = new Date(now.getTime() + 2.5 * 60 * 60 * 1000);
        const start2h = toMexicoCityISO(date2hStart);
        const end2h = toMexicoCityISO(date2hEnd);

        const pending24h = await AppointmentModel.getPendingReminders('send24h', start24h, end24h);
        const pending2h = await AppointmentModel.getPendingReminders('send2h', start2h, end2h);

        res.json({
            success: true,
            now: now.toISOString(),
            ranges: {
                '24h': { start: start24h, end: end24h },
                '2h': { start: start2h, end: end2h }
            },
            pending: {
                '24h': pending24h,
                '2h': pending2h
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Debug: Forzar envío de recordatorio
router.post('/debug/send-reminder/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.body; // '24h' o '2h'

        const { firestore } = await import('../db/compat.js');
        const { WhatsAppService } = await import('../services/whatsapp.js');
        const { AppointmentModel } = await import('../models/index.js');

        const doc = await firestore.collection('appointments').doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({ success: false, error: 'Cita no encontrada' });
        }

        const appt = { id: doc.id, ...doc.data() };

        let result;
        if (type === '2h') {
            result = await WhatsAppService.sendReminder2h(appt);
        } else {
            result = await WhatsAppService.sendReminder24h(appt);
        }

        if (result.success) {
            await AppointmentModel.markReminderSent(id, type);
        }

        res.json({ success: result.success, result, appointment: appt });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
